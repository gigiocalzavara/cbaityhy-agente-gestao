import { NextRequest, NextResponse } from "next/server";
import { signInWithPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      return NextResponse.json({ message: "Informe e-mail e senha." }, { status: 400 });
    }

    const session = await signInWithPassword(email, password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("cbai_access_token", session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Number(session.expires_in || 3600),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_LOGIN";
    return NextResponse.json(
      { message: message === "INVALID_LOGIN" ? "E-mail ou senha inválidos." : "Falha ao autenticar." },
      { status: message === "INVALID_LOGIN" ? 401 : 500 },
    );
  }
}
