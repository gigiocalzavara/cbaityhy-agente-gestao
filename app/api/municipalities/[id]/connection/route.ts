import { NextResponse } from "next/server";
import { requireManagementIdentity, listAccessibleMunicipalities } from "@/lib/auth";
import { getPecConnection, getPecConnectionSummary, savePecConnection, testPecConnection, updatePecTestStatus } from "@/lib/pec-connections";
import { invalidateMunicipalityPool } from "@/lib/pec";

async function authorizeMunicipality(id: string) {
  const identity = await requireManagementIdentity();
  if (identity.role !== "admin") throw new Error("FORBIDDEN_ADMIN");
  const { municipalities } = await listAccessibleMunicipalities();
  if (!municipalities.some((item) => item.id === id)) throw new Error("FORBIDDEN_MUNICIPALITY");
  return identity;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorizeMunicipality(id);
    return NextResponse.json(await getPecConnectionSummary(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar conexão.";
    return NextResponse.json({ message }, { status: message.startsWith("FORBIDDEN") ? 403 : 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorizeMunicipality(id);
    const body = await request.json();
    const host = String(body.host || "").trim();
    const databaseName = String(body.databaseName || "").trim();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const port = Number(body.port || 5432);
    const sslEnabled = body.sslEnabled !== false;
    const passwordChanged = Boolean(password);
    if (!host || !databaseName || !username || !Number.isInteger(port) || port < 1 || port > 65535) {
      return NextResponse.json({ message: "Host, porta, banco e usuário são obrigatórios." }, { status: 400 });
    }
    await savePecConnection({ municipalityId: id, host, port, databaseName, username, password, sslEnabled }, passwordChanged);
    await invalidateMunicipalityPool(id);
    return NextResponse.json({ ok: true, connection: await getPecConnectionSummary(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar conexão.";
    return NextResponse.json({ message }, { status: message.startsWith("FORBIDDEN") ? 403 : 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await authorizeMunicipality(id);
    await invalidateMunicipalityPool(id);
    const config = await getPecConnection(id);
    const result = await testPecConnection(config);
    await updatePecTestStatus(id, true);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar conexão.";
    try { await updatePecTestStatus(id, false, message); } catch {}
    return NextResponse.json({ ok: false, message }, { status: message.startsWith("FORBIDDEN") ? 403 : 502 });
  }
}
