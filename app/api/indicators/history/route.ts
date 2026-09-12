import { NextRequest, NextResponse } from "next/server";
import { requireManagementIdentity } from "@/lib/auth";
import { readIndicatorHistory } from "@/lib/tool-cache";
import { isHomologatedTool } from "@/lib/tool-registry";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const identity = await requireManagementIdentity();
    const toolId = request.nextUrl.searchParams.get("toolId") || "";
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 180);
    if (!isHomologatedTool(toolId)) {
      return NextResponse.json({ message: "Indicador não homologado." }, { status: 404 });
    }
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
      return NextResponse.json({ message: "Período inválido. Use AAAA-MM-DD." }, { status: 400 });
    }
    const snapshots = await readIndicatorHistory(identity.municipalityId, toolId, {
      from,
      to,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 180,
    });
    return NextResponse.json({ toolId, municipalityId: identity.municipalityId, snapshots });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "UNAUTHORIZED") return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
    if (code === "FORBIDDEN") return NextResponse.json({ message: "Acesso negado." }, { status: 403 });
    return NextResponse.json({ message: code }, { status: 500 });
  }
}
