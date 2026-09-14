import { NextRequest, NextResponse } from "next/server";
import { requireCbaityhyAdmin } from "@/lib/auth";
import { operationalFetch } from "@/lib/operational-supabase";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireCbaityhyAdmin();
    const { id } = await params;
    const body = await request.json();
    const enabled = body.enabled === true;
    const reason = enabled ? null : String(body.reason || "Suspensão administrativa").slice(0, 200);
    const response = await operationalFetch("/rest/v1/municipalities?id=eq." + encodeURIComponent(id), {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ai_enabled: enabled, ai_disabled_reason: reason, ai_updated_at: new Date().toISOString(), ai_updated_by: identity.authUserId }),
    });
    if (!response.ok) throw new Error(await response.text());
    await operationalFetch("/rest/v1/aps_agent_admin_audit", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
      organization_id: identity.organizationId, actor_auth_user_id: identity.authUserId, municipality_id: id,
      action: enabled ? "municipality.ai_enabled" : "municipality.ai_disabled", metadata: { reason },
    })});
    return NextResponse.json({ enabled });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Falha ao alterar IA." }, { status: 403 }); }
}
