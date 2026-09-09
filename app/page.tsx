"use client";

import { FormEvent, useMemo, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; url?: string }[];
};

const suggestions = [
  "Explique as regras de financiamento da APS",
  "Quais são os principais pontos de atenção dos indicadores?",
  "O que a base diz sobre acompanhamento de hipertensão?",
  "Como interpretar os indicadores de saúde bucal?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const canSend = useMemo(() => input.trim().length > 1 && !loading, [input, loading]);

  async function send(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (text.length < 2 || loading) return;

    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Falha ao consultar a IA.");

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.answer, sources: data.sources || [] },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Não foi possível concluir a consulta.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CBAItyhy</strong>
            <span>Inteligência APS</span>
          </div>
        </div>

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
          <span>Base normativa compartilhada</span>
          <strong>Supabase CBAItyhy</strong>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div>
            <strong>Assistente de Gestão APS</strong>
            <span>Dados, indicadores e conhecimento normativo</span>
          </div>
          <span className="status"><i /> RAG conectado</span>
        </header>

        <div className="conversation">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✦</div>
              <h1>Como posso ajudar na gestão da APS hoje?</h1>
              <p>
                Consulte a base técnica da CBAItyhy em linguagem natural. Na próxima etapa,
                esta mesma conversa também executará os indicadores homologados diretamente no PEC.
              </p>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="avatar">{message.role === "user" ? "G" : "✦"}</div>
                  <div className="message-body">
                    <div className="message-author">{message.role === "user" ? "Você" : "CBAItyhy IA"}</div>
                    <div className="message-content">{message.content}</div>
                    {message.sources && message.sources.length > 0 && (
                      <div className="sources">
                        <span>Fontes consultadas</span>
                        {message.sources.slice(0, 5).map((source) =>
                          source.url ? (
                            <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                          ) : (
                            <span className="source-chip" key={source.id}>{source.title}</span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {loading && (
                <article className="message assistant">
                  <div className="avatar">✦</div>
                  <div className="message-body"><div className="thinking">Analisando a base CBAItyhy…</div></div>
                </article>
              )}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) void send();
                }
              }}
              placeholder="Pergunte sobre indicadores, APS, portarias, notas técnicas…"
              rows={1}
            />
            <button type="submit" disabled={!canSend}>↑</button>
          </form>
          <small>A IA pode cometer erros. Dados assistenciais serão liberados somente por tools homologadas e perfis autorizados.</small>
        </div>
      </section>
    </main>
  );
}
