# CBAItyhy — Inteligência APS

Aplicação web conversacional para inteligência e gestão da Atenção Primária à Saúde. A interface segue o modelo de assistentes como ChatGPT, combinando conhecimento normativo da CBAItyhy com consultas determinísticas ao PostgreSQL do e-SUS PEC.

## Direção atual do produto

O WhatsApp deixou de ser a interface principal. O núcleo passa a ser uma aplicação web própria, com chat, histórico, indicadores, busca ativa, território e visualizações gerenciais.

```text
Usuário autenticado
      ↓
Aplicação Next.js
      ↓
API / Agent Service
      ├── conversa / análise
      ├── RAG normativo → Supabase IA compartilhado da CBAItyhy
      └── dado assistencial → Tool SQL homologada → PostgreSQL PEC READ ONLY
                                      ↓
                                resposta estruturada
                                      ├── texto
                                      ├── cards
                                      ├── tabelas
                                      └── gráficos
```

## RAG compartilhado

O projeto usa a mesma base vetorial já existente no módulo CBAItyhy do Azurra Leads / Suporte SUS.

Estrutura reutilizada:

- `knowledge_sources`
- `knowledge_chunks`
- RPC `match_knowledge_chunks`
- embeddings OpenAI `text-embedding-3-small` com 1536 dimensões
- isolamento por `organization_id` e `municipality_id`
- bucket de documentos `ai-knowledge`

O novo sistema é consumidor dessa base. Não cria uma segunda base de conhecimento nem duplica a indexação.

## Stack

- Next.js 16
- React 19
- TypeScript
- OpenAI Responses API
- Supabase / pgvector para RAG
- PostgreSQL e-SUS PEC com usuário READ ONLY
- SQL homologado em `sql/tools/`

O n8n não faz parte do núcleo do agente. Poderá ser usado futuramente apenas em automações periféricas, como relatórios agendados, notificações, integrações e rotinas administrativas.

## Regras de segurança

1. O LLM não recebe credenciais do PostgreSQL.
2. O LLM não escreve SQL livre para execução em produção.
3. As tools usam somente consultas versionadas em `sql/tools/`.
4. O usuário PostgreSQL deve ser `READ ONLY` e usar `statement_timeout` curto.
5. CPF exibido em busca ativa deve permanecer mascarado.
6. Respostas nominais exigirão autorização por perfil e município.
7. Logs não devem armazenar CPF completo, CNS completo, tokens ou senhas.
8. O `CBAITYHY_AI_SUPABASE_SECRET_KEY` é exclusivamente server-side.

## Estrutura atual

- `app/` — aplicação Next.js e API do chat.
- `lib/rag.ts` — cliente server-side para o RAG compartilhado da CBAItyhy.
- `sql/tools/` — consultas homologadas do PEC.
- `config/tool-catalog.json` — catálogo determinístico de tools.
- `prompts/` — instruções do roteador e analista.
- `n8n/` — legado/protótipos de automação; não é mais o runtime principal.
- `.env.example` — contrato das variáveis sem segredos.

## Estado atual

A primeira interface conversacional e o endpoint `/api/chat` já estão implementados. Nesta etapa, o chat consulta o RAG compartilhado e responde com fontes da base CBAItyhy.

## Próximas etapas

1. Implementar autenticação e vínculo usuário → município → perfil.
2. Criar o Agent Service com tool calling controlado.
3. Conectar o catálogo de SQL homologado ao PostgreSQL do PEC.
4. Retornar respostas estruturadas com texto, cards, tabelas e gráficos.
5. Liberar busca ativa nominal somente após RBAC e auditoria.
6. Criar dashboards e histórico persistente de conversas.
7. Acrescentar indicadores de Saúde Bucal (`tb_fat_atendimento_odonto`, `tb_fat_proced_atend_odonto`).
