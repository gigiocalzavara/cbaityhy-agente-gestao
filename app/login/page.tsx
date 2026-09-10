"use client";

import { FormEvent, useState } from "react";
import { appPath } from "@/lib/base-path";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(appPath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Falha ao entrar.");
      window.location.href = appPath("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">C</div>
          <div><strong>CBAItyhy</strong><span>Inteligência APS</span></div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">ACESSO À GESTÃO</span>
          <h1>Entre no seu município</h1>
          <p>Consulte indicadores, dados do PEC e a base técnica da CBAItyhy em uma única conversa.</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}
