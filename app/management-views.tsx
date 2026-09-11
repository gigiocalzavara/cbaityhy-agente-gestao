"use client";

import { useState } from "react";
import { appPath } from "@/lib/base-path";

export type ManagementView = "overview" | "indicators" | "active-search" | "territory";

type ToolResult = {
  toolId: string;
  kind: string;
  nominal: boolean;
  chart: boolean;
  rowCount: number;
  rows: Record<string, unknown>[];
};

type Props = {
  view: ManagementView;
  municipalityName: string;
  nominalAccess: boolean;
};

const indicatorTools = [
  { id: "tool_indicador_hipertensao", title: "Hipertensão", description: "Aferição de pressão arterial nos últimos 6 meses.", color: "blue" },
  { id: "tool_indicador_diabetes", title: "Diabetes", description: "Solicitação ou avaliação de HbA1c nos últimos 6 meses.", color: "violet" },
  { id: "tool_indicador_citopatologico", title: "Citopatológico", description: "Cobertura de rastreamento em mulheres elegíveis nos últimos 36 meses.", color: "rose" },
  { id: "tool_indicador_vacinacao_infantil", title: "Vacinação infantil", description: "Esquema de Penta e VIP em crianças de 12 a 23 meses.", color: "green" },
  { id: "tool_indicador_idoso", title: "Pessoa idosa", description: "Avaliação anual das pessoas com 60 anos ou mais.", color: "amber" },
] as const;

