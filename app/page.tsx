"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Identity = {
  email: string;
  municipalityName: string;
  role: string;
  nominalAccess: boolean;
};

type Presentation = {
  kind: string;
  nominal: boolean;
  toolId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  chart?: { type: string; labelKey: string; valueKey: string; data: { label: string; value: number }[] } | null;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; url?: string }[];
  toolUsed?: string | null;
  presentation?: Presentation | null;
};

const suggestions = [
  "Como está o indicador de hipertensão do município?",
  "Quais equipes precisam de mais atenção em diabetes?",
  "Faça uma auditoria dos cadastros da APS",
  "Explique as regras de financiamento da APS",
];

function pretty(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function DataPresentation({ presentation }: { presentation: Presentation }) {
  const max = Math.max(...(presentation.chart?.data.map((item) => Math.abs(item.value)) || [1]), 1);
  return (
    <div className="data-result">
      <div className="data-result-head">
        <span>{presentation.nominal ? "Busca ativa" : "Dados do PEC"}</span>
        <code>{presentation.toolId}</code>
      </div>

      {presentation.chart && presentation.chart.data.length > 0 && (
        <div className="inline-chart">
          <div className="chart-title">{presentation.chart.valueKey.replaceAll("_", " ")}</div>
          {presentation.chart.data.map((item, index) => (
            <div className="bar-row" key={`${item.label}-${index}`}>
              <span className="bar-label">{item.label || "Sem identificação"}</span>
              <div className="bar-track"><i style={{ width: `${Math.max(2, Math.min(100, Math.abs(item.value) / max * 100))}%` }} /></div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>{presentation.columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>
            {presentation.rows.map((row, index) => (
              <tr key={index}>{presentation.columns.map((column) => <td key={column}>{pretty(row[column])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) {
        window.location.href = "/login";
        return;
      }
      setIdentity(await response.json());
    });
  }, []);

  const canSend = useMemo(() => input.trim().length > 1 && !loading && Boolean(identity), [input, loading, identity]);

  async function send(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (text.length < 2 || loading || !identity) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error(data.message || "Falha ao consultar a IA.");

      setMessages((current) => [...current, {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        toolUsed: data.toolUsed,
        presentation: data.presentation,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Não foi possível concluir a consulta.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!identity) return <main className="loading-screen">Carregando ambiente de gestão…</main>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">C</div><div><strong>CBAItyhy</strong><span>Inteligência APS</span></div></div>
        <button className="new-chat" onClick={() => setMessages([])}>+ Nova análise</button>
        <nav>
          <span className="nav-label">GESTÃO</span>
          <button className="nav-item active">Assistente IA</button>
          <button className="nav-item" disabled>Visão geral</button>
          <button className="nav-item" disabled>Indicadores</button>
          <button className="nav-item" disabled>Busca ativa</button>
          <button className="nav-item" disabled>Território</button>
        </nav>
        <div className="sidebar-footer">
          <span>Município ativo</span><strong>{identity.municipalityName}</strong>
          <span className="profile-line">{identity.role}{identity.nominalAccess ? " · nominal habilitado" : ""}</span>
          <button className="logout-button" onClick={logout}>Sair</button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div><strong>Assistente de Gestão APS</strong><span>{identity.municipalityName} · PEC + conhecimento normativo</span></div>
          <div className="status-group"><span className="status"><i /> RAG conectado</span><span className="status pec"><i /> PEC habilitado</span></div>
        </header>

        <div className="conversation">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✦</div>
              <h1>O que você quer analisar na APS?</h1>
              <p>Converse com os dados do PEC e com a base técnica da CBAItyhy. O agente escolhe automaticamente quando consultar indicadores, território ou conhecimento normativo.</p>
              <div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="avatar">{message.role === "user" ? "G" : "✦"}</div>
                  <div className="message-body">
                    <div className="message-author">{message.role === "user" ? "Você" : "CBAItyhy IA"}</div>
                    <div className="message-content">{message.content}</div>
                    {message.presentation && <DataPresentation presentation={message.presentation} />}
                    {message.sources && message.sources.length > 0 && (
                      <div className="sources"><span>Fontes consultadas</span>{message.sources.slice(0, 5).map((source) => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span className="source-chip" key={source.id}>{source.title}</span>)}</div>
                    )}
                  </div>
                </article>
              ))}
              {loading && <article className="message assistant"><div className="avatar">✦</div><div className="message-body"><div className="thinking">Consultando dados e analisando evidências…</div></div></article>}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={submit}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (canSend) void send(); } }} placeholder="Pergunte: como está a hipertensão? Quais equipes precisam de atenção?…" rows={1} />
            <button type="submit" disabled={!canSend}>↑</button>
          </form>
          <small>Consultas assistenciais usam somente tools SQL homologadas. Dados nominais dependem do perfil autorizado.</small>
        </div>
      </section>
    </main>
  );
}
