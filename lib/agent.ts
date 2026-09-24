import "server-only";
import { retrieveKnowledge } from "@/lib/rag";
import { executeTool, getToolDefinitions, type ToolExecutionContext } from "@/lib/tool-registry";
import { operationalFetch } from "@/lib/operational-supabase";

type HistoryMessage = { role: "user" | "assistant"; content: string };
type ToolResult = Awaited<ReturnType<typeof executeTool>>;

type AgentInput = {
  message: string;
  history?: HistoryMessage[];
  context: ToolExecutionContext & { authUserId: string; organizationId: string; municipalityName: string };
};

const outputText = (data: any) =>
  typeof data.output_text === "string"
    ? data.output_text
    : (data.output || [])
        .flatMap((item: any) => item.content || [])
        .filter((item: any) => item.type === "output_text")
        .map((item: any) => item.text || "")
        .join("\n");

async function callResponses(payload: Record<string, unknown>) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  return response.json();
}

function presentationFrom(result?: ToolResult | null) {
  if (!result || !result.rows.length) return null;
  const rows = result.rows;
  const columns = Object.keys(rows[0] || {}).slice(0, 10);
  const numericColumns = columns.filter((key) => rows.some((row) => typeof row[key] === "number" || /^-?\d+(\.\d+)?$/.test(String(row[key] ?? ""))));
  const labelKey = columns.find((key) => /equipe|logradouro|bairro|nome/i.test(key)) || columns[0];
  const valueKey = numericColumns.find((key) => /perc|cobertura|total|pendente|qtd|quant/i.test(key)) || numericColumns[0] || null;

  return {
    kind: result.kind,
    nominal: result.nominal,
    toolId: result.toolId,
    columns,
    rows,
    chart: result.chart && valueKey
      ? {
          type: "bar",
          labelKey,
          valueKey,
          data: rows.slice(0, 12).map((row) => ({ label: String(row[labelKey] ?? ""), value: Number(row[valueKey] ?? 0) })),
        }
      : null,
  };
}

