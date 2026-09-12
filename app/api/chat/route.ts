import { NextRequest, NextResponse } from "next/server";
import { requireManagementIdentity } from "@/lib/auth";
import { runManagementAgent } from "@/lib/agent";

export async function POST(request: NextRequest) {
  try {
    const identity = await requireManagementIdentity();
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
