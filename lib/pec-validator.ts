import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import catalog from "@/config/tool-catalog.json";
import { executeReadOnlyQuery } from "@/lib/pec";

type ToolMeta = {
  id: string;
  sql: string;
  parameters: string[];
  municipalityScoped?: boolean;
};

export type PecToolValidation = {
  id: string;
  status: "compatible" | "error";
  error: string | null;
};

const saude360Domains = [
  { domain: "atendimento_individual", candidates: ["tb_fat_atendimento_individual"] },
  { domain: "visita_domiciliar", candidates: ["tb_fat_visita_domiciliar", "tb_fat_visita_domiciliar_territorio"] },
  { domain: "vacinacao", candidates: ["tb_fat_vacinacao"] },
  { domain: "procedimento", candidates: ["tb_fat_proced_atend_proced", "tb_fat_procedimento"] },
  { domain: "problema_condicao", candidates: ["tb_cidadao_problema", "tb_problema", "tb_prontuario"] },
  { domain: "saude_bucal", candidates: ["tb_fat_atendimento_odonto", "tb_fat_atendimento_odonto_proced"] },
  { domain: "atividade_coletiva", candidates: ["tb_fat_atividade_coletiva", "tb_fat_atividade_coletiva_participante"] },
  { domain: "atendimento_compartilhado", candidates: ["tb_fat_atendimento_individual", "tb_fat_atividade_coletiva"] },
  { domain: "equipe_emulti", candidates: ["tb_dim_equipe", "tb_equipe", "tb_lotacao"] },
  { domain: "dimensao_cbo", candidates: ["tb_dim_cbo"] },
  { domain: "dimensao_equipe", candidates: ["tb_dim_equipe", "tb_equipe"] },
  { domain: "vinculacao", candidates: ["tb_cidadao_vinculacao_equipe"] },
  { domain: "cidadao_pec", candidates: ["tb_fat_cidadao_pec", "tb_cidadao"] },
  { domain: "dimensao_tempo", candidates: ["tb_dim_tempo"] },
] as const;

export async function inspectSaude360Schema(municipalityId: string) {
  const candidates = [...new Set(saude360Domains.flatMap((item) => item.candidates))];
  // Evita parâmetro text[]: algumas instalações/roles do PEC falham ao
  // preparar consultas de catálogo com arrays, embora as tools homologadas funcionem.
  // Os nomes abaixo são constantes internas, nunca entrada do usuário.
  const candidateList = candidates.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");
  const rows = await executeReadOnlyQuery(
    municipalityId,
    `SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (${candidateList})
      GROUP BY table_name
      ORDER BY table_name`,
  );
  const found = new Map(rows.map((row) => [String(row.table_name), Array.isArray(row.columns) ? row.columns : []]));
  return saude360Domains.map((item) => {
    const tables = item.candidates.filter((table) => found.has(table));
    return {
      domain: item.domain,
      status: tables.length ? "found" : "missing",
      tables: tables.map((table) => ({ table, columns: found.get(table) })),
      candidates: item.candidates,
    };
  });
}

function validationValues(parameters: string[]): Array<string | null> {
  return parameters.map((parameter) => parameter === "logradouro" ? "RUA" : null);
}

function safeDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export async function validatePecToolCatalog(municipalityId: string, municipalityIbgeCode: string) {
  const results: PecToolValidation[] = [];

  for (const tool of catalog.tools as ToolMeta[]) {
    try {
      const sqlTemplate = await readFile(path.join(process.cwd(), tool.sql), "utf8");
      const values = validationValues(tool.parameters);
      const sql = tool.municipalityScoped
        ? sqlTemplate.replaceAll("{{MUNICIPALITY_IBGE}}", `$${values.length + 1}`)
        : sqlTemplate;
      if (tool.municipalityScoped) values.push(municipalityIbgeCode);
      await executeReadOnlyQuery(
        municipalityId,
        `EXPLAIN (FORMAT JSON) ${sql}`,
        values,
      );
      results.push({ id: tool.id, status: "compatible", error: null });
    } catch (error) {
      results.push({ id: tool.id, status: "error", error: safeDatabaseError(error) });
    }
  }

  let saude360Schema;
  try {
    saude360Schema = await inspectSaude360Schema(municipalityId);
  } catch (error) {
    saude360Schema = [{ domain: "schema_inspection", status: "error", error: safeDatabaseError(error) }];
  }

  return {
    compatible: results.every((item) => item.status === "compatible"),
    checkedAt: new Date().toISOString(),
    results,
    saude360Schema,
    c2Readiness: (() => {
      const byDomain = new Map(saude360Schema.map((item: any) => [item.domain, item]));
      const required = ["atendimento_individual", "visita_domiciliar", "vacinacao", "vinculacao", "cidadao_pec", "dimensao_tempo"];
      const missing = required.filter((domain) => byDomain.get(domain)?.status !== "found");
      return {
        readyForMapping: missing.length === 0,
        missingDomains: missing,
        note: missing.length ? "C2 integral bloqueado até localizar todos os domínios no PEC." : "Domínios-base do C2 localizados. Validar colunas de antropometria e regras de registro antes de homologar o cálculo.",
      };
    })(),
  };
}
