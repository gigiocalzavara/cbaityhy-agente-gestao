"use client";

import { useEffect, useRef, useState } from "react";
import { appPath } from "@/lib/base-path";
import { getOfficialIndicators, type IndicatorGroup, type OfficialIndicator } from "@/lib/official-indicators";
import { ExportButtons } from "./export-buttons";

export type ManagementView = "overview" | "registration-links" | "indicators" | "active-search" | "territory";

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
  C1: { numerator: "atendimentos_programados", denominator: "total_atendimentos" },
  // C2 integral não deve usar o recorte vacinal como resultado oficial.
  C2: { numerator: "numerador_pontos", denominator: "denominador_criancas" },
  C3: { numerator: "numerador_pontos", denominator: "denominador_gestantes_puerperas" },
  C4: { numerator: "diabeticos_com_hba1c_6m", denominator: "total_diabeticos_ativos" },
  C5: { numerator: "hipertensos_com_pa_6m", denominator: "total_hipertensos_ativos" },
  C6: { numerator: "idosos_com_avaliacao_anual", denominator: "total_idosos_cadastrados" },
  C7: { numerator: "mulheres_com_preventivo_36m", denominator: "total_mulheres_elegiveis" },
  B1: { numerator: "pessoas_primeira_consulta", denominator: "pessoas_vinculadas_referencia" },
  B2: { numerator: "pessoas_tratamento_concluido", denominator: "pessoas_primeira_consulta" },
  B3: { numerator: "total_exodontias", denominator: "total_procedimentos_elegiveis" },
  B5: { numerator: "procedimentos_preventivos", denominator: "total_procedimentos_odontologicos" },
  B6: { numerator: "procedimentos_tra_art", denominator: "total_procedimentos_restauradores" },
};

