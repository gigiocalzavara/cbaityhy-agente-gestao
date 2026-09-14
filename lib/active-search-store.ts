import "server-only";
import { operationalFetch } from "@/lib/operational-supabase";

export async function readActiveSearchCache(municipalityId: string, toolId: string, parameters: Record<string, string | null>) {
  const currentResponse = await operationalFetch("/rest/v1/aps_agent_active_search_current?select=generation_id,published_at&municipality_id=eq." + encodeURIComponent(municipalityId) + "&tool_id=eq." + encodeURIComponent(toolId) + "&limit=1");
  if (!currentResponse.ok) return null;
  const current = (await currentResponse.json() as Array<{ generation_id: string; published_at: string }>)[0];
  if (!current) return null;
  let path = "/rest/v1/aps_agent_active_search_cache?select=payload&generation_id=eq." + current.generation_id + "&order=citizen_key.asc&limit=500";
  if (parameters.ine) path += "&ine=eq." + encodeURIComponent(parameters.ine);
  const response = await operationalFetch(path);
  if (!response.ok) return null;
  const rows = (await response.json() as Array<{ payload: Record<string, unknown> }>).map(x => x.payload);
  return { toolId, kind: "nominal", nominal: true, chart: false, parameters, rowCount: rows.length, rows, cache: { hit: true, generatedAt: current.published_at, stale: false } };
}
