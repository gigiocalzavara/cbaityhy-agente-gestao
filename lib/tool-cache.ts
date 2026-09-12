import "server-only";
import { operationalFetch } from "@/lib/operational-supabase";

export type CachedToolResult = {
  toolId: string;
  kind: string;
  nominal: boolean;
  chart: boolean;
  parameters: Record<string, string | null>;
  rowCount: number;
  rows: Record<string, unknown>[];
  cache?: { hit: boolean; generatedAt: string; stale: boolean };
};

type CacheRow = {
  result: CachedToolResult | null;
  generated_at: string;
  expires_at: string;
  status: "success" | "error";
};

export type IndicatorHistoryRow = {
  tool_id: string;
  parameters: Record<string, string | null>;
  snapshot_date: string;
  result: CachedToolResult;
  row_count: number;
  duration_ms: number | null;
  generated_at: string;
};

function encodedParameters(parameters: Record<string, string | null>) {
  return encodeURIComponent(JSON.stringify(parameters));
}

function saoPauloDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function readIndicatorHistory(
  municipalityId: string,
  toolId: string,
  options: { from?: string | null; to?: string | null; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(options.limit || 180, 366));
  let path = `/rest/v1/aps_agent_indicator_history?select=tool_id,parameters,snapshot_date,result,row_count,duration_ms,generated_at` +
    `&municipality_id=eq.${encodeURIComponent(municipalityId)}` +
    `&tool_id=eq.${encodeURIComponent(toolId)}&order=snapshot_date.asc&limit=${limit}`;
  if (options.from) path += `&snapshot_date=gte.${encodeURIComponent(options.from)}`;
  if (options.to) path += `&snapshot_date=lte.${encodeURIComponent(options.to)}`;
  const response = await operationalFetch(path);
  if (!response.ok) throw new Error(`INDICATOR_HISTORY_READ_FAILED: ${await response.text()}`);
  return response.json() as Promise<IndicatorHistoryRow[]>;
}

export async function readToolCache(
  municipalityId: string,
  toolId: string,
  parameters: Record<string, string | null>,
) {
  const response = await operationalFetch(
    `/rest/v1/aps_agent_tool_cache?select=result,generated_at,expires_at,status` +
      `&municipality_id=eq.${encodeURIComponent(municipalityId)}` +
      `&tool_id=eq.${encodeURIComponent(toolId)}` +
      `&parameters=eq.${encodedParameters(parameters)}&limit=1`,
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as CacheRow[];
  const cached = rows[0];
  if (!cached?.result || cached.status !== "success") return null;
  return {
    ...cached.result,
    cache: {
      hit: true,
      generatedAt: cached.generated_at,
      stale: new Date(cached.expires_at).getTime() < Date.now(),
    },
  } satisfies CachedToolResult;
}

export async function writeToolCache(
  municipalityId: string,
  result: CachedToolResult,
  durationMs: number,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const response = await operationalFetch("/rest/v1/aps_agent_tool_cache?on_conflict=municipality_id,tool_id,parameters", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      municipality_id: municipalityId,
      tool_id: result.toolId,
      parameters: result.parameters,
      result: { ...result, cache: undefined },
      status: "success",
      error_message: null,
      duration_ms: durationMs,
      generated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      last_attempt_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`CACHE_WRITE_FAILED: ${await response.text()}`);

  // Preserve one aggregate snapshot per day for historical charts. Tool results
  // marked as nominal never reach this function (enforced by the registry).
  const snapshotDate = saoPauloDate(now);
  const historyResponse = await operationalFetch(
    "/rest/v1/aps_agent_indicator_history?on_conflict=municipality_id,tool_id,parameters,snapshot_date",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        municipality_id: municipalityId,
        tool_id: result.toolId,
        parameters: result.parameters,
        snapshot_date: snapshotDate,
        result: { ...result, cache: undefined },
        row_count: result.rowCount,
        duration_ms: durationMs,
        generated_at: now.toISOString(),
      }),
    },
  );
  if (!historyResponse.ok) throw new Error("INDICATOR_HISTORY_WRITE_FAILED: " + await historyResponse.text());
}

export async function markToolCacheFailure(
  municipalityId: string,
  toolId: string,
  parameters: Record<string, string | null>,
  message: string,
  durationMs: number,
) {
  const now = new Date().toISOString();
  const response = await operationalFetch(
    `/rest/v1/aps_agent_tool_cache?municipality_id=eq.${encodeURIComponent(municipalityId)}` +
      `&tool_id=eq.${encodeURIComponent(toolId)}&parameters=eq.${encodedParameters(parameters)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ error_message: message.slice(0, 500), duration_ms: durationMs, last_attempt_at: now, updated_at: now }),
    },
  );
  if (!response.ok) throw new Error(`CACHE_FAILURE_WRITE_FAILED: ${await response.text()}`);
}
