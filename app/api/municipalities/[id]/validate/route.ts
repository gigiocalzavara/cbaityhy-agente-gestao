import { NextRequest, NextResponse } from "next/server";
import { listAccessibleMunicipalities, requireManagementIdentity } from "@/lib/auth";
import { validatePecToolCatalog } from "@/lib/pec-validator";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireManagementIdentity();
    if (identity.role !== "admin") {
      return NextResponse.json({ message: "Apenas administradores podem validar consultas PEC." }, { status: 403 });
    }

    const { id } = await context.params;
    const { municipalities } = await listAccessibleMunicipalities();
    const municipality = municipalities.find((item) => item.id === id);
    if (!municipality) {
      return NextResponse.json({ message: "Município não autorizado." }, { status: 403 });
    }

    return NextResponse.json(await validatePecToolCatalog(id, municipality.ibge_code));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao validar consultas PEC.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