function pretty(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requestTool(toolId: string, parameters: Record<string, string | null> = {}) {
  const response = await fetch(appPath(`/api/tools/${toolId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parameters }),
  });
  const data = await response.json();
  if (response.status === 401) { window.location.href = appPath("/login"); throw new Error("Sessão expirada."); }
  if (!response.ok) throw new Error(data.message || "Não foi possível consultar o PEC.");
  return data as ToolResult;
}

function ResultTable({ result }: { result: ToolResult }) {
  if (!result.rows.length) return <div className="module-empty compact"><strong>Nenhum registro encontrado</strong><span>A consulta foi executada, mas não retornou dados para os filtros atuais.</span></div>;
  const columns = Object.keys(result.rows[0]);
  return <div className="module-result"><div className="module-result-head"><span>{result.nominal ? "Resultado nominal protegido" : "Resultado agregado"}</span><span>{result.rowCount} {result.rowCount === 1 ? "linha" : "linhas"}</span></div><div className="module-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column) => <td key={column}>{pretty(row[column])}</td>)}</tr>)}</tbody></table></div></div>;
}

function ModuleHeader({ eyebrow, title, description, municipalityName }: { eyebrow: string; title: string; description: string; municipalityName: string }) {
  return <header className="module-header"><div><span className="module-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><span className="municipality-chip">{municipalityName}</span></header>;
}

function Overview({ municipalityName }: { municipalityName: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Record<string, ToolResult>>({});

  async function load() {
    setLoading(true); setError("");
    try {
      const ids = ["tool_auditoria_cadastros", "tool_censo_gestantes", "tool_indicador_hipertensao", "tool_indicador_diabetes"];
      const values = await Promise.all(ids.map((id) => requestTool(id, id === "tool_censo_gestantes" ? { ine: null } : {})));
      setResults(Object.fromEntries(values.map((result) => [result.toolId, result])));
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar visão geral."); }
    finally { setLoading(false); }
  }

  const audit = results.tool_auditoria_cadastros?.rows || [];
  const pregnant = results.tool_censo_gestantes?.rows || [];
  const hypertension = results.tool_indicador_hipertensao?.rows || [];
  const diabetes = results.tool_indicador_diabetes?.rows || [];
  const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((total, row) => total + numberValue(row[key]), 0);
  const pregnancyTotal = pregnant.find((row) => row.equipe === "TOTAL MUNICIPAL")?.total_gestantes_ativas ?? sum(pregnant, "total_gestantes_ativas");
  const totalRegistrations = sum(audit, "total_cadastros");
  const validRegistrations = sum(audit, "cadastros_vigentes_24m");
  const hypertensiveTotal = sum(hypertension, "total_hipertensos_ativos");
  const hypertensiveCovered = sum(hypertension, "hipertensos_com_pa_6m");
  const diabeticTotal = sum(diabetes, "total_diabeticos_ativos");
  const diabeticCovered = sum(diabetes, "diabeticos_com_hba1c_6m");
  const percent = (value: number, total: number) => total ? `${(value / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

  return <div className="module-page"><ModuleHeader eyebrow="PAINEL MUNICIPAL" title="Visão geral" description="Leitura rápida dos principais dados assistenciais e cadastrais do PEC." municipalityName={municipalityName} /><div className="module-toolbar"><p>Os cartões são calculados diretamente no banco PEC do município ativo.</p><button onClick={load} disabled={loading}>{loading ? "Atualizando…" : Object.keys(results).length ? "Atualizar dados" : "Carregar painel"}</button></div>{error && <div className="module-alert">{error}</div>}<div className="kpi-grid"><article className="kpi-card"><span>Cadastros ativos</span><strong>{Object.keys(results).length ? pretty(totalRegistrations) : "—"}</strong><small>{Object.keys(results).length ? `${percent(validRegistrations, totalRegistrations)} vigentes em 24 meses` : "Aguardando consulta"}</small></article><article className="kpi-card"><span>Gestantes ativas</span><strong>{Object.keys(results).length ? pretty(pregnancyTotal) : "—"}</strong><small>Censo municipal identificado no PEC</small></article><article className="kpi-card"><span>Hipertensão</span><strong>{Object.keys(results).length ? percent(hypertensiveCovered, hypertensiveTotal) : "—"}</strong><small>{Object.keys(results).length ? `${pretty(hypertensiveTotal)} pessoas acompanhadas` : "PA registrada nos últimos 6 meses"}</small></article><article className="kpi-card"><span>Diabetes</span><strong>{Object.keys(results).length ? percent(diabeticCovered, diabeticTotal) : "—"}</strong><small>{Object.keys(results).length ? `${pretty(diabeticTotal)} pessoas identificadas` : "HbA1c nos últimos 6 meses"}</small></article></div><section className="module-info-grid"><article><span>01</span><div><strong>Qualidade cadastral</strong><p>Identifique rapidamente equipes com maior volume de cadastros vencidos.</p></div></article><article><span>02</span><div><strong>Cuidado continuado</strong><p>Compare cobertura de hipertensão e diabetes entre as equipes.</p></div></article><article><span>03</span><div><strong>Prioridade operacional</strong><p>Use os módulos de indicadores e busca ativa para aprofundar os achados.</p></div></article></section></div>;
}

function Indicators({ municipalityName }: { municipalityName: string }) {
  const [selected, setSelected] = useState(indicatorTools[0].id as string);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function run(id: string) { setSelected(id); setLoading(true); setError(""); setResult(null); try { setResult(await requestTool(id, id === "tool_indicador_idoso" ? { ine: null } : {})); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar indicador."); } finally { setLoading(false); } }
  return <div className="module-page"><ModuleHeader eyebrow="MONITORAMENTO" title="Indicadores" description="Acompanhe coberturas e pendências por equipe com critérios consistentes." municipalityName={municipalityName} /><div className="indicator-grid">{indicatorTools.map((item) => <button className={`indicator-card ${item.color} ${selected === item.id ? "selected" : ""}`} key={item.id} onClick={() => void run(item.id)} disabled={loading}><span className="indicator-dot" /><strong>{item.title}</strong><small>{item.description}</small><em>Consultar indicador →</em></button>)}</div>{loading && <div className="module-loading">Consultando o PEC e consolidando as equipes…</div>}{error && <div className="module-alert">{error}</div>}{result && <ResultTable result={result} />}</div>;
}

function ActiveSearch({ municipalityName, nominalAccess }: { municipalityName: string; nominalAccess: boolean }) {
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [ine, setIne] = useState("");
  async function run(id: string, parameters: Record<string, string | null>) { setLoading(id); setError(""); setResult(null); try { setResult(await requestTool(id, parameters)); } catch (err) { setError(err instanceof Error ? err.message : "Falha na busca ativa."); } finally { setLoading(""); } }
  return <div className="module-page"><ModuleHeader eyebrow="CUIDADO PRIORITÁRIO" title="Busca ativa" description="Listas operacionais protegidas para apoiar o acompanhamento das equipes." municipalityName={municipalityName} />{!nominalAccess && <div className="permission-card"><strong>Acesso nominal não habilitado</strong><p>Seu perfil pode consultar indicadores agregados, mas não pode visualizar listas de pessoas. Solicite a habilitação a um administrador.</p></div>}<div className="active-search-grid"><article className="action-card"><span className="action-icon">G</span><div><strong>Gestantes com pré-natal atrasado</strong><p>Pessoas com registro recente de gestação e mais de 30 dias sem consulta.</p></div><button disabled={!nominalAccess || Boolean(loading)} onClick={() => void run("tool_busca_ativa_gestantes_atraso", {})}>{loading === "tool_busca_ativa_gestantes_atraso" ? "Consultando…" : "Gerar lista"}</button></article><article className="action-card"><span className="action-icon">60+</span><div><strong>Idosos sem acompanhamento</strong><p>Pessoas com 60 anos ou mais sem atendimento registrado nos últimos 12 meses.</p><label>INE da equipe (opcional)<input value={ine} onChange={(event) => setIne(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Digite o INE" /></label></div><button disabled={!nominalAccess || Boolean(loading)} onClick={() => void run("tool_busca_ativa_idosos", { ine: ine || null })}>{loading === "tool_busca_ativa_idosos" ? "Consultando…" : "Gerar lista"}</button></article></div>{error && <div className="module-alert">{error}</div>}{result && <ResultTable result={result} />}</div>;
}

function Territory({ municipalityName }: { municipalityName: string }) {
  const [street, setStreet] = useState("");
  const [ine, setIne] = useState("");
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function run() { if (street.trim().length < 2) { setError("Informe ao menos dois caracteres do logradouro."); return; } setLoading(true); setError(""); setResult(null); try { setResult(await requestTool("tool_busca_territorial_rua", { logradouro: street, ine: ine || null })); } catch (err) { setError(err instanceof Error ? err.message : "Falha na consulta territorial."); } finally { setLoading(false); } }
  return <div className="module-page"><ModuleHeader eyebrow="TERRITORIALIZAÇÃO" title="Território" description="Localize cadastros por logradouro e entenda a composição do território." municipalityName={municipalityName} /><section className="territory-search"><div><label>Logradouro<strong>Qual rua ou avenida deseja analisar?</strong><input value={street} onChange={(event) => setStreet(event.target.value)} placeholder="Ex.: Rua Principal" /></label><label>INE da equipe <span>opcional</span><input value={ine} onChange={(event) => setIne(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Somente números" /></label></div><button onClick={() => void run()} disabled={loading}>{loading ? "Consultando território…" : "Pesquisar território"}</button></section><div className="territory-hints"><span>A consulta retorna</span><strong>Total de cidadãos</strong><strong>Cadastros com CPF</strong><strong>Pessoas idosas</strong><strong>Bebês menores de 2 anos</strong></div>{error && <div className="module-alert">{error}</div>}{result && <ResultTable result={result} />}</div>;
}

export function ManagementModule(props: Props) {
  if (props.view === "overview") return <Overview municipalityName={props.municipalityName} />;
  if (props.view === "indicators") return <Indicators municipalityName={props.municipalityName} />;
  if (props.view === "active-search") return <ActiveSearch municipalityName={props.municipalityName} nominalAccess={props.nominalAccess} />;
  return <Territory municipalityName={props.municipalityName} />;
}
