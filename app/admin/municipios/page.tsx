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
    ssh_enabled?: boolean;
    ssh_host?: string | null;
    ssh_port?: number | null;
    ssh_username?: string | null;
    ssh_host_fingerprint?: string | null;
    active: boolean;
    last_test_at?: string | null;
    last_test_status?: "success" | "error" | null;
    last_error?: string | null;
  } | null;
};

type ValidationReport = {
  compatible: boolean;
  checkedAt: string;
  results: { id: string; status: "compatible" | "error"; error: string | null }[];
};

export default function MunicipalitiesAdminPage() {
  const [items, setItems] = useState<Municipality[]>([]);
  const [selected, setSelected] = useState<Municipality | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [form, setForm] = useState({ host: "", port: "5432", databaseName: "", username: "", password: "", sslEnabled: true, sshEnabled:false, sshHost:"", sshPort:"22", sshUsername:"", sshPassword:"", sshHostFingerprint:"" });
  const [newMunicipality, setNewMunicipality] = useState({ name: "", ibgeCode: "", stateCode: "PB" });

  async function load() {
    setLoading(true);
    const response = await fetch(appPath("/api/municipalities"), { cache: "no-store" });
    if (response.status === 401) { window.location.href = appPath("/login"); return; }
    const data = await response.json();
    const nextItems = Array.isArray(data) ? data : [];
    setItems(nextItems);
    setSelected((current) => current ? nextItems.find((item) => item.id === current.id) || current : null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function edit(item: Municipality) {
    setSelected(item);
    setMessage("");
    setValidation(null);
    setForm({
      host: item.pec?.host || "",
      port: String(item.pec?.port || 5432),
      databaseName: item.pec?.database_name || "",
      username: item.pec?.username || "",
      password: "",
      sslEnabled: item.pec?.ssl_enabled !== false,
      sshEnabled: item.pec?.ssh_enabled === true,
      sshHost: item.pec?.ssh_host || "",
      sshPort: String(item.pec?.ssh_port || 22),
      sshUsername: item.pec?.ssh_username || "",
      sshPassword: "",
      sshHostFingerprint: item.pec?.ssh_host_fingerprint || "",
    });
  }

  async function persistConnection() {
    if (!selected) return;
    const response = await fetch(appPath(`/api/municipalities/${selected.id}/connection`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, port: Number(form.port), sshPort:Number(form.sshPort) }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Falha ao salvar.");
      return false;
    }
    setForm((current) => ({ ...current, password: "", sshPassword:"" }));
    await load();
    return true;
  }

  async function saveConnection(event: FormEvent) {
    event.preventDefault();
    setMessage("Salvando conexão…");
    if (await persistConnection()) setMessage("Conexão salva com segurança.");
  }

  async function testConnection() {
    if (!selected) return;
    setTesting(true);
    setMessage("Salvando e testando conexão READ ONLY com o PEC…");
    try {
      const response = await fetch(appPath(`/api/municipalities/${selected.id}/connection?test=1`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: Number(form.port), sshPort:Number(form.sshPort) }),
      });
      const data = await response.json();
      setForm((current) => ({ ...current, password: "", sshPassword:"" }));
      setMessage(response.ok ? `Conectado com sucesso ao banco ${data.details?.database_name || "PEC"}${data.transport === "ssh_tunnel" ? " pelo túnel SSH" : ""}.` : data.message || "Falha na conexão.");
      await load();
    } catch {
      setMessage("Não foi possível concluir o teste de conexão.");
    } finally {
      setTesting(false);
    }
  }

  async function validateQueries() {
    if (!selected) return;
    setValidating(true);
    setValidation(null);
    setMessage("Validando as consultas homologadas sem acessar dados de pacientes…");
    try {
      const response = await fetch(appPath(`/api/municipalities/${selected.id}/validate`), { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Falha ao validar consultas.");
      } else {
        setValidation(data);
        setMessage(data.compatible ? "Todas as consultas são compatíveis com este PEC." : "Foram encontradas consultas incompatíveis.");
      }
    } catch {
      setMessage("Não foi possível comunicar com o servidor para validar as consultas.");
    } finally {
      setValidating(false);
    }
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
              <div className="ssh-toggle"><label className="check-label"><input type="checkbox" checked={form.sshEnabled} onChange={(e) => setForm({ ...form, sshEnabled:e.target.checked })} /> Conectar por túnel SSH</label><small>Use quando o PostgreSQL só estiver acessível a partir de um servidor intermediário.</small></div>
              {form.sshEnabled && <><h3>Servidor SSH</h3><div className="form-grid">
                <label className="wide">Host SSH<input value={form.sshHost} onChange={(e) => setForm({ ...form, sshHost:e.target.value })} placeholder="IP ou domínio do servidor SSH" required /></label>
                <label>Porta SSH<input type="number" min="1" max="65535" value={form.sshPort} onChange={(e) => setForm({ ...form, sshPort:e.target.value })} required /></label>
                <label>Usuário SSH<input value={form.sshUsername} onChange={(e) => setForm({ ...form, sshUsername:e.target.value })} required /></label>
                <label>Senha SSH<input type="password" value={form.sshPassword} onChange={(e) => setForm({ ...form, sshPassword:e.target.value })} placeholder={selected.pec?.ssh_enabled ? "•••••••• (deixe vazio para manter)" : "Senha do usuário SSH"} /></label>
                <label>Fingerprint <span className="optional-label">opcional</span><input value={form.sshHostFingerprint} onChange={(e) => setForm({ ...form, sshHostFingerprint:e.target.value })} placeholder="SHA256:..." /></label>
              </div></>}
              {selected.pec?.last_test_at && <div className="test-info"><strong>Último teste:</strong> {new Date(selected.pec.last_test_at).toLocaleString("pt-BR")}{selected.pec.last_error ? <span>{selected.pec.last_error}</span> : null}</div>}
              <div className="connection-actions"><button className="secondary-button" type="button" onClick={testConnection} disabled={testing}>{testing ? "Testando conexão…" : "Salvar e testar conexão"}</button><button className="secondary-button" type="button" onClick={validateQueries} disabled={validating || testing || selected.pec?.last_test_status !== "success"}>{validating ? "Validando…" : "Validar consultas"}</button><button className="primary-button" type="submit" disabled={testing}>Salvar configuração</button></div>
              {message && selected ? <div className="test-feedback" role="status">{message}</div> : null}
              {validation && <div className={`validation-report ${validation.compatible ? "compatible" : "error"}`}>
                <strong>{validation.compatible ? `${validation.results.length} consultas compatíveis` : "Compatibilidade parcial"}</strong>
                <span>Verificado em {new Date(validation.checkedAt).toLocaleString("pt-BR")}</span>
                <ul>{validation.results.map((result) => <li key={result.id}><span>{result.status === "compatible" ? "✓" : "✕"} {result.id.replace("tool_", "").replaceAll("_", " ")}</span>{result.error && <small>{result.error}</small>}</li>)}</ul>
              </div>}
              <small className="security-note">As senhas PostgreSQL e SSH são criptografadas no servidor antes de serem armazenadas e nunca são devolvidas ao navegador.</small>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