export async function runManagementAgent({ message, history = [], context }: AgentInput) {
  const usage = { input: 0, output: 0, cached: 0, reasoning: 0 };
  const collectUsage = (response: any) => {
    usage.input += Number(response?.usage?.input_tokens || 0);
    usage.output += Number(response?.usage?.output_tokens || 0);
    usage.cached += Number(response?.usage?.input_tokens_details?.cached_tokens || 0);
    usage.reasoning += Number(response?.usage?.output_tokens_details?.reasoning_tokens || 0);
  };
  const { evidence, sources } = await retrieveKnowledge(message, context.municipalityId, context.organizationId);
  const recentHistory = history.slice(-10).map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }));
  const tools = getToolDefinitions();

  const instructions = [
    "Você é o agente de inteligência em gestão da APS da CBAItyhy.",
    `O contexto autorizado é o município ${context.municipalityName}.`,
    "Use as funções homologadas quando a pergunta exigir dados reais do PEC.",
    "Escolha primeiro uma função homologada específica. Use tool_consulta_agregada_dinamica somente quando nenhuma função homologada responder à pergunta e apenas para resultados agregados não nominais.",
    "Quando a pergunta pedir uma visão geral de uma área com vários indicadores, consulte em paralelo todas as funções homologadas relevantes antes de sintetizar a resposta.",
    "Nunca invente valores assistenciais, pacientes, percentuais ou resultados de indicadores.",
    "Nunca escreva SQL para o usuário e nunca afirme ter consultado um dado se nenhuma função foi executada.",
    "Para perguntas normativas, use exclusivamente as evidências do RAG fornecidas no contexto; se forem insuficientes, declare a limitação.",
    "Para dados agregados, destaque cobertura, equipes em pior situação e prioridade operacional sem criar meta normativa não sustentada.",
    "Para busca nominal, só solicite uma função nominal se a pergunta realmente pedir lista de pessoas/ação de busca ativa.",
    "Quando o gestor pedir censo, panorama ou situação das gestantes de uma equipe/ESF, use tool_censo_gestantes. Essa função já combina os snapshots do indicador C3 e da busca ativa C3; não tente complementar o censo consultando o PEC nem usando a ferramenta dinâmica. Para ESF/INE informado, passe o INE quando ele estiver explícito no pedido ou no histórico.",
    "Diferencie rigorosamente os objetos da pergunta: equipe/ESF/UBS, profissional de saúde e cidadão. Não trate nome de profissional como nome de cidadão.",
    "Quando o gestor identificar uma equipe como ESF 1, ESF 01, equipe 3 ou por nome, envie exatamente esse texto no parâmetro equipe; a função fará a correspondência por nome ou INE.",
    "Interprete 'este mês' como o mês civil atual. Quadrimestre significa os blocos janeiro-abril, maio-agosto ou setembro-dezembro; sempre informe as datas do período retornado pela função.",
    "Para produção de ACS por equipe, use tool_resumo_producao_acs. Para saber quem compõe uma equipe, use tool_profissionais_equipe.",
    "Para um panorama do quadrimestre de uma equipe, use tool_resumo_equipe_quadrimestre. Se a pergunta for ampla, explique exatamente quais dimensões a função conseguiu medir e não chame isso de avaliação completa da equipe.",
    "Para atendimentos de hipertensos por médico ou outro profissional, use tool_producao_profissional_hipertensao. Para verificar aferição de PA por técnicos/auxiliares de enfermagem, use tool_afericao_pa_enfermagem.",
    "Para informações sobre uma pessoa identificada pelo nome, use exclusivamente tool_resumo_cidadao. Se houver homônimos, apresente as opções mínimas necessárias e peça confirmação antes de interpretar o histórico.",
    "Nomes de cidadãos, CPF, CNS, nascimento, filiação e histórico assistencial são dados protegidos. Só os apresente quando a função nominal estiver autorizada; nunca inclua esse conteúdo em recomendações sobre outras pessoas.",
    "Quando uma consulta não retornar dados ou falhar, explique a limitação sem encerrar apenas com uma mensagem de erro: indique qual cartão da área Indicadores ou qual Busca ativa relacionada o gestor pode consultar em seguida.",
    "Responda em português do Brasil, de forma executiva e direta.",
  ].join(" ");

  const first = await callResponses({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions,
    input: [
      ...recentHistory,
      {
        role: "user",
        content: `${message}\n\nCONTEXTO NORMATIVO RECUPERADO:\n${evidence || "Nenhuma evidência suficientemente relacionada foi encontrada."}`,
      },
    ],
    tools,
    parallel_tool_calls: true,
    max_output_tokens: 1600,
  });

  collectUsage(first);
  let current = first;
  let lastToolResult: ToolResult | null = null;
  let iterations = 0;
  let executedCalls = 0;

  // Perguntas amplas (por exemplo, situação da saúde bucal) podem exigir B1, B2,
  // B3, B5 e B6. Três rodadas interrompiam a resposta ainda em function_call.
  while (iterations < 8 && executedCalls < 16) {
    const calls = (current.output || []).filter((item: any) => item.type === "function_call");
    if (!calls.length) break;

    const outputs = [];
    for (const call of calls) {
      executedCalls += 1;
      let args: Record<string, unknown> = {};
      try { args = call.arguments ? JSON.parse(call.arguments) : {}; } catch { args = {}; }

      try {
        lastToolResult = await executeTool(call.name, args, context);
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(lastToolResult) });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TOOL_ERROR";
        const timeout = /statement timeout|canceling statement/i.test(code);
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ error: code === "FORBIDDEN_NOMINAL"
            ? "Acesso nominal não autorizado para este perfil."
            : timeout
              ? "A consulta ao PEC excedeu o tempo permitido. Informe que os dados não puderam ser atualizados e sugira tentar novamente."
              : "Falha controlada ao executar a ferramenta." }),
        });
      }
    }

    current = await callResponses({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      previous_response_id: current.id,
      input: outputs,
      tools,
      parallel_tool_calls: true,
      max_output_tokens: 1600,
    });
    collectUsage(current);
    iterations += 1;
  }

  let answer = outputText(current).trim();
  // Alguns modelos podem encerrar uma rodada sem texto mesmo depois de todas as
  // ferramentas respondidas. Solicita explicitamente a síntese antes de falhar.
  if (!answer && !(current.output || []).some((item: any) => item.type === "function_call")) {
    const synthesis = await callResponses({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      previous_response_id: current.id,
      input: [{ role: "user", content: "Conclua agora com uma resposta executiva em português, sintetizando os resultados já consultados e indicando prioridades operacionais." }],
      max_output_tokens: 1600,
    });
    current = synthesis;
    collectUsage(synthesis);
    answer = outputText(current).trim();
  }
  if (!answer) {
    answer = lastToolResult
      ? "Os dados do PEC foram consultados, mas a síntese automática não foi concluída. Abra a área **Indicadores** para visualizar os resultados atualizados por equipe e tente novamente em seguida."
      : "Não consegui concluir esta análise agora. Abra a área **Indicadores** para consultar os resultados disponíveis do município e tente novamente em seguida.";
  }
  const improvedAnswer = /não foi possível consultar|falha temporária|não consegui (?:consultar|obter)/i.test(answer) && !/área (?:de )?\*\*?Indicadores|seção (?:de )?\*\*?Indicadores/i.test(answer)
    ? `${answer}\n\nEnquanto essa consulta não está disponível, abra **Indicadores** para verificar os resultados assistenciais relacionados e identificar equipes que precisam de atenção.`
    : answer;

  return {
    answer: improvedAnswer,
    sources: sources.map((source) => ({ id: source.id, title: source.title, url: source.canonical_url || "" })),
    ragUsed: Boolean(evidence),
    toolUsed: lastToolResult?.toolId || null,
    presentation: presentationFrom(lastToolResult),
    responseId: current.id || null,
  };
}
