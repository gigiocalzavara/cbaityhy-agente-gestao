import "server-only";
import { createHash } from "node:crypto";
import catalog from "@/config/tool-catalog.json";
import { operationalFetch } from "@/lib/operational-supabase";
import { executeTool } from "@/lib/tool-registry";

type CatalogTool = { id: string; nominal: boolean; parameters: string[] };
type Municipality = { id: string; organization_id: string; ibge_code: string };

export function activeSearchTargets() {
  return (catalog.tools as CatalogTool[])
    .filter((tool) => tool.nominal && tool.parameters.every((parameter) => parameter === "ine"))
    .map((tool) => ({ id: tool.id, parameters: Object.fromEntries(tool.parameters.map((parameter) => [parameter, null])) }));
}

function citizenKey(row: Record<string, unknown>, index: number) {
  const identity = Object.entries(row)
    .filter(([key]) => /cpf|cns|cidadao|nome|nascimento/i.test(key))
    .map(([key, value]) => key + ":" + String(value || ""))
    .join("|") || JSON.stringify(row) + ":" + index;
  return createHash("sha256").update(identity).digest("hex");
}

async function municipalities() {
  const connections = await operationalFetch("/rest/v1/aps_agent_municipality_connections?select=municipality_id&active=eq.true");
  if (!connections.ok) throw new Error("ACTIVE_SEARCH_CONNECTIONS_FAILED");
  const ids = (await connections.json() as Array<{ municipality_id: string }>).map(x => x.municipality_id);
  if (!ids.length) return [];
  const response = await operationalFetch("/rest/v1/municipalities?select=id,organization_id,ibge_code&id=in.(" + ids.join(",") + ")&status=eq.active");
  if (!response.ok) throw new Error("ACTIVE_SEARCH_MUNICIPALITIES_FAILED");
  return response.json() as Promise<Municipality[]>;
}

async function createRun(municipality: Municipality, total: number) {
  const response = await operationalFetch("/rest/v1/aps_agent_processing_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: municipality.organization_id, municipality_id: municipality.id, routine: "active_search", status: "running", total_tasks: total, started_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("ACTIVE_SEARCH_RUN_CREATE_FAILED");
  return (await response.json() as Array<{ id: string }>)[0].id;
}

async function patchRun(id: string, values: Record<string, unknown>) {
  await operationalFetch("/rest/v1/aps_agent_processing_runs?id=eq." + id, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(values) });
}

async function insertRows(municipalityId: string, toolId: string, runId: string, rows: Record<string, unknown>[]) {
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500).map((payload, offset) => ({
      municipality_id: municipalityId, tool_id: toolId, generation_id: runId,
      citizen_key: citizenKey(payload, start + offset),
      ine: String(payload.ine || payload.nu_ine || "") || null,
      team_name: String(payload.equipe || payload.no_equipe || "") || null,
      priority: String(payload.prioridade || payload.risco || "") || null,
      payload,
    }));
    const response = await operationalFetch("/rest/v1/aps_agent_active_search_cache", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(batch) });
    if (!response.ok) throw new Error("ACTIVE_SEARCH_BATCH_FAILED: " + await response.text());
  }
  const pointer = await operationalFetch("/rest/v1/aps_agent_active_search_current?on_conflict=municipality_id,tool_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ municipality_id: municipalityId, tool_id: toolId, generation_id: runId, published_at: new Date().toISOString() }),
  });
  if (!pointer.ok) throw new Error("ACTIVE_SEARCH_PUBLISH_FAILED");
}

export async function readActiveSearchCache(municipalityId: string, toolId: string, parameters: Record<string, string | null>) {
  const currentResponse = await operationalFetch("/rest/v1/aps_agent_active_search_current?select=generation_id,published_at&municipality_id=eq." + encodeURIComponent(municipalityId) + "&tool_id=eq." + encodeURIComponent(toolId) + "&limit=1");
  if (!currentResponse.ok) return null;
  const current = (await currentResponse.json() as Array<{ generation_id: string; published_at: string }>)[0];
  if (!current) return null;
  let path = "/rest/v1/aps_agent_active_search_cache?select=payload&municipality_id=eq." + encodeURIComponent(municipalityId) + "&tool_id=eq." + encodeURIComponent(toolId) + "&generation_id=eq." + encodeURIComponent(current.generation_id) + "&order=citizen_key.asc&limit=500";
  if (parameters.ine) path += "&ine=eq." + encodeURIComponent(parameters.ine);
  const response = await operationalFetch(path);
  if (!response.ok) return null;
  const rows = (await response.json() as Array<{ payload: Record<string, unknown> }>).map(x => x.payload);
  return { toolId, kind: "nominal", nominal: true, chart: false, parameters, rowCount: rows.length, rows, cache: { hit: true, generatedAt: current.published_at, stale: false } };
}

export async function refreshAllActiveSearchCaches() {
  const targets = activeSearchTargets();
  const cities = await municipalities();
  const report: Array<Record<string, unknown>> = [];
  // Serial by municipality to reuse/protect the constrained SSH path.
  for (const municipality of cities) {
    const runId = await createRun(municipality, targets.length);
    let completed = 0, failed = 0, rowCount = 0;
    for (const target of targets) {
      try {
        const result = await executeTool(target.id, target.parameters, {
          role: "admin", municipalityId: municipality.id, municipalityIbgeCode: municipality.ibge_code,
          nominalAccess: true, cacheMode: "bypass", activeSearchRefresh: true,
        });
        await insertRows(municipality.id, target.id, runId, result.rows);
        completed += 1; rowCount += result.rowCount;
        report.push({ municipalityId: municipality.id, toolId: target.id, status: "success", rowCount: result.rowCount });
      } catch (error) {
        failed += 1;
        report.push({ municipalityId: municipality.id, toolId: target.id, status: "error", message: error instanceof Error ? error.message : "FAILED" });
      }
      await patchRun(runId, { completed_tasks: completed, failed_tasks: failed, row_count: rowCount });
    }
    await patchRun(runId, { status: failed ? (completed ? "partial" : "error") : "success", finished_at: new Date().toISOString() });
  }
  return { municipalities: cities.length, targets: targets.length, report };
}
