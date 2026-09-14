# IA e RAG

## Agente

`lib/agent.ts` usa a OpenAI Responses API. O modelo recebe município ativo, histórico recente limitado, evidências normativas, definições de tools e regras de proteção.

Perguntas amplas podem chamar várias ferramentas em paralelo. O agente aceita até oito rodadas e dezesseis execuções por solicitação. Se terminar sem texto após as tools, solicita uma síntese explícita e ainda possui fallback amigável.

## RAG

`lib/rag.ts` cria o embedding da pergunta, chama `match_knowledge_chunks`, monta evidências e devolve fontes separadas à interface. Perguntas normativas devem usar somente evidências recuperadas; ausência de evidência deve ser declarada.

## Function calling

O modelo recebe nome, descrição e schema de parâmetros, nunca credenciais ou texto SQL. A execução ocorre no backend com município obtido da sessão.

## Apresentação

O backend identifica colunas numéricas e rótulos para tabela e gráfico. Resultados nominais respeitam o limite configurado e não geram gráfico.

## Consulta dinâmica

`tool_consulta_agregada_dinamica` só deve ser usada quando não existir tool específica. Há prompt restritivo e validação determinística posterior. O código permite apenas `SELECT` agregado, sem CTE, `UNION`, dados pessoais, `SELECT *`, funções administrativas ou tabelas fora da lista.

## Troca de modelo

Valide suporte à Responses API, function calling paralelo, formato de saída, latência, custo, tool output grande e síntese em português. `OPENAI_SQL_MODEL` pode ser separado. Nunca reduza as validações determinísticas por confiar no modelo.
