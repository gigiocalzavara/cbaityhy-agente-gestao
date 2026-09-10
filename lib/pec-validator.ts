import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import catalog from "@/config/tool-catalog.json";
import { executeReadOnlyQuery } from "@/lib/pec";

type ToolMeta = {
  id: string;
  sql: string;
  parameters: string[];
};

export type PecToolValidation = {
  id: string;
  status: "compatible" | "error";
  error: string | null;
};

function validationValues(parameters: string[]) {
  return parameters.map((parameter) => parameter === "logradouro" ? "RUA" : null);
}

function safeDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export async function validatePecToolCatalog(municipalityId: string) {
  const results: PecToolValidation[] = [];

  for (const tool of catalog.tools as ToolMeta[]) {
    try {
      const sql = await readFile(path.join(process.cwd(), tool.sql), "utf8");
      await executeReadOnlyQuery(
        municipalityId,
        `EXPLAIN (FORMAT JSON) ${sql}`,
        validationValues(tool.parameters),
      );
      results.push({ id: tool.id, status: "compatible", error: null });
    } catch (error) {
      results.push({ id: tool.id, status: "error", error: safeDatabaseError(error) });
    }
  }

  return {
    compatible: results.every((item) => item.status === "compatible"),
    checkedAt: new Date().toISOString(),
    results,
  };
}
