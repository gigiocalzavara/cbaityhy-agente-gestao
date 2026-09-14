import { NextRequest, NextResponse } from "next/server";
import { requireManagementIdentity } from "@/lib/auth";
import { runManagementAgent } from "@/lib/agent";
import { operationalFetch } from "@/lib/operational-supabase";

export async function POST(request: NextRequest) {
  try {
    const identity = await requireManagementIdentity();
    const settingsResponse = await operationalFetch(`/rest/v1/municipalities?select=ai_enabled&id=eq.${encodeURIComponent(identity.municipalityId)}&limit=1`);
    const settings = settingsResponse.ok ? await settingsResponse.json() as Array<{ ai_enabled: boolean }> : [];
    if (settings[0]?.ai_enabled === false) return NextResponse.json({ message: "O Assistente IA está indisponível para este município. Os painéis, indicadores e buscas ativas continuam disponíveis." }, { status: 403 });
    const body = await request.json();
    const message = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (message.length < 2) {
      return NextResponse.json({ message: "Digite uma pergunta." }, { status: 400 });
    }

    const result = await runManagementAgent({
      message,
      history,
      context: {
        authUserId: identity.authUserId,
        organizationId: identity.organizationId,
        municipalityId: identity.municipalityId,
        municipalityName: identity.municipalityName,
        municipalityIbgeCode: identity.municipalityIbgeCode,
        role: identity.role,
        nominalAccess: identity.nominalAccess,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "UNAUTHORIZED") return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
    if (code === "FORBIDDEN") return NextResponse.json({ message: "Usuário sem vínculo ativo com município." }, { status: 403 });
    return NextResponse.json({ message: code }, { status: 500 });
  }
}
