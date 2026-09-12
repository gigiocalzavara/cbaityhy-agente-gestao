"use client";

import { useEffect, useState } from "react";
import { appPath } from "@/lib/base-path";
import { getOfficialIndicators, type IndicatorGroup, type OfficialIndicator } from "@/lib/official-indicators";

export type ManagementView = "overview" | "indicators" | "active-search" | "territory";

type ToolResult = {
  toolId: string;
  kind: string;
  nominal: boolean;
  chart: boolean;
  rowCount: number;
  rows: Record<string, unknown>[];
  cache?: { hit: boolean; generatedAt: string; stale: boolean };
};

type Props = {
  view: ManagementView;
  municipalityName: string;
  nominalAccess: boolean;
};

const indicatorColors = ["blue", "green", "rose", "violet", "blue", "amber", "rose"] as const;
const indicatorGroups: Array<{id:IndicatorGroup;label:string;title:string}> = [
  { id:"aps", label:"APS C1–C7", title:"Indicadores APS" },
  { id:"oral", label:"Saúde Bucal B1–B6", title:"Indicadores de Saúde Bucal" },
  { id:"emulti", label:"eMulti M1–M2", title:"Indicadores eMulti" },
];

function pretty(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const indicatorMetricColumns: Record<string, { numerator: string; denominator: string }> = {
  C2: { numerator: "com_esquema_completo", denominator: "total_criancas_elegiveis" },
  C3: { numerator: "total_gestantes_ativas", denominator: "total_gestantes_ativas" },
  C4: { numerator: "diabeticos_com_hba1c_6m", denominator: "total_diabeticos_ativos" },
  C5: { numerator: "hipertensos_com_pa_6m", denominator: "total_hipertensos_ativos" },
  C6: { numerator: "idosos_com_avaliacao_anual", denominator: "total_idosos_cadastrados" },
  C7: { numerator: "mulheres_com_preventivo_36m", denominator: "total_mulheres_elegiveis" },
  B1: { numerator: "pessoas_primeira_consulta", denominator: "pessoas_vinculadas_referencia" },
  B2: { numerator: "pessoas_tratamento_concluido", denominator: "pessoas_primeira_consulta" },
};

function indicatorSummary(indicator: OfficialIndicator, result?: ToolResult) {
  if (!result) return null;
  const metric = indicatorMetricColumns[indicator.id];
  if (!metric) return null;
  const rows = result.rows.filter((row) => row.equipe !== "TOTAL MUNICIPAL");
  const denominator = rows.reduce((total, row) => total + numberValue(row[metric.denominator]), 0);
  const numerator = rows.reduce((total, row) => total + numberValue(row[metric.numerator]), 0);
  if (indicator.id === "C3") return { value: pretty(numerator), detail: "gestantes identificadas" };
  if (indicator.id === "B1") return { value: pretty(numerator), detail: "pessoas com primeira consulta no mês; denominador SCNES pendente" };
  return {
    value: denominator ? `${(numerator / denominator * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—",
    detail: `${pretty(numerator)} de ${pretty(denominator)} pessoas`,
  };
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
  return <div className="module-result"><div className="module-result-head"><span>{result.nominal ? "Resultado nominal protegido" : "Resultado agregado"}{result.cache?.hit ? ` · Atualizado em ${new Date(result.cache.generatedAt).toLocaleString("pt-BR")}${result.cache.stale ? " · última versão disponível" : ""}` : ""}</span><span>{result.rowCount} {result.rowCount === 1 ? "linha" : "linhas"}</span></div><div className="module-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column) => <td key={column}>{pretty(row[column])}</td>)}</tr>)}</tbody></table></div></div>;
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
      const tools: Array<{ id: string; label: string; parameters: Record<string, string | null> }> = [
        { id: "tool_auditoria_cadastros", label: "qualidade cadastral", parameters: {} },
        { id: "tool_censo_gestantes", label: "gestantes", parameters: { ine: null } },
        { id: "tool_indicador_hipertensao", label: "hipertensão", parameters: {} },
        { id: "tool_indicador_diabetes", label: "diabetes", parameters: {} },
      ];
      const loaded: Record<string, ToolResult> = {};
      const failures: string[] = [];
      for (const tool of tools) {
        try {
          const result = await requestTool(tool.id, tool.parameters);
          loaded[result.toolId] = result;
          setResults({ ...loaded });
        } catch (toolError) {
          const detail = toolError instanceof Error ? toolError.message : "falha na consulta";
          failures.push(`${tool.label}: ${detail}`);
        }
      }
      setResults(loaded);
      if (failures.length) setError(`Alguns cartões não puderam ser atualizados. ${failures.join(" · ")}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar visão geral."); }
    finally { setLoading(false); }
  }

  const audit = results.tool_auditoria_cadastros?.rows || [];
  const pregnant = results.tool_censo_gestantes?.rows || [];
  const hypertension = results.tool_indicador_hipertensao?.rows || [];
  const diabetes = results.tool_indicador_diabetes?.rows || [];
  const hasAudit = Boolean(results.tool_auditoria_cadastros);
  const hasPregnant = Boolean(results.tool_censo_gestantes);
  const hasHypertension = Boolean(results.tool_indicador_hipertensao);
  const hasDiabetes = Boolean(results.tool_indicador_diabetes);
  const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((total, row) => total + numberValue(row[key]), 0);
  const pregnancyTotal = pregnant.find((row) => row.equipe === "TOTAL MUNICIPAL")?.total_gestantes_ativas ?? sum(pregnant, "total_gestantes_ativas");
  const totalRegistrations = sum(audit, "total_cadastros");
  const validRegistrations = sum(audit, "cadastros_vigentes_24m");
  const hypertensiveTotal = sum(hypertension, "total_hipertensos_ativos");
  const hypertensiveCovered = sum(hypertension, "hipertensos_com_pa_6m");
  const diabeticTotal = sum(diabetes, "total_diabeticos_ativos");
  const diabeticCovered = sum(diabetes, "diabeticos_com_hba1c_6m");
  const percent = (value: number, total: number) => total ? `${(value / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

  return <div className="module-page"><ModuleHeader eyebrow="PAINEL MUNICIPAL" title="Visão geral" description="Leitura rápida dos principais dados assistenciais e cadastrais do PEC." municipalityName={municipalityName} /><div className="module-toolbar"><p>Os cartões são calculados diretamente no banco PEC do município ativo.</p><button onClick={load} disabled={loading}>{loading ? "Atualizando…" : Object.keys(results).length ? "Atualizar dados" : "Carregar painel"}</button></div>{error && <div className="module-alert">{error}</div>}<div className="kpi-grid"><article className="kpi-card"><span>Cadastros ativos</span><strong>{hasAudit ? pretty(totalRegistrations) : "—"}</strong><small>{hasAudit ? `${percent(validRegistrations, totalRegistrations)} vigentes em 24 meses` : "Aguardando consulta"}</small></article><article className="kpi-card"><span>Gestantes ativas</span><strong>{hasPregnant ? pretty(pregnancyTotal) : "—"}</strong><small>Censo municipal identificado no PEC</small></article><article className="kpi-card"><span>Hipertensão</span><strong>{hasHypertension ? percent(hypertensiveCovered, hypertensiveTotal) : "—"}</strong><small>{hasHypertension ? `${pretty(hypertensiveTotal)} pessoas acompanhadas` : "PA registrada nos últimos 6 meses"}</small></article><article className="kpi-card"><span>Diabetes</span><strong>{hasDiabetes ? percent(diabeticCovered, diabeticTotal) : "—"}</strong><small>{hasDiabetes ? `${pretty(diabeticTotal)} pessoas identificadas` : "HbA1c nos últimos 6 meses"}</small></article></div><section className="module-info-grid"><article><span>01</span><div><strong>Qualidade cadastral</strong><p>Identifique rapidamente equipes com maior volume de cadastros vencidos.</p></div></article><article><span>02</span><div><strong>Cuidado continuado</strong><p>Compare cobertura de hipertensão e diabetes entre as equipes.</p></div></article><article><span>03</span><div><strong>Prioridade operacional</strong><p>Use os módulos de indicadores e busca ativa para aprofundar os achados.</p></div></article></section></div>;
}

function Indicators({ municipalityName }: { municipalityName: string }) {
  const [group, setGroup] = useState<IndicatorGroup>("aps");
  const indicatorTools = getOfficialIndicators(group).map((indicator, index) => ({ ...indicator, color: indicatorColors[index % indicatorColors.length] }));
  const [selected, setSelected] = useState("C1");
  const [results, setResults] = useState<Record<string, ToolResult>>({});
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const selectedIndicator = indicatorTools.find((item) => item.id === selected) || indicatorTools[0];
  const selectedResult = results[selected] || null;
  function changeGroup(next: IndicatorGroup) { setGroup(next); setSelected(getOfficialIndicators(next)[0].id); setError(""); }
  async function run(item: OfficialIndicator) {
    setSelected(item.id); setError("");
    if (!item.toolId) { setError(`${item.id} está metodologicamente definido e aguarda o mapeamento das estruturas deste PEC: ${item.requiredDomains.join(", ")}.`); return; }
    if (results[item.id]) return;
    setLoading(item.id);
    try {
      const loaded = await requestTool(item.toolId, item.toolId === "tool_indicador_idoso" || item.toolId === "tool_censo_gestantes" ? { ine: null } : {});
      setResults((current) => ({ ...current, [item.id]: loaded }));
    }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar indicador."); }
    finally { setLoading(""); }
  }
  const groupTitle = indicatorGroups.find((item) => item.id === group)?.title || "Indicadores";
  const weights = selectedIndicator.weights || [];
  const formula = selectedIndicator.formula || (selectedIndicator.id === "C1" ? "Programados ÷ (programados + espontâneos) × 100." : "Média da pontuação individual das boas práticas por equipe.");
  useEffect(() => {
    const alert = document.querySelector<HTMLElement>(".methodology-alert");
    const title = alert?.querySelector("strong");
    const description = alert?.querySelector("span");
    if (title) title.textContent = "Prévia local conectada";
    if (description) description.textContent = `Os dados abaixo são calculados no PEC de ${municipalityName}. Compare competência, denominador e resultado por INE com o painel federal antes de tratá-los como valores oficiais.`;
  }, [municipalityName, group]);
  useEffect(() => {
    let active = true;
    const available = getOfficialIndicators(group).filter((item) => item.toolId);
    if (!available.length) return () => { active = false; };
    void Promise.allSettled(available.map(async (item) => {
      if (results[item.id] || !item.toolId) return;
      const loaded = await requestTool(item.toolId, item.toolId === "tool_indicador_idoso" || item.toolId === "tool_censo_gestantes" ? { ine: null } : {});
      if (active) setResults((current) => ({ ...current, [item.id]: loaded }));
    }));
    return () => { active = false; };
  // Results are intentionally omitted so each group is hydrated once from the daily cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, municipalityName]);
  return <div className="module-page"><ModuleHeader eyebrow="INDICADORES FEDERAIS · CÁLCULO LOCAL" title={groupTitle} description="Cálculos gerenciais baseados nas fichas técnicas do Ministério da Saúde. O painel identifica claramente resultados parciais até a conciliação com o SIAPS/Saúde 360." municipalityName={municipalityName} /><nav className="indicator-tabs">{indicatorGroups.map((item) => <button key={item.id} className={group === item.id ? "active" : ""} onClick={() => changeGroup(item.id)}>{item.label}</button>)}</nav><div className="methodology-alert"><strong>PEC conectado</strong><span>Os resultados disponíveis usam o cache diário de {municipalityName}. Indicadores incompletos continuam identificados como recortes parciais e não substituem o resultado oficial.</span></div><div className="indicator-grid">{indicatorTools.map((item) => { const summary = indicatorSummary(item, results[item.id]); return <button className={`indicator-card ${item.color} ${selected === item.id ? "selected" : ""}`} key={item.id} onClick={() => void run(item)} disabled={Boolean(loading)}><span className="indicator-code">{item.id}</span><span className={`indicator-status ${item.toolId ? "available" : "pending"}`}>{item.toolId ? (results[item.id]?.cache?.hit ? "Cache diário" : "Recorte parcial") : "Mapeamento pendente"}</span><strong>{item.title}</strong>{summary ? <div className="indicator-summary"><b>{summary.value}</b><span>{summary.detail}</span></div> : <small>{item.description}</small>}<em>{loading === item.id ? "Carregando…" : item.toolId ? "Ver detalhamento por equipe →" : "Ver metodologia →"}</em></button>; })}</div><section className="practice-panel"><header><div><span>{selectedIndicator.id}</span><strong>{selectedIndicator.title}</strong></div><small>{weights.length ? "Pontuação metodológica: 100" : selectedIndicator.unit || "Indicador"}</small></header>{weights.length ? <div className="practice-grid">{weights.map((practice) => <article key={practice.code}><span>{practice.code}</span><p>{practice.label}</p><strong>{practice.points} pts</strong></article>)}</div> : <div className="formula-detail"><p>{formula}</p>{selectedIndicator.ranges && <small>{selectedIndicator.ranges}</small>}<span>Dados necessários: {selectedIndicator.requiredDomains.join(" · ")}</span></div>}</section>{loading && <div className="module-loading">Carregando o resultado armazenado do PEC…</div>}{error && <div className="module-alert">{error}</div>}{selectedResult && <ResultTable result={selectedResult} />}</div>;
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
