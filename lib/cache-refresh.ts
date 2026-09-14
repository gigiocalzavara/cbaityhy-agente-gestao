import "server-only";
import catalog from "@/config/tool-catalog.json";
import { operationalFetch } from "@/lib/operational-supabase";
import { executeTool } from "@/lib/tool-registry";
import { markToolCacheFailure } from "@/lib/tool-cache";

type CatalogTool = { id: string; nominal: boolean; parameters: string[] };
type Municipality = { id: string; organization_id: string; ibge_code: string };

export function cacheRefreshTargets() {
  return (catalog.tools as CatalogTool[])
    .filter((tool) => !tool.nominal && tool.parameters.every((parameter) => parameter === "ine"))
    .map((tool) => ({ id: tool.id, parameters: Object.fromEntries(tool.parameters.map((parameter) => [parameter, null])) }));
}

async function activeConnectedMunicipalities() {
  const response = await operationalFetch("/rest/v1/aps_agent_municipality_connections?select=municipality_id&active=eq.true&order=municipality_id.asc");
  if (!response.ok) throw new Error("CACHE_MUNICIPALITIES_FAILED: " + await response.text());
  const ids = ((await response.json()) as Array<{ municipality_id: string }>).map((row) => row.municipality_id);
  if (!ids.length) return [];
  const municipalitiesResponse = await operationalFetch("/rest/v1/municipalities?select=id,organization_id,ibge_code&id=in.(" + ids.join(",") + ")");
  if (!municipalitiesResponse.ok) throw new Error("CACHE_MUNICIPALITY_CODES_FAILED: " + await municipalitiesResponse.text());
  return municipalitiesResponse.json() as Promise<Municipality[]>;
}

async function createRun(municipality: Municipality, total: number) {
  const response = await operationalFetch("/rest/v1/aps_agent_processing_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: municipality.organization_id, municipality_id: municipality.id, routine: "aggregate_cache", status: "running", total_tasks: total, started_at: new Date().toISOString() }),
  });
  if (!response.ok) return null;
  return (await response.json() as Array<{ id: string }>)[0]?.id || null;
}

async function patchRun(id: string | null, values: Record<string, unknown>) {
  if (!id) return;
  await operationalFetch("/rest/v1/aps_agent_processing_runs?id=eq." + id, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(values) });
}

export async function refreshAllMunicipalityCaches() {
  const municipalities = await activeConnectedMunicipalities();
  const targets = cacheRefreshTargets();
  const report: Array<Record<string, unknown>> = [];

  for (const municipality of municipalities) {
    const runId = await createRun(municipality, targets.length);
    let completed = 0, failed = 0, rowCount = 0;
    for (const target of targets) {
      const started = Date.now();
      try {
        const result = await executeTool(target.id, target.parameters, {
          role: "admin", municipalityId: municipality.id, municipalityIbgeCode: municipality.ibge_code,
          nominalAccess: false, cacheMode: "refresh",
        });
        completed += 1; rowCount += result.rowCount;
        report.push({ municipalityId: municipality.id, toolId: target.id, status: "success", durationMs: Date.now() - started, rowCount: result.rowCount });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "CACHE_REFRESH_FAILED";
        await markToolCacheFailure(municipality.id, target.id, target.parameters, message, Date.now() - started).catch(() => undefined);
        report.push({ municipalityId: municipality.id, toolId: target.id, status: "error", durationMs: Date.now() - started, message });
      }
      await patchRun(runId, { completed_tasks: completed, failed_tasks: failed, row_count: rowCount });
    }
    await patchRun(runId, { status: failed ? (completed ? "partial" : "error") : "success", finished_at: new Date().toISOString() });
  }
  return { startedMunicipalities: municipalities.length, targets: targets.length, report };
}
