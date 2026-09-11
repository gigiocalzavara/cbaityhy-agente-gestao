"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { appPath } from "@/lib/base-path";
import "./chat-markdown.css";
import "./management-views.css";
import { ManagementModule, type ManagementView } from "./management-views";

type Identity = {
  email: string;
  municipalityId: string;
  municipalityName: string;
  role: string;
  nominalAccess: boolean;
};

type Municipality = { id: string; name: string; state_code: string; ibge_code: string; pec?: { last_test_status?: string | null } | null };

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

function inlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) { rows.push(tableCells(lines[index])); index += 1; }
      blocks.push(<div className="markdown-table-wrap" key={`table-${index}`}><table className="markdown-table"><thead><tr>{headers.map((header, cell) => <th key={cell}>{inlineMarkdown(header)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cell) => <td key={cell}>{inlineMarkdown(row[cell] || "—")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const Heading = heading[1].length <= 2 ? "h3" : "h4";
      blocks.push(<Heading key={`heading-${index}`}>{inlineMarkdown(heading[2])}</Heading>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^[-*]\s+/, "")); index += 1; }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index].trim()) && !/^[-*]\s+/.test(lines[index].trim()) && !(index + 1 < lines.length && lines[index].includes("|") && isTableDivider(lines[index + 1]))) { paragraph.push(lines[index].trim()); index += 1; }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }

  return <div className="markdown-content">{blocks}</div>;
}

