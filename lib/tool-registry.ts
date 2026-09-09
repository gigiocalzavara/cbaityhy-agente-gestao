import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import catalog from "@/config/tool-catalog.json";
import { executeReadOnlyQuery } from "@/lib/pec";

export type AccessRole = "admin" | "manager" | "municipal_manager" | "coordinator" | "team";

type ToolMeta = {
  id: string;
  sql: string;
  kind: "aggregate" | "nominal";
  nominal: boolean;
  chart: boolean;
  parameters: string[];
};

export type ToolExecutionContext = {
  role: AccessRole;
  municipalityId: string;
  nominalAccess: boolean;
};

const tools = new Map((catalog.tools as ToolMeta[]).map((tool) => [tool.id, tool]));

function sanitizeArguments(meta: ToolMeta, raw: Record<string, unknown>) {
  const values: unknown[] = [];
  const clean: Record<string, string | null> = {};

  for (const parameter of meta.parameters) {
    const value = raw[parameter];
    if (value === null || value === undefined || value === "") {
      clean[parameter] = null;
      values.push(null);
      continue;
    }

    if (parameter === "ine") {
      const normalized = String(value).replace(/\D/g, "").slice(0, 10);
      clean[parameter] = normalized || null;
      values.push(normalized || null);
      continue;
    }

    if (parameter === "logradouro") {
      const normalized = String(value)
        .normalize("NFKC")
        .replace(/[;%'"\\_]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      clean[parameter] = normalized || null;
      values.push(normalized || null);
      continue;
    }

    throw new Error(`Parâmetro não suportado: ${parameter}`);
  }

  return { clean, values };
}

function maskSensitiveRow(row: Record<string, unknown>) {
  const result = { ...row };
  for (const key of Object.keys(result)) {
    const lower = key.toLowerCase();
    if (lower.includes("cpf") && result[key]) {
      const digits = String(result[key]).replace(/\D/g, "");
      result[key] = digits.length >= 11 ? `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}` : "***";
    }
    if (lower.includes("cns") && result[key]) {
      const digits = String(result[key]).replace(/\D/g, "");
      result[key] = digits.length >= 6 ? `${digits.slice(0, 3)}*********${digits.slice(-3)}` : "***";
    }
  }
  return result;
}

export function getToolDefinitions() {
  return (catalog.tools as ToolMeta[]).map((tool) => ({
    type: "function",
    name: tool.id,
    description: describeTool(tool.id),
    strict: true,
    parameters: {
      type: "object",
      properties: Object.fromEntries(
        tool.parameters.map((parameter) => [
          parameter,
          parameter === "ine"
            ? { type: ["string", "null"], description: "INE da equipe, apenas quando explicitamente informado ou já selecionado no contexto." }
            : { type: ["string", "null"], description: "Nome do logradouro informado pelo usuário." },
        ]),
      ),
      required: tool.parameters,
      additionalProperties: false,
    },
  }));
}

function describeTool(id: string) {
  const descriptions: Record<string, string> = {
    tool_indicador_citopatologico: "Cobertura de rastreamento citopatológico em mulheres elegíveis, por equipe, nos últimos 36 meses.",
    tool_busca_ativa_gestantes_atraso: "Lista nominal de gestantes com acompanhamento pré-natal atrasado. Dado sensível; use apenas quando o usuário pedir busca ativa nominal.",
    tool_indicador_hipertensao: "Indicador de acompanhamento de hipertensão por equipe nos últimos 6 meses.",
    tool_indicador_diabetes: "Indicador de acompanhamento de diabetes/HbA1c por equipe nos últimos 6 meses.",
    tool_indicador_idoso: "Indicador de avaliação anual da pessoa idosa. Pode filtrar por INE.",
    tool_busca_ativa_idosos: "Lista nominal de idosos sem acompanhamento recente. Dado sensível; pode filtrar por INE.",
    tool_indicador_vacinacao_infantil: "Cobertura de Penta e VIP para crianças de 12 a 23 meses, por equipe.",
    tool_censo_gestantes: "Censo agregado de gestantes ativas por equipe. Pode filtrar por INE.",
    tool_busca_territorial_rua: "Censo territorial agregado por logradouro. Requer logradouro e pode filtrar por INE.",
    tool_auditoria_cadastros: "Auditoria de cadastros ativos e atualização cadastral nos últimos 24 meses.",
  };
  return descriptions[id] || id;
}

export async function executeTool(
  toolId: string,
  rawArguments: Record<string, unknown>,
  context: ToolExecutionContext,
) {
  const meta = tools.get(toolId);
  if (!meta) throw new Error("Tool não homologada.");

  if (meta.nominal && (!context.nominalAccess || !["admin", "manager", "municipal_manager", "coordinator"].includes(context.role))) {
    throw new Error("FORBIDDEN_NOMINAL");
  }

  const { clean, values } = sanitizeArguments(meta, rawArguments);
  const sqlPath = path.join(process.cwd(), meta.sql);
  const sql = await readFile(sqlPath, "utf8");
  const rows = await executeReadOnlyQuery(sql, values);
  const max = meta.nominal ? Number(process.env.DEFAULT_RESULT_LIMIT || 15) : 250;
  const limited = rows.slice(0, Math.max(1, Math.min(max, 500))).map(maskSensitiveRow);

  return {
    toolId,
    kind: meta.kind,
    nominal: meta.nominal,
    chart: meta.chart,
    parameters: clean,
    rowCount: limited.length,
    rows: limited,
  };
}
