import "server-only";
import catalog from "@/config/tool-catalog.json";
import { operationalFetch } from "@/lib/operational-supabase";
import { executeTool } from "@/lib/tool-registry";
import { markToolCacheFailure } from "@/lib/tool-cache";

type CatalogTool = { id: string; nominal: boolean; parameters: string[] };

export function cacheRefreshTargets() {
  return (catalog.tools as CatalogTool[])
    .filter((tool) => !tool.nominal && tool.parameters.every((parameter) => parameter === "ine"))
    .map((tool) => ({ id: tool.id, parameters: Object.fromEntries(tool.parameters.map((parameter) => [parameter, null])) }));
}

async function activeConnectedMunicipalities() {
  const response = await operationalFetch(
    "/rest/v1/aps_agent_municipality_connections?select=municipality_id&active=eq.true&order=municipality_id.asc",
  );
  if (!response.ok) throw new Error(`CACHE_MUNICIPALITIES_FAILED: ${await response.text()}`);
  const ids = ((await response.json()) as Array<{ municipality_id: string }>).map((row) => row.municipality_id);
  if (!ids.length) return [];
  const municipalitiesResponse = await operationalFetch(
    `/rest/v1/municipalities?select=id,ibge_code&id=in.(${ids.join(",")})`,
  );
  if (!municipalitiesResponse.ok) throw new Error(`CACHE_MUNICIPALITY_CODES_FAILED: ${await municipalitiesResponse.text()}`);
  return (await municipalitiesResponse.json()) as Array<{ id: string; ibge_code: string }>;
}

export async function refreshAllMunicipalityCaches() {
  const municipalities = await activeConnectedMunicipalities();
  const targets = cacheRefreshTargets();
  const report: Array<Record<string, unknown>> = [];

  for (const municipality of municipalities) {
    const municipalityId = municipality.id;
    for (const target of targets) {
      const started = Date.now();
      try {
        const result = await executeTool(target.id, target.parameters, {
          role: "admin",
          municipalityId,
          municipalityIbgeCode: municipality.ibge_code,
          nominalAccess: false,
          cacheMode: "refresh",
        });
        report.push({ municipalityId, toolId: target.id, status: "success", durationMs: Date.now() - started, rowCount: result.rowCount });
      } catch (error) {
        const message = error instanceof Error ? error.message : "CACHE_REFRESH_FAILED";
        await markToolCacheFailure(municipalityId, target.id, target.parameters, message, Date.now() - started).catch(() => undefined);
        report.push({ municipalityId, toolId: target.id, status: "error", durationMs: Date.now() - started, message });
      }
    }
  }
  return { startedMunicipalities: municipalities.length, targets: targets.length, report };
}