function indicatorSummary(indicator: OfficialIndicator, result?: ToolResult) {
  if (!result) return null;
  const metric = indicatorMetricColumns[indicator.id];
  if (!metric) return null;
  const rows = result.rows.filter((row) => row.equipe !== "TOTAL MUNICIPAL");
  if (!rows.length && (indicator.id.startsWith("B") || indicator.id === "C1")) {
    return { value: "—", detail: indicator.id === "C1" ? "Sem atendimentos elegíveis no município ativo neste mês" : "Sem produção odontológica elegível no município ativo neste mês" };
  }
  const denominator = rows.reduce((total, row) => total + numberValue(row[metric.denominator]), 0);
  const numerator = rows.reduce((total, row) => total + numberValue(row[metric.numerator]), 0);
  if (indicator.id === "B1") return {
    value: denominator ? `${(numerator / denominator * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—",
    detail: denominator ? `${pretty(numerator)} primeiras consultas para ${pretty(denominator)} pessoas vinculadas` : "Vínculo populacional da equipe não identificado",
  };
  const score = denominator ? (["C2", "C3"].includes(indicator.id) ? numerator / denominator : numerator / denominator * 100) : null;
  return {
    value: score === null ? "—" : `${score.toLocaleString("pt-BR", { maximumFractionDigits: ["C2", "C3"].includes(indicator.id) ? 2 : 1 })}%`,
    detail: ["C2", "C3"].includes(indicator.id)
      ? `${pretty(numerator)} pontos para ${pretty(denominator)} ${indicator.id === "C2" ? "crianças" : "gestantes/puérperas"}`
      : `${pretty(numerator)} de ${pretty(denominator)} pessoas`,
  };
}

function scoreBand(value: number | null, indicatorId: string) {
  if (value === null) return { label: "Informativo", tone: "neutral" };
  if (indicatorId === "C1") {
    if (value > 50 && value <= 70) return { label: "Ótimo", tone: "great" };
    if (value > 30 && value <= 50) return { label: "Bom", tone: "good" };
    if (value > 10 && value <= 30) return { label: "Suficiente", tone: "enough" };
    return { label: "Regular", tone: "attention" };
  }
  if (value > 75) return { label: "Ótimo", tone: "great" };
  if (value > 50) return { label: "Bom", tone: "good" };
  if (value > 25) return { label: "Suficiente", tone: "enough" };
  return { label: "Regular", tone: "attention" };
}

function IndicatorAggregateView({ group, groupTitle, changeGroup, indicatorTools, selected, run, loading, selectedIndicator, weights, formula, selectedResult, error, municipalityName }: {
  group: IndicatorGroup; groupTitle: string; changeGroup: (group: IndicatorGroup) => void;
  indicatorTools: Array<OfficialIndicator & { color: typeof indicatorColors[number] }>;
  selected: string; run: (item: OfficialIndicator) => Promise<void>; loading: string;
  selectedIndicator: OfficialIndicator; weights: NonNullable<OfficialIndicator["weights"]>; formula: string;
  selectedResult: ToolResult | null; error: string; municipalityName: string;
}) {
  const [query, setQuery] = useState("");
  const metric = indicatorMetricColumns[selectedIndicator.id];
  const rows = (selectedResult?.rows || []).filter((row) => row.equipe !== "TOTAL MUNICIPAL");
  const filteredRows = rows.filter((row) => `${String(row.equipe || "")} ${String(row.nu_ine || row.ine || "")}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  const numerator = metric ? rows.reduce((total, row) => total + numberValue(row[metric.numerator]), 0) : 0;
  const denominator = metric ? rows.reduce((total, row) => total + numberValue(row[metric.denominator]), 0) : 0;
  const isC2Partial = false;
  const isC2Full = selectedIndicator.id === "C2";
  const isC3Full = selectedIndicator.id === "C3";
  const isPointBased = isC2Full || isC3Full;
  const municipalScore = metric && denominator ? (isPointBased ? numerator / denominator : numerator / denominator * 100) : null;
  const c2VaccinationScore = isC2Partial && denominator ? numerator / denominator * 100 : null;
  const exportRows = filteredRows.map((row) => {
    const rowNumerator = metric ? numberValue(row[metric.numerator]) : 0;
    const rowDenominator = metric ? numberValue(row[metric.denominator]) : 0;
    const score = metric && rowDenominator ? (isPointBased ? rowNumerator / rowDenominator : rowNumerator / rowDenominator * 100) : null;
    const practices = isC2Full ? { A: numberValue(row.pratica_a), B: numberValue(row.pratica_b), C: numberValue(row.pratica_c), D: numberValue(row.pratica_d), E: numberValue(row.pratica_e) } : isC3Full ? { A: numberValue(row.pratica_a), B: numberValue(row.pratica_b), C: numberValue(row.pratica_c), D: numberValue(row.pratica_d), E: numberValue(row.pratica_e), F: numberValue(row.pratica_f), G: numberValue(row.pratica_g), H: numberValue(row.pratica_h), I: numberValue(row.pratica_i), J: numberValue(row.pratica_j), K: numberValue(row.pratica_k) } : {};
    return { equipe: row.equipe || "SEM EQUIPE", ine: row.nu_ine || row.ine || "-", ...practices, numerador: rowNumerator, denominador: rowDenominator, resultado: score === null ? "Informativo" : `${score.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, classificacao: scoreBand(score, selectedIndicator.id).label };
  });

  return <div className="module-page indicator-page-redesign">
    <ModuleHeader eyebrow="INDICADORES DA ATENÇÃO PRIMÁRIA" title={groupTitle} description="Compare o resultado geral do município e identifique rapidamente as equipes que precisam de maior atenção." municipalityName={municipalityName} />
    <nav className="indicator-tabs">{indicatorGroups.map((item) => <button key={item.id} className={group === item.id ? "active" : ""} onClick={() => changeGroup(item.id)}>{item.label}</button>)}</nav>
    <div className="indicator-selector-grid">{indicatorTools.map((item) => { const summary = indicatorSummary(item, selected === item.id ? selectedResult || undefined : undefined); return <button className={`indicator-selector ${selected === item.id ? "selected" : ""}`} key={item.id} onClick={() => void run(item)} disabled={Boolean(loading)}><span>{item.id}</span><div><strong>{item.title}</strong><small>{summary?.value || item.description}</small></div></button>; })}</div>
    <section className="indicator-focus-head"><div><span>{selectedIndicator.id}</span><div><strong>{selectedIndicator.title}</strong><small>{selectedIndicator.description}</small></div></div><em>Prévia local · confira com SIAPS/Saúde 360</em></section>
    {loading && <div className="module-loading">Carregando resultado…</div>}
    {error && <div className="module-alert">{error}</div>}
    {selectedResult && <>
      <section className="indicator-summary-grid">
        <article className="primary"><span>{isC2Partial ? "C2 municipal" : "Resultado municipal"}</span><strong>{isC2Partial ? "Em conciliação" : municipalScore === null ? "Informativo" : `${municipalScore.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</strong><small>{isC2Partial ? "Não confundir vacinação isolada com o C2 completo" : scoreBand(municipalScore, selectedIndicator.id).label}</small></article>
        <article><span>Equipes avaliadas</span><strong>{rows.length}</strong><small>ESFs com resultado disponível</small></article>
        <article><span>{isPointBased ? "NM · Pontos obtidos" : isC2Partial ? "E · Vacinação" : "Atendem ao critério"}</span><strong>{isC2Partial && c2VaccinationScore !== null ? `${c2VaccinationScore.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : pretty(numerator)}</strong><small>{isC2Partial ? `${pretty(numerator)} crianças com esquema identificado` : "Numerador municipal"}</small></article>
        <article><span>{isC2Full ? "DN · Crianças consideradas" : isC3Full ? "DN · Gestantes e puérperas" : isC2Partial ? "Crianças no recorte local" : "População considerada"}</span><strong>{pretty(denominator)}</strong><small>{isC2Partial ? "Denominador do recorte vacinal; não é o denominador oficial integral do C2" : "Denominador municipal"}</small></article>
      </section>
      <section className="team-results-card">
        <header><div><strong>{isC2Partial ? "Recorte E · Vacinação por ESF" : "Resumo das ESFs"}</strong><span>{isC2Partial ? "O C2 completo será apresentado por A, B, C, D e E após conciliação metodológica" : "Resultados agregados por equipe"}</span></div><div className="team-results-actions"><label>Buscar equipe ou INE<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: ESF 01" /></label><ExportButtons data={{ title: `${selectedIndicator.id} - ${selectedIndicator.title} por equipe`, municipalityName, columns: Object.keys(exportRows[0] || {}), rows: exportRows }} /></div></header>
        <div className="team-results-table"><table><thead><tr><th>Equipe</th>{isC2Full && <><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></>}{isC3Full && <><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>G</th><th>H</th><th>I</th><th>J</th><th>K</th></>}<th>{isPointBased ? "NM" : isC2Partial ? "Com vacinação identificada" : "Numerador"}</th><th>{isPointBased ? "DN" : isC2Partial ? "Crianças no recorte" : "Denominador"}</th><th>{isC2Partial ? "Cobertura E" : "Resultado"}</th><th>{isC2Partial ? "Leitura" : "Classificação"}</th></tr></thead><tbody>{exportRows.map((row) => { const rawScore = typeof row.resultado === "string" && row.resultado.endsWith("%") ? Number(row.resultado.replace("%", "").replace(".", "").replace(",", ".")) : null; const band = scoreBand(rawScore, selectedIndicator.id); return <tr key={`${String(row.ine)}-${String(row.equipe)}`}><td><strong>{String(row.equipe)}</strong><small>{String(row.ine)}</small></td>{isC2Full && <><td>{pretty(row.A)}</td><td>{pretty(row.B)}</td><td>{pretty(row.C)}</td><td>{pretty(row.D)}</td><td>{pretty(row.E)}</td></>}{isC3Full && <><td>{pretty(row.A)}</td><td>{pretty(row.B)}</td><td>{pretty(row.C)}</td><td>{pretty(row.D)}</td><td>{pretty(row.E)}</td><td>{pretty(row.F)}</td><td>{pretty(row.G)}</td><td>{pretty(row.H)}</td><td>{pretty(row.I)}</td><td>{pretty(row.J)}</td><td>{pretty(row.K)}</td></>}<td>{pretty(row.numerador)}</td><td>{pretty(row.denominador)}</td><td><b className={`score-value ${isC2Partial ? "neutral" : band.tone}`}>{isC2Partial && metric ? `${(numberValue(row.numerador) / Math.max(1, numberValue(row.denominador)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : String(row.resultado)}</b></td><td>{isC2Partial ? <span className="score-class neutral">Componente E</span> : <span className={`score-class ${band.tone}`}>{String(row.classificacao)}</span>}</td></tr>; })}</tbody></table></div>
        {!exportRows.length && <div className="module-empty compact"><strong>Nenhuma equipe encontrada</strong><span>Revise o nome ou o INE pesquisado.</span></div>}
        <footer className="score-legend"><strong>{isC2Partial ? "Leitura do C2" : "Faixas de leitura"}</strong>{isC2Partial ? <div><span>O C2 oficial combina cinco boas práticas A–E. Esta tabela mostra somente o componente E disponível no PEC local.</span></div> : selectedIndicator.id === "C1" ? <div><span className="attention">Regular <small>≤10 ou &gt;70</small></span><span className="enough">Suficiente <small>&gt;10 a 30</small></span><span className="good">Bom <small>&gt;30 a 50</small></span><span className="great">Ótimo <small>&gt;50 a 70</small></span></div> : <div><span className="attention">Regular <small>0 a 25</small></span><span className="enough">Suficiente <small>&gt;25 a 50</small></span><span className="good">Bom <small>&gt;50 a 75</small></span><span className="great">Ótimo <small>&gt;75 a 100</small></span></div>}</footer>
      </section>
    </>}
    <section className="practice-panel"><header><div><span>{selectedIndicator.id}</span><strong>Como este indicador é calculado</strong></div><small>{weights.length ? "Pontuação metodológica: 100" : selectedIndicator.unit || "Indicador"}</small></header>{weights.length ? <div className="practice-grid">{weights.map((practice) => <article key={practice.code}><span>{practice.code}</span><p>{practice.label}</p><strong>{practice.points} pts</strong></article>)}</div> : <div className="formula-detail"><p>{formula}</p>{selectedIndicator.ranges && <small>{selectedIndicator.ranges}</small>}<span>Dados necessários: {selectedIndicator.requiredDomains.join(" · ")}</span></div>}</section>
  </div>;
}

async function requestTool(toolId: string, parameters: Record<string, string | null> = {}, cacheMode?: "refresh" | "bypass") {
  const response = await fetch(appPath(`/api/tools/${toolId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parameters, ...(cacheMode ? { cacheMode } : {}) }),
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch {
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error("A consulta ao PEC excedeu o tempo de resposta do servidor. Tente novamente em instantes.");
    }
    throw new Error(`Resposta inválida do servidor (HTTP ${response.status}).`);
  }
  if (response.status === 401) { window.location.href = appPath("/login"); throw new Error("Sessão expirada."); }
  if (!response.ok) throw new Error(data.message || "Não foi possível consultar o PEC.");
  return data as ToolResult;
}

function ResultTable({ result, municipalityName }: { result: ToolResult; municipalityName?: string }) {
  if (!result.rows.length) return <div className="module-empty compact"><strong>Nenhum registro encontrado</strong><span>A consulta foi executada, mas não retornou dados para os filtros atuais.</span></div>;
  const columns = Object.keys(result.rows[0]);
  return <div className="module-result"><div className="module-result-head"><span>{result.nominal ? "Resultado nominal protegido" : "Resultado agregado"} · {result.rowCount} {result.rowCount === 1 ? "linha" : "linhas"}</span><ExportButtons data={{ title: result.nominal ? "Resultado nominal" : "Resultado agregado", municipalityName, columns, rows: result.rows }} /></div><div className="module-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column) => <td key={column}>{pretty(row[column])}</td>)}</tr>)}</tbody></table></div></div>;
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

  useEffect(() => {
    void load();
  // O componente é remontado quando o município ativo muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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


function RegistrationLinks({ municipalityName }: { municipalityName: string }) {
  const [result, setResult] = useState<ToolResult | null>(null);
  const [selectedIne, setSelectedIne] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void requestTool("tool_cadastro_vinculos").then((data) => { if (active) setResult(data); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Falha ao carregar cadastro e vínculos."); });
    return () => { active = false; };
  }, [municipalityName]);
  const allRows = result?.rows || [];
  const rows = selectedIne ? allRows.filter((row) => String(row.ine) === selectedIne) : allRows;
  const sum = (key: string) => rows.reduce((total, row) => total + numberValue(row[key]), 0);
  const registered = sum("populacao_cadastrada");
  const linked = sum("cidadaos_vinculados");
  const individual = sum("cadastros_individuais");
  const household = sum("cadastros_domiciliares");
  const ratio = (value: number, total: number) => total ? `${(value / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—";
  const teams = allRows.filter((row) => String(row.ine || "-") !== "-");
  return <div className="module-page registration-links-page">
    <ModuleHeader eyebrow="VÍNCULO E ACOMPANHAMENTO TERRITORIAL" title="Cadastro e vínculos" description="Acompanhe população cadastrada, vínculo com equipes e consistência dos cadastros no PEC." municipalityName={municipalityName} />
    {rows.length > 0 && <div className="registration-export"><ExportButtons data={{ title: "Cadastro e vínculos por equipe", municipalityName, columns: Object.keys(rows[0]), rows }} /></div>}
    <div className="registration-filter"><label>Filtrar por equipe<select value={selectedIne} onChange={(event) => setSelectedIne(event.target.value)}><option value="">Todas as equipes</option>{teams.map((row) => <option key={String(row.ine)} value={String(row.ine)}>{String(row.equipe)} · {String(row.ine)}</option>)}</select></label></div>
    {error && <div className="module-alert">{error}</div>}
    {!result && !error && <div className="module-loading">Carregando dados…</div>}
    {result && <><div className="registration-hero">
      <article className="blue"><span>Cidadãos vinculados</span><strong>{pretty(linked)}</strong><small>{ratio(linked, registered)} da população cadastrada</small></article>
      <article className="green"><span>População cadastrada</span><strong>{pretty(registered)}</strong><small>Registros identificados no acompanhamento territorial</small></article>
    </div>
    <div className="registration-kpis">
      <article><strong>{ratio(individual, registered)}</strong><span>Cadastro individual (FCI)</span><small>{pretty(individual)} de {pretty(registered)}</small></article>
      <article><strong>{ratio(household, registered)}</strong><span>Cadastro domiciliar/territorial (FCDT)</span><small>{pretty(household)} de {pretty(registered)}</small></article>
      <article><strong>{ratio(linked, registered)}</strong><span>Vínculo com equipe</span><small>{pretty(linked)} cidadãos vinculados</small></article>
      <article><strong>{pretty(registered - linked)}</strong><span>Sem vínculo de equipe</span><small>Prioridade para qualificação territorial</small></article>
    </div>
    <div className="module-result registration-table"><div className="module-result-head"><span>Qualidade por equipe</span><span>{rows.length} {rows.length === 1 ? "equipe" : "equipes"}</span></div><div className="module-table-wrap"><table><thead><tr><th>Equipe / INE</th><th>CNES</th><th>Cadastro</th><th>Acompanhamento</th><th>Resultado</th></tr></thead><tbody>{rows.map((row, index) => { const score = numberValue(row.escore_final); return <tr key={`${String(row.ine)}-${index}`}><td><strong>{String(row.equipe)}</strong><small>{String(row.ine)}</small></td><td>{pretty(row.cnes)}</td><td><strong>Escore: {pretty(row.escore_cadastro)}</strong><small>{pretty(row.cadastros_individuais)} cadastros individuais</small></td><td><strong>Escore: {pretty(row.escore_acompanhamento)}</strong><small>{pretty(row.cidadaos_vinculados)} vinculados</small></td><td><strong>Escore final: {pretty(row.escore_final)}</strong><span className={`score-badge ${score >= 8 ? "great" : score >= 6 ? "good" : "attention"}`}>{score >= 8 ? "ÓTIMO" : score >= 6 ? "BOM" : "ATENÇÃO"}</span></td></tr>; })}</tbody></table></div></div></>}
  </div>;
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
      const loaded = await requestTool(
        item.toolId,
        item.toolId === "tool_indicador_idoso" || item.toolId === "tool_censo_gestantes" ? { ine: null } : {},
      );
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
      const loaded = await requestTool(
        item.toolId,
        item.toolId === "tool_indicador_idoso" || item.toolId === "tool_censo_gestantes" ? { ine: null } : {},
      );
      if (active) setResults((current) => ({ ...current, [item.id]: loaded }));
    }));
    return () => { active = false; };
  // Results are intentionally omitted so each group is hydrated once from the daily cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, municipalityName]);
  return <IndicatorAggregateView group={group} groupTitle={groupTitle} changeGroup={changeGroup} indicatorTools={indicatorTools} selected={selected} run={run} loading={loading} selectedIndicator={selectedIndicator} weights={weights} formula={formula} selectedResult={selectedResult} error={error} municipalityName={municipalityName} />;
  return <div className="module-page"><ModuleHeader eyebrow="INDICADORES FEDERAIS · CÁLCULO LOCAL" title={groupTitle} description="Cálculos gerenciais baseados nas fichas técnicas do Ministério da Saúde. O painel identifica claramente resultados parciais até a conciliação com o SIAPS/Saúde 360." municipalityName={municipalityName} /><nav className="indicator-tabs">{indicatorGroups.map((item) => <button key={item.id} className={group === item.id ? "active" : ""} onClick={() => changeGroup(item.id)}>{item.label}</button>)}</nav><div className="methodology-alert"><strong>PEC conectado</strong><span>Os resultados disponíveis usam o cache diário de {municipalityName}. Indicadores incompletos continuam identificados como recortes parciais e não substituem o resultado oficial.</span></div><div className="indicator-grid">{indicatorTools.map((item) => { const summary = indicatorSummary(item, results[item.id]); return <button className={`indicator-card ${item.color} ${selected === item.id ? "selected" : ""}`} key={item.id} onClick={() => void run(item)} disabled={Boolean(loading)}><span className="indicator-code">{item.id}</span><span className={`indicator-status ${item.toolId ? "available" : "pending"}`}>{item.toolId ? (results[item.id]?.cache?.hit ? "Cache diário" : "Recorte parcial") : "Mapeamento pendente"}</span><strong>{item.title}</strong>{summary ? <div className="indicator-summary"><b>{summary.value}</b><span>{summary.detail}</span></div> : <small>{item.description}</small>}<em>{loading === item.id ? "Carregando…" : item.toolId ? "Ver detalhamento por equipe →" : "Ver metodologia →"}</em></button>; })}</div><section className="practice-panel"><header><div><span>{selectedIndicator.id}</span><strong>{selectedIndicator.title}</strong></div><small>{weights.length ? "Pontuação metodológica: 100" : selectedIndicator.unit || "Indicador"}</small></header>{weights.length ? <div className="practice-grid">{weights.map((practice) => <article key={practice.code}><span>{practice.code}</span><p>{practice.label}</p><strong>{practice.points} pts</strong></article>)}</div> : <div className="formula-detail"><p>{formula}</p>{selectedIndicator.ranges && <small>{selectedIndicator.ranges}</small>}<span>Dados necessários: {selectedIndicator.requiredDomains.join(" · ")}</span></div>}</section>{loading && <div className="module-loading">Carregando o resultado armazenado do PEC…</div>}{error && <div className="module-alert">{error}</div>}{selectedResult && <ResultTable result={selectedResult} />}</div>;
}

function ActiveSearch({ municipalityName }: { municipalityName: string }) {
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [ine, setIne] = useState("");
  const [name, setName] = useState("");
  const [teams, setTeams] = useState<Record<string, unknown>[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setIne(""); setResult(null); setCounts({});
    void requestTool("tool_listar_esf").then((data) => { if (active) setTeams(data.rows); }).catch(() => undefined);
    return () => { active = false; };
  }, [municipalityName]);

  useEffect(() => {
    let active = true;
    const parameters = { ine: ine || null };
    void Promise.allSettled([
      requestTool("tool_busca_ativa_gestantes_atraso", parameters),
      requestTool("tool_busca_ativa_c3", parameters),
      requestTool("tool_busca_ativa_idosos", parameters),
    ]).then((items) => {
      if (!active) return;
      setCounts({
        gestantes: items[0].status === "fulfilled" ? items[0].value.rowCount : 0,
        c3: items[1].status === "fulfilled" ? items[1].value.rowCount : 0,
        idosos: items[2].status === "fulfilled" ? items[2].value.rowCount : 0,
      });
    });
    return () => { active = false; };
  }, [ine, municipalityName]);

  async function run(id: string, parameters: Record<string, string | null>) {
    setLoading(id); setError(""); setResult(null);
    try { const data = await requestTool(id, parameters); setResult(data); requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha na busca ativa."); }
    finally { setLoading(""); }
  }

  const selectedTeam = teams.find((team) => String(team.ine) === ine);
  const scopeLabel = selectedTeam ? `${String(selectedTeam.equipe)} · INE ${ine}` : "Todas as eSF do município";
  const cards = [
    { id:"tool_busca_ativa_gestantes_atraso", icon:"G", title:"Gestantes com cuidado pendente", text:"Gestantes identificadas com acompanhamento pré-natal atrasado.", count:counts.gestantes },
    { id:"tool_busca_ativa_c3", icon:"C3", title:"Gestação e puerpério · práticas pendentes", text:"Gestantes e puérperas com uma ou mais boas práticas A–K do C3 pendentes.", count:counts.c3 },
    { id:"tool_busca_ativa_idosos", icon:"60+", title:"Idosos sem acompanhamento", text:"Pessoas com 60 anos ou mais sem atendimento registrado nos últimos 12 meses.", count:counts.idosos },
  ];

  return <div className="module-page active-search-page">
    <ModuleHeader eyebrow="CUIDADO PRIORITÁRIO" title="Busca ativa" description="Transforme os dados do PEC em listas operacionais por equipe e linha de cuidado." municipalityName={municipalityName} />
    <section className="active-search-filter">
      <label>Equipe / eSF<select value={ine} onChange={(event) => { setIne(event.target.value); setResult(null); }}><option value="">Todas as eSF</option>{teams.map((team) => <option key={String(team.ine)} value={String(team.ine)}>{String(team.equipe)} · {String(team.ine)}</option>)}</select></label>
      <div><span>Escopo atual</span><strong>{scopeLabel}</strong><small>{ine ? "Todas as consultas abaixo respeitam este INE." : "Selecione uma equipe para restringir todas as buscas."}</small></div>
    </section>
    <section className="active-search-summary"><div><span>Pessoas que precisam de atenção</span><strong>{numberValue(counts.gestantes) + numberValue(counts.c3) + numberValue(counts.idosos)}</strong><small>Somatório das buscas nominais disponíveis no escopo atual</small></div><div><span>Equipe selecionada</span><strong>{ine ? String(selectedTeam?.equipe || "eSF") : "Município"}</strong><small>{ine ? `INE ${ine}` : `${teams.length} equipes disponíveis`}</small></div></section>
    <div className="active-search-grid">
      {cards.map((card) => <article className="action-card" key={card.id}><span className="action-icon">{card.icon}</span><div><strong>{card.title}</strong><p>{card.text}</p><small>{card.count ?? "—"} pessoas no escopo atual</small></div><button disabled={Boolean(loading)} onClick={() => void run(card.id, { ine: ine || null })}>{loading === card.id ? "Consultando…" : "Ver lista"}</button></article>)}
      <article className="action-card"><span className="action-icon">C2</span><div><strong>Crianças com cuidado pendente</strong><p>Camada nominal preparada para receber as boas práticas do C2 validadas no backend.</p></div><button disabled>Em implantação</button></article>
      <article className="action-card"><span className="action-icon">C4</span><div><strong>Pessoas com diabetes</strong><p>Pendências de acompanhamento serão expostas pela mesma camada nominal consumida pela IA.</p></div><button disabled>Em implantação</button></article>
      <article className="action-card"><span className="action-icon">C5</span><div><strong>Pessoas com hipertensão</strong><p>Busca por práticas pendentes, sempre filtrável por INE/eSF.</p></div><button disabled>Em implantação</button></article>
      <article className="action-card"><span className="action-icon">C7</span><div><strong>Prevenção e rastreamento</strong><p>Listas nominais do cuidado preventivo conforme regras homologadas.</p></div><button disabled>Em implantação</button></article>
      <article className="action-card duplicate-card"><span className="action-icon">2×</span><div><strong>Possíveis cadastros duplicados</strong><p>Pesquisa nome, CPF, CNS, nascimento e mãe; inclui cadastros inativos e recomenda o registro principal.</p><label>Nome do cidadão<input value={name} onChange={(event) => setName(event.target.value.slice(0, 100))} placeholder="Digite ao menos 3 caracteres" /></label></div><button disabled={Boolean(loading) || name.trim().length < 3} onClick={() => void run("tool_busca_duplicidades_cadastrais", { nome: name })}>{loading === "tool_busca_duplicidades_cadastrais" ? "Analisando…" : "Pesquisar duplicidades"}</button></article>
    </div>
    {error && <div className="module-alert">{error}</div>}
    {result && <div ref={resultRef} className="active-search-result-anchor"><ResultTable result={result} municipalityName={municipalityName} />{result.toolId === "tool_busca_ativa_c3" && <section className="practice-panel active-search-c3-legend"><header><div><span>C3</span><strong>Legenda das práticas</strong></div></header><div className="practice-grid">{[
      ["A","1ª consulta até a 12ª semana"],["B","7 consultas na gestação"],["C","7 aferições de pressão arterial"],["D","7 registros de peso e altura"],["E","3 visitas domiciliares após a 1ª consulta"],["F","dTpa a partir da 20ª semana"],["G","Sífilis, HIV e hepatites B/C no 1º trimestre"],["H","Sífilis e HIV no 3º trimestre"],["I","Consulta no puerpério"],["J","Visita domiciliar no puerpério"],["K","Saúde bucal na gestação"]
    ].map(([code,label]) => <article key={code}><span>{code}</span><p>{label}</p></article>)}</div></section>}</div>}
  </div>;
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
  if (props.view === "registration-links") return <RegistrationLinks municipalityName={props.municipalityName} />;
  if (props.view === "indicators") return <Indicators municipalityName={props.municipalityName} />;
  if (props.view === "active-search") return <ActiveSearch municipalityName={props.municipalityName} />;
  return <Territory municipalityName={props.municipalityName} />;
}
