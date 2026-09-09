# CBAItyhy — Inteligência APS

Aplicação web conversacional para gestão da Atenção Primária à Saúde. A interface funciona no modelo de um chat de IA, combinando dados reais do e-SUS PEC, conhecimento normativo compartilhado da CBAItyhy e análise gerencial.

## Arquitetura

```text
Usuário autenticado
        ↓
Next.js / React
        ↓
/api/chat
        ↓
Management Agent
   ├── RAG normativo → Supabase CBAItyhy
   └── OpenAI function calling
            ↓
       Tool Registry
            ↓
   SQL homologado/versionado
            ↓
   PostgreSQL e-SUS PEC
       BEGIN READ ONLY
            ↓
      JSON controlado
            ↓
   resposta + tabela + gráfico
```

O n8n não faz parte do núcleo conversacional. Pode ser usado futuramente apenas para automações periféricas, como relatórios agendados, notificações e ingestões.

## Estado atual

Já estão implementados:

- interface conversacional estilo ChatGPT;
- Supabase Auth via backend;
- vínculo de usuário com organização, município e perfil;
- RAG compartilhado com o módulo CBAItyhy do Azurra Leads;
- Agent Service usando OpenAI Responses API;
- function calling apenas para tools homologadas;
- conexão PostgreSQL do PEC com transação READ ONLY e timeout;
- registry das 10 tools existentes;
- normalização de parâmetros INE/logradouro;
- bloqueio específico para tools nominais;
- mascaramento defensivo de CPF/CNS;
- retorno de texto, fontes, tabela e gráfico dentro da conversa.

## Segurança

- O modelo não recebe credenciais do PEC.
- O modelo não escreve SQL livre para execução.
- Só existem as tools registradas em `config/tool-catalog.json`.
- A conexão PEC deve usar usuário dedicado `READ ONLY`.
- Cada consulta roda em `BEGIN READ ONLY` com `statement_timeout`.
- Parâmetros são normalizados pelo backend antes da execução.
- CPF e CNS são mascarados antes de sair da camada de tool.
- Tools nominais exigem `nominal_access=true` e perfil autorizado.
- Organização e município vêm da sessão autenticada, não do prompt do usuário.
- A secret key do Supabase permanece exclusivamente server-side.

## Autenticação e município

A autenticação usa Supabase Auth no mesmo projeto de IA da CBAItyhy. A migration abaixo cria o vínculo de autorização:

```text
supabase/migrations/001_management_profiles.sql
```

Fluxo:

```text
auth_user_id
→ organization_id
→ municipality_id
→ role
→ nominal_access
```

Perfis previstos:

- `admin`
- `manager`
- `municipal_manager`
- `coordinator`
- `team`

## RAG compartilhado

O produto não cria outra base vetorial. Ele consome a estrutura já existente no Suporte SUS:

```text
knowledge_sources
knowledge_chunks
rpc/match_knowledge_chunks
Storage: ai-knowledge
Embedding: text-embedding-3-small / 1536 dimensões
```

A recuperação preserva `organization_id` e `municipality_id`.

## Tools PEC

| Tool | Tipo | Finalidade |
|---|---|---|
| `tool_indicador_citopatologico` | agregado | Rastreamento citopatológico em 36 meses |
| `tool_busca_ativa_gestantes_atraso` | nominal | Gestantes com pré-natal atrasado |
| `tool_indicador_hipertensao` | agregado | Acompanhamento de hipertensão |
| `tool_indicador_diabetes` | agregado | HbA1c / acompanhamento de diabetes |
| `tool_indicador_idoso` | agregado | Avaliação anual da pessoa idosa |
| `tool_busca_ativa_idosos` | nominal | Idosos sem acompanhamento recente |
| `tool_indicador_vacinacao_infantil` | agregado | Penta + VIP em crianças de 12–23 meses |
| `tool_censo_gestantes` | agregado | Censo de gestantes ativas |
| `tool_busca_territorial_rua` | agregado | Censo territorial por logradouro |
| `tool_auditoria_cadastros` | agregado | Vigência cadastral em 24 meses |

## Estrutura principal

```text
app/
  api/
    auth/
    chat/
  login/
  page.tsx

lib/
  agent.ts
  auth.ts
  pec.ts
  rag.ts
  tool-registry.ts

config/
  tool-catalog.json

sql/tools/
  *.sql

supabase/migrations/
  001_management_profiles.sql
```

## Configuração

Copie `.env.example` para `.env.local` e configure:

- PostgreSQL READ ONLY do PEC;
- URL e secret key do Supabase de IA da CBAItyhy;
- `CBAITYHY_ORGANIZATION_ID`;
- OpenAI API Key.

Depois:

```bash
npm install
npm run dev
```

Antes do primeiro login, aplique `001_management_profiles.sql`, crie o usuário no Supabase Auth e registre o vínculo desse usuário em `management_profiles`.

## Próximos blocos

- seletor multi-município para administradores CBAItyhy;
- dashboard de visão geral fora do chat;
- exportação CSV/PDF;
- histórico persistente de conversas;
- auditoria detalhada das execuções de tools;
- indicadores de Saúde Bucal;
- automações periféricas opcionais via n8n.
