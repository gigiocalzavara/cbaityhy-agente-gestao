import { NextResponse } from "next/server";
import { listAccessibleMunicipalities, requireManagementIdentity } from "@/lib/auth";
import { operationalFetch } from "@/lib/operational-supabase";
import { getPecConnectionSummary } from "@/lib/pec-connections";

export async function GET() {
  try {
    const { municipalities } = await listAccessibleMunicipalities();
    const enriched = await Promise.all(municipalities.map(async (municipality) => ({
      ...municipality,
      pec: await getPecConnectionSummary(municipality.id),
    })));
    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Falha ao listar municípios." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireManagementIdentity();
    if (identity.role !== "admin") return NextResponse.json({ message: "Apenas administradores podem cadastrar municípios." }, { status: 403 });
    const body = await request.json();
    const name = String(body.name || "").trim();
    const ibgeCode = String(body.ibgeCode || "").replace(/\D/g, "").slice(0, 7);
    const stateCode = String(body.stateCode || "").trim().toUpperCase().slice(0, 2);
    if (!name || ibgeCode.length !== 7 || stateCode.length !== 2) return NextResponse.json({ message: "Nome, UF e código IBGE são obrigatórios." }, { status: 400 });

    const response = await operationalFetch("/rest/v1/municipalities", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ organization_id: identity.organizationId, name, ibge_code: ibgeCode, state_code: stateCode, status: "active" }),
    });
    if (!response.ok) return NextResponse.json({ message: await response.text() }, { status: response.status });
    const rows = await response.json();
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Falha ao cadastrar município." }, { status: 500 });
  }
}
