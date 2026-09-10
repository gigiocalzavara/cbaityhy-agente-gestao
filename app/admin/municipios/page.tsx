"use client";

import { FormEvent, useEffect, useState } from "react";
import { appPath } from "@/lib/base-path";

type Municipality = {
  id: string;
  name: string;
  ibge_code: string;
  state_code: string;
  status: string;
  pec?: {
    host: string;
    port: number;
    database_name: string;
    username: string;
    ssl_enabled: boolean;
    active: boolean;
    last_test_at?: string | null;
    last_test_status?: "success" | "error" | null;
    last_error?: string | null;
  } | null;
};

export default function MunicipalitiesAdminPage() {
  const [items, setItems] = useState<Municipality[]>([]);
  const [selected, setSelected] = useState<Municipality | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ host: "", port: "5432", databaseName: "", username: "", password: "", sslEnabled: true });
  const [newMunicipality, setNewMunicipality] = useState({ name: "", ibgeCode: "", stateCode: "PB" });

  async function load() {
    setLoading(true);
    const response = await fetch(appPath("/api/municipalities"), { cache: "no-store" });
    if (response.status === 401) { window.location.href = appPath("/login"); return; }
    const data = await response.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function edit(item: Municipality) {
    setSelected(item);
    setMessage("");
    setForm({
      host: item.pec?.host || "",
      port: String(item.pec?.port || 5432),
      databaseName: item.pec?.database_name || "",
      username: item.pec?.username || "",
      password: "",
      sslEnabled: item.pec?.ssl_enabled !== false,
    });
  }

  async function saveConnection(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setMessage("Salvando conexão…");
    const response = await fetch(appPath(`/api/municipalities/${selected.id}/connection`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, port: Number(form.port) }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Conexão salva com segurança." : data.message || "Falha ao salvar.");
    if (response.ok) { setForm((current) => ({ ...current, password: "" })); await load(); }
  }

  async function testConnection() {
    if (!selected) return;
    setMessage("Testando conexão READ ONLY com o PEC…");
    const response = await fetch(appPath(`/api/municipalities/${selected.id}/connection`), { method: "POST" });
    const data = await response.json();
    setMessage(response.ok ? `Conectado com sucesso ao banco ${data.details?.database_name || "PEC"}.` : data.message || "Falha na conexão.");
    await load();
  }

  async function createMunicipality(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(appPath("/api/municipalities"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMunicipality),
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.message || "Falha ao cadastrar município."); return; }
    setCreating(false);
    setNewMunicipality({ name: "", ibgeCode: "", stateCode: "PB" });
    setMessage("Município cadastrado. Agora configure a conexão PEC.");
    await load();
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Municípios e integração PEC</h1><p>Gerencie os municípios e a conexão PostgreSQL READ ONLY do e-SUS PEC.</p></div>
        <div className="admin-actions"><a href={appPath("/")}>← Assistente IA</a><button onClick={() => setCreating((value) => !value)}>+ Adicionar município</button></div>
      </header>

      {creating && (
        <form className="admin-card municipality-create" onSubmit={createMunicipality}>
          <h2>Novo município</h2>
          <div className="form-grid three">
            <label>Nome<input value={newMunicipality.name} onChange={(e) => setNewMunicipality({ ...newMunicipality, name: e.target.value })} required /></label>
            <label>Código IBGE<input value={newMunicipality.ibgeCode} onChange={(e) => setNewMunicipality({ ...newMunicipality, ibgeCode: e.target.value })} maxLength={7} required /></label>
            <label>UF<input value={newMunicipality.stateCode} onChange={(e) => setNewMunicipality({ ...newMunicipality, stateCode: e.target.value.toUpperCase() })} maxLength={2} required /></label>
          </div>
          <button className="primary-button" type="submit">Cadastrar município</button>
        </form>
      )}

      {message && <div className="admin-message">{message}</div>}

      <section className="admin-layout">
        <div className="admin-card municipality-list">
          <div className="card-head"><h2>Municípios</h2><span>{items.length} ativos</span></div>
          {loading ? <p>Carregando…</p> : items.map((item) => (
            <button key={item.id} className={`municipality-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => edit(item)}>
              <div><strong>{item.name}</strong><span>{item.state_code} · IBGE {item.ibge_code}</span></div>
              <span className={`pec-badge ${item.pec?.last_test_status || "pending"}`}>{item.pec?.last_test_status === "success" ? "PEC conectado" : item.pec?.last_test_status === "error" ? "Erro PEC" : item.pec ? "Não testado" : "Não configurado"}</span>
            </button>
          ))}
        </div>

        <div className="admin-card connection-card">
          {!selected ? <div className="empty-admin"><h2>Selecione um município</h2><p>Escolha um município à esquerda para configurar o PostgreSQL do PEC.</p></div> : (
            <form onSubmit={saveConnection}>
              <div className="card-head"><div><h2>{selected.name}</h2><span>{selected.state_code} · IBGE {selected.ibge_code}</span></div><span className={`pec-badge ${selected.pec?.last_test_status || "pending"}`}>{selected.pec?.last_test_status === "success" ? "Conectado" : selected.pec?.last_test_status === "error" ? "Erro" : "Pendente"}</span></div>
              <h3>Integração e-SUS PEC</h3>
              <div className="form-grid">
                <label className="wide">Host PostgreSQL<input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="10.0.0.10 ou pec.municipio.gov.br" required /></label>
                <label>Porta<input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} required /></label>
                <label>Banco<input value={form.databaseName} onChange={(e) => setForm({ ...form, databaseName: e.target.value })} required /></label>
                <label>Usuário READ ONLY<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
                <label>Senha<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={selected.pec ? "•••••••• (deixe vazio para manter)" : "Senha do usuário PostgreSQL"} /></label>
                <label className="check-label"><input type="checkbox" checked={form.sslEnabled} onChange={(e) => setForm({ ...form, sslEnabled: e.target.checked })} /> Usar SSL</label>
              </div>
              {selected.pec?.last_test_at && <div className="test-info"><strong>Último teste:</strong> {new Date(selected.pec.last_test_at).toLocaleString("pt-BR")}{selected.pec.last_error ? <span>{selected.pec.last_error}</span> : null}</div>}
              <div className="connection-actions"><button className="secondary-button" type="button" onClick={testConnection}>Testar conexão</button><button className="primary-button" type="submit">Salvar configuração</button></div>
              <small className="security-note">A senha é criptografada no servidor antes de ser armazenada no Supabase Operacional e nunca é devolvida ao navegador.</small>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
