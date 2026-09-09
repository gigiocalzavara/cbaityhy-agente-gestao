# Workflows n8n

## 01-evolution-supervisor.json

Workflow importável do supervisor APS.

### Antes de ativar

1. Importe `01-evolution-supervisor.json` no n8n.
2. Abra o nó **PEC PostgreSQL READ ONLY** e selecione uma credencial PostgreSQL real. O JSON contém apenas um placeholder de ID.
3. Garanta no ambiente do n8n: `OPENAI_API_KEY`, `OPENAI_MODEL`, `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_INSTANCE`, `EVOLUTION_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MATCH_FUNCTION`.
4. Configure o webhook da Evolution para o endpoint de produção gerado pelo nó **Evolution Inbound**.
5. Teste primeiro com uma base espelho do PEC.

### Segurança

- A `tool_id` é validada por allowlist antes de qualquer acesso ao PostgreSQL.
- A SQL é carregada exclusivamente de `sql/tools/<tool_id>.sql` neste repositório; não é produzida pelo LLM.
- O nó **Prepare Homologated SQL** rejeita comandos de escrita/DDL.
- A credencial PostgreSQL deve ser READ ONLY no próprio banco; não dependa apenas da validação do workflow.
- Listas nominais devem permanecer desabilitadas em produção até existir uma camada de autorização por usuário/município.

### RAG

A rota `NORMATIVE_RAG` cria embedding com `text-embedding-3-small` e chama a RPC definida em `SUPABASE_MATCH_FUNCTION`, enviando `query_embedding` e `match_count=6`.

A função RPC precisa aceitar esse contrato. Se a função existente tiver parâmetros diferentes, ajuste apenas o nó **RAG - Supabase Match**.

### Limitação intencional da v1

A v1 envia resposta textual. O QuickChart/sendMedia será adicionado após validarmos o formato real dos resultados de cada indicador no PEC, para que o gráfico seja construído apenas com dados agregados e nunca com listas nominais.

### Fluxo

`Evolution -> Sanitize -> Router -> Validate -> Switch Intent`

- `INDICATOR/NOMINAL_SEARCH -> allowlisted SQL -> PostgreSQL -> Analyst -> Evolution`
- `NORMATIVE_RAG -> Embedding -> Supabase RPC -> Analyst -> Evolution`
- `TRIVIAL/UNSUPPORTED -> resposta segura -> Evolution`

### Observação sobre SQL versionada

Nesta primeira versão o workflow busca a SQL homologada no branch `main` via raw GitHub. Isso facilita a homologação inicial e mantém a origem da consulta fora do LLM. Para produção rígida, recomenda-se fixar as URLs em um commit/tag de release ou incorporar as consultas aprovadas diretamente nos nós Postgres após a homologação final.
