# CBAItyhy — Agente de Gestão APS

Agente conversacional e camada de inteligência de dados para Atenção Primária à Saúde, com consultas determinísticas ao PostgreSQL do e-SUS PEC, RAG normativo no Supabase e atendimento via WhatsApp/Evolution API.

## Objetivos

- Auditar indicadores assistenciais e de financiamento da APS.
- Entregar síntese executiva para gestores, coordenadores e equipes.
- Produzir busca ativa nominal de forma controlada e auditável.
- Separar rigorosamente cálculo de indicador (SQL homologado) de interpretação (LLM/RAG).
- Evitar SQL livre contra o banco de produção.

## Arquitetura

```text
WhatsApp
  ↓
Evolution API
  ↓
n8n Webhook
  ↓
Agente Mestre / Roteador
  ├── conversa trivial → resposta direta
  ├── dúvida normativa → Supabase Vector Store (RAG)
  └── dado assistencial → Tool SQL homologada (PostgreSQL READ ONLY)
                           ↓
                     Agente Analista
                           ├── cruza JSON + RAG
                           ├── diagnóstico executivo
                           └── opcional: QuickChart
  ↓
Evolution API /message/sendText ou /message/sendMedia
```

## Regras de segurança

1. O LLM não recebe credenciais do PostgreSQL.
2. O LLM não escreve SQL livre para execução em produção.
3. As tools usam somente consultas versionadas em `sql/tools/`.
4. Usuário PostgreSQL deve ser `READ ONLY` e usar `statement_timeout` de até 8 segundos.
5. CPF exibido em busca ativa deve ser mascarado.
6. Respostas nominais devem ser limitadas e adequadas ao perfil autorizado.
7. Logs não devem armazenar CPF completo, CNS completo, token ou senha.

## Estrutura

- `sql/tools/` — SQL homologado por indicador/tool.
- `n8n/workflows/` — exports versionados dos workflows.
- `docs/ARCHITECTURE.md` — decisões e contratos técnicos.
- `docs/SECURITY.md` — controles de LGPD, acesso e observabilidade.
- `.env.example` — nomes das variáveis necessárias, sem segredos.

## Catálogo inicial de tools

| Tool | Finalidade |
|---|---|
| `tool_indicador_citopatologico` | Cobertura de rastreamento do colo do útero em 36 meses |
| `tool_busca_ativa_gestantes_atraso` | Gestantes com mais de 30 dias sem consulta |
| `tool_indicador_hipertensao` | PA aferida em hipertensos nos últimos 6 meses |
| `tool_indicador_diabetes` | HbA1c em pessoas com diabetes nos últimos 6 meses |
| `tool_indicador_idoso` | Avaliação anual da pessoa idosa |
| `tool_busca_ativa_idosos` | Idosos sem atendimento há mais de 12 meses |
| `tool_indicador_vacinacao_infantil` | Penta + VIP em crianças de 12–23 meses |
| `tool_censo_gestantes` | Censo de gestantes ativas |
| `tool_busca_territorial_rua` | Censo territorial por logradouro |
| `tool_auditoria_cadastros` | Vigência cadastral em 24 meses |

## Próxima evolução

1. Importar o workflow Supervisor no n8n.
2. Configurar credenciais do PEC, Evolution API e Supabase no n8n.
3. Homologar os SQLs em uma base de teste/espelho antes de produção.
4. Aplicar RBAC por perfil e município antes de liberar respostas nominais.
5. Acrescentar indicadores de Saúde Bucal (`tb_fat_atendimento_odonto`, `tb_fat_proced_atend_odonto`).