function DataPresentation({ presentation }: { presentation: Presentation }) {
  const max = Math.max(...(presentation.chart?.data.map((item) => Math.abs(item.value)) || [1]), 1);
  return (
    <div className="data-result">
      <div className="data-result-head"><span>{presentation.nominal ? "Busca ativa" : "Dados do PEC"}</span><code>{presentation.toolId}</code></div>
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
      <div className="table-wrap"><table><thead><tr>{presentation.columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{presentation.rows.map((row, index) => <tr key={index}>{presentation.columns.map((column) => <td key={column}>{pretty(row[column])}</td>)}</tr>)}</tbody></table></div>
    </div>
  );
}

export default function Home() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"assistant" | ManagementView>("assistant");

  async function loadIdentity() {
    const response = await fetch(appPath("/api/auth/me"), { cache: "no-store" });
    if (!response.ok) { window.location.href = appPath("/login"); return; }
    setIdentity(await response.json());
    const municipalitiesResponse = await fetch(appPath("/api/municipalities"), { cache: "no-store" });
    if (municipalitiesResponse.ok) setMunicipalities(await municipalitiesResponse.json());
  }

  useEffect(() => { void loadIdentity(); }, []);

  const canSend = useMemo(() => input.trim().length > 1 && !loading && Boolean(identity), [input, loading, identity]);

  async function changeMunicipality(municipalityId: string) {
    const response = await fetch(appPath("/api/municipalities/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ municipalityId }),
    });
    if (!response.ok) return;
    setMessages([]);
    await loadIdentity();
  }

  async function send(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (text.length < 2 || loading || !identity) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput(""); setLoading(true);
    try {
      const response = await fetch(appPath("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history }) });
      const data = await response.json();
      if (response.status === 401) { window.location.href = appPath("/login"); return; }
      if (!response.ok) throw new Error(data.message || "Falha ao consultar a IA.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer, sources: data.sources || [], toolUsed: data.toolUsed, presentation: data.presentation }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error instanceof Error ? error.message : "Não foi possível concluir a consulta." }]);
    } finally { setLoading(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }
  async function logout() { await fetch(appPath("/api/auth/logout"), { method: "POST" }); window.location.href = appPath("/login"); }
  if (!identity) return <main className="loading-screen">Carregando ambiente de gestão…</main>;

  const currentMunicipality = municipalities.find((item) => item.id === identity.municipalityId);
  const pecConnected = currentMunicipality?.pec?.last_test_status === "success";
  const sectionTitles = { assistant: "Assistente de Gestão APS", overview: "Visão geral", indicators: "Indicadores", "active-search": "Busca ativa", territory: "Território" };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">C</div><div><strong>CBAItyhy</strong><span>Inteligência APS</span></div></div>
        <button className="new-chat" onClick={() => { setMessages([]); setActiveSection("assistant"); }}>+ Nova análise</button>
        <nav>
          <span className="nav-label">GESTÃO</span>
          <button className={`nav-item ${activeSection === "assistant" ? "active" : ""}`} onClick={() => setActiveSection("assistant")}>Assistente IA</button>
          <button className={`nav-item ${activeSection === "overview" ? "active" : ""}`} onClick={() => setActiveSection("overview")}>Visão geral</button>
          <button className={`nav-item ${activeSection === "indicators" ? "active" : ""}`} onClick={() => setActiveSection("indicators")}>Indicadores</button>
          <button className={`nav-item ${activeSection === "active-search" ? "active" : ""}`} onClick={() => setActiveSection("active-search")}>Busca ativa</button>
          <button className={`nav-item ${activeSection === "territory" ? "active" : ""}`} onClick={() => setActiveSection("territory")}>Território</button>
          {identity.role === "admin" && <a className="nav-item nav-link" href={appPath("/admin/municipios")}>Municípios / PEC</a>}
        </nav>
        <div className="sidebar-footer">
          <span>Município ativo</span>
          <select className="municipality-select" value={identity.municipalityId} onChange={(event) => void changeMunicipality(event.target.value)}>
            {municipalities.map((municipality) => <option value={municipality.id} key={municipality.id}>{municipality.name} - {municipality.state_code} · {municipality.ibge_code}</option>)}
          </select>
          <span className="profile-line">{identity.role}{identity.nominalAccess ? " · nominal habilitado" : ""}</span>
          <button className="logout-button" onClick={logout}>Sair</button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div><strong>{sectionTitles[activeSection]}</strong><span>{identity.municipalityName} · PEC + conhecimento normativo</span></div>
          <div className="status-group"><span className="status"><i /> RAG conectado</span><span className={`status pec ${pecConnected ? "" : "offline"}`}><i /> {pecConnected ? "PEC conectado" : "PEC não validado"}</span></div>
        </header>
        {activeSection === "assistant" ? <><div className="conversation">
          {messages.length === 0 ? (
            <div className="welcome"><div className="welcome-icon">✦</div><h1>O que você quer analisar na APS?</h1><p>Converse com os dados do PEC de <strong>{identity.municipalityName}</strong> e com a base técnica da CBAItyhy. A conexão de dados é isolada por município.</p><div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div></div>
          ) : (
            <div className="messages">{messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="avatar">{message.role === "user" ? "G" : "✦"}</div><div className="message-body"><div className="message-author">{message.role === "user" ? "Você" : "CBAItyhy IA"}</div><div className="message-content">{message.role === "assistant" ? <MarkdownMessage content={message.content} /> : message.content}</div>{message.presentation && <DataPresentation presentation={message.presentation} />}{message.sources && message.sources.length > 0 && <div className="sources"><span>Fontes consultadas</span>{message.sources.slice(0, 5).map((source) => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span className="source-chip" key={source.id}>{source.title}</span>)}</div>}</div></article>)}{loading && <article className="message assistant"><div className="avatar">✦</div><div className="message-body"><div className="thinking">Consultando dados e analisando evidências…</div></div></article>}</div>
          )}
        </div>
        <div className="composer-wrap"><form className="composer" onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (canSend) void send(); } }} placeholder={`Pergunte sobre ${identity.municipalityName}…`} rows={1} /><button type="submit" disabled={!canSend}>↑</button></form><small>Consultas assistenciais usam somente tools SQL homologadas e a conexão PEC do município ativo.</small></div></> : <div className="module-scroll"><ManagementModule key={identity.municipalityId} view={activeSection} municipalityName={identity.municipalityName} nominalAccess={identity.nominalAccess} /></div>}
      </section>
    </main>
  );
}
