import { NextRequest, NextResponse } from "next/server";
import { requireManagementIdentity } from "@/lib/auth";
import { executeTool, isHomologatedTool } from "@/lib/tool-registry";

export async function POST(request: NextRequest, context: { params: Promise<{ toolId: string }> }) {
  try {
    const identity = await requireManagementIdentity();
    const { toolId } = await context.params;
    if (!isHomologatedTool(toolId)) return NextResponse.json({ message: "Tool não homologada." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    // Indicator screens may explicitly request a fresh PEC calculation after
    // methodology/SQL changes instead of silently serving yesterday's aggregate.
    const requestedCacheMode = body?.cacheMode;
    const cacheMode = requestedCacheMode === "refresh" || requestedCacheMode === "bypass" ? requestedCacheMode : undefined;
    const result = await executeTool(toolId, body?.parameters || {}, {
      role: identity.role,
      municipalityId: identity.municipalityId,
      municipalityIbgeCode: identity.municipalityIbgeCode,
      nominalAccess: identity.nominalAccess,
      cacheMode,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "UNAUTHORIZED") return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
    if (code === "FORBIDDEN" || code === "FORBIDDEN_NOMINAL") return NextResponse.json({ message: "Seu perfil não possui acesso a dados nominais." }, { status: 403 });
    if (code === "Tool não homologada.") return NextResponse.json({ message: code }, { status: 404 });
    if (code === "ACTIVE_SEARCH_CACHE_NOT_READY") return NextResponse.json({ message: "A busca ativa ainda não possui uma carga diária disponível. Solicite a atualização do cache na Administração." }, { status: 503 });
    return NextResponse.json({ message: code }, { status: 500 });
  }
}
