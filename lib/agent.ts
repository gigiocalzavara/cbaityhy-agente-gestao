import "server-only";
import { retrieveKnowledge } from "@/lib/rag";
import { executeTool, getToolDefinitions, type ToolExecutionContext } from "@/lib/tool-registry";

type HistoryMessage = { role: "user" | "assistant"; content: string };
type ToolResult = Awaited<ReturnType<typeof executeTool>>;

type AgentInput = {
  message: string;
  history?: HistoryMessage[];
  context: ToolExecutionContext & { organizationId: string; municipalityName: string };
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
    rows: rows.slice(0, result.nominal ? 15 : 50),
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
  const { evidence, sources } = await retrieveKnowledge(message, context.municipalityId, context.organizationId);
  const recentHistory = history.slice(-10).map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }));

  const instructions = [
    "Você é o agente de inteligência em gestão da APS da CBAItyhy.",
    `O contexto autorizado é o município ${context.municipalityName}.`,
    "Use as funções homologadas quando a pergunta exigir dados reais do PEC.",
    "Nunca invente valores assistenciais, pacientes, percentuais ou resultados de indicadores.",
    "Nunca escreva SQL para o usuário e nunca afirme ter consultado um dado se nenhuma função foi executada.",
    "Para perguntas normativas, use exclusivamente as evidências do RAG fornecidas no contexto; se forem insuficientes, declare a limitação.",
    "Para dados agregados, destaque cobertura, equipes em pior situação e prioridade operacional sem criar meta normativa não sustentada.",
    "Para busca nominal, só solicite uma função nominal se a pergunta realmente pedir lista de pessoas/ação de busca ativa.",
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
    tools: getToolDefinitions(),
    parallel_tool_calls: false,
    max_output_tokens: 1600,
  });

  let current = first;
  let lastToolResult: ToolResult | null = null;
  let iterations = 0;

  while (iterations < 3) {
    const calls = (current.output || []).filter((item: any) => item.type === "function_call");
    if (!calls.length) break;

    const outputs = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        args = {};
      }

      try {
        lastToolResult = await executeTool(call.name, args, context);
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(lastToolResult),
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TOOL_ERROR";
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ error: code === "FORBIDDEN_NOMINAL" ? "Acesso nominal não autorizado para este perfil." : "Falha controlada ao executar a ferramenta." }),
        });
      }
    }

    current = await callResponses({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      previous_response_id: current.id,
      input: outputs,
      max_output_tokens: 1600,
    });
    iterations += 1;
  }

  const answer = outputText(current).trim();
  if (!answer) throw new Error("A IA não retornou conteúdo.");

  return {
    answer,
    sources: sources.map((source) => ({ id: source.id, title: source.title, url: source.canonical_url || "" })),
    ragUsed: Boolean(evidence),
    toolUsed: lastToolResult?.toolId || null,
    presentation: presentationFrom(lastToolResult),
    responseId: current.id || null,
  };
}
