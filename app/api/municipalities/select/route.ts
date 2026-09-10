import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listAccessibleMunicipalities } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { municipalityId } = await request.json();
    const { municipalities } = await listAccessibleMunicipalities();
    const municipality = municipalities.find((item) => item.id === municipalityId);
    if (!municipality) return NextResponse.json({ message: "Município não autorizado." }, { status: 403 });
    const store = await cookies();
    store.set("cbai_municipality_id", municipality.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ id: municipality.id, name: municipality.name });
  } catch {
    return NextResponse.json({ message: "Não foi possível selecionar o município." }, { status: 400 });
  }
}
