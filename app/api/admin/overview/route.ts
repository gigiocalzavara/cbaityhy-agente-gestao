import { NextResponse } from "next/server";
import { requireCbaityhyAdmin } from "@/lib/auth";
import { operationalFetch } from "@/lib/operational-supabase";

export async function GET() {
  try {
    await requireCbaityhyAdmin();
    const [municipalitiesResponse, runsResponse, usageResponse] = await Promise.all([
      operationalFetch("/rest/v1/municipalities?select=id,name,state_code,ibge_code,status,ai_enabled&deleted_at=is.null&order=name.asc"),
      operationalFetch("/rest/v1/aps_agent_processing_runs?select=id,municipality_id,routine,status,total_tasks,completed_tasks,failed_tasks,row_count,started_at,finished_at,error_message,created_at&order=created_at.desc&limit=100"),
      operationalFetch("/rest/v1/aps_agent_ai_usage?select=municipality_id,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,estimated_cost_usd,success,created_at&created_at=gte." + encodeURIComponent(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()) + "&limit=10000"),
    ]);
    if (!municipalitiesResponse.ok || !runsResponse.ok || !usageResponse.ok) throw new Error("BACKOFFICE_READ_FAILED");
    const municipalities = await municipalitiesResponse.json() as Array<Record<string, unknown>>;
    const runs = await runsResponse.json() as Array<Record<string, unknown>>;
    const usage = await usageResponse.json() as Array<Record<string, unknown>>;
    const usageByMunicipality: Record<string, { input: number; output: number; cached: number; reasoning: number; requests: number; costUsd: number }> = {};
    for (const item of usage) {
      const id = String(item.municipality_id);
      const total = usageByMunicipality[id] ||= { input: 0, output: 0, cached: 0, reasoning: 0, requests: 0, costUsd: 0 };
      total.input += Number(item.input_tokens || 0); total.output += Number(item.output_tokens || 0);
      total.cached += Number(item.cached_input_tokens || 0); total.reasoning += Number(item.reasoning_tokens || 0);
      total.costUsd += Number(item.estimated_cost_usd || 0); total.requests += 1;
    }
    return NextResponse.json({ municipalities, runs, usageByMunicipality });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ message: code }, { status: code === "FORBIDDEN_CBAITYHY_ADMIN" ? 403 : 401 });
  }
}
