import { NextResponse } from "next/server";
import { requireManagementIdentity } from "@/lib/auth";

export async function GET() {
  try {
    const identity = await requireManagementIdentity();
    return NextResponse.json(identity);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { message: message === "FORBIDDEN" ? "Usuário sem vínculo ativo com município." : "Não autenticado." },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
