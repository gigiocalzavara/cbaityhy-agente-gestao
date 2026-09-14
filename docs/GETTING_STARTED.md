# Primeiros passos

## Requisitos

- Node.js 22 ou superior
- npm
- acesso aos dois projetos Supabase
- chave da OpenAI
- ao menos um município e usuário de teste
- acesso de rede a um PostgreSQL PEC de homologação

## Instalação

```bash
git clone https://github.com/gigiocalzavara/cbaityhy-agente-gestao.git
cd cbaityhy-agente-gestao
npm install
```

Crie `.env.local` sem versioná-lo:

```env
CBAITYHY_OPERATIONAL_SUPABASE_URL=
CBAITYHY_OPERATIONAL_SUPABASE_SECRET_KEY=
CBAITYHY_AI_SUPABASE_URL=
CBAITYHY_AI_SUPABASE_SECRET_KEY=
CBAITYHY_ORGANIZATION_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
OPENAI_SQL_MODEL=gpt-5.6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
APS_AGENT_DB_CREDENTIALS_KEY=
CACHE_REFRESH_SECRET=
PEC_PG_POOL_MAX=5
PEC_PG_STATEMENT_TIMEOUT_MS=30000
DEFAULT_RESULT_LIMIT=15
```

Gere a chave AES-256-GCM com 32 bytes:

```bash
openssl rand -hex 32
```

Execute as migrations `001` a `005` no Supabase operacional, na ordem numérica. Não as execute no Supabase de IA.

## Primeiro usuário

1. Crie o usuário no Supabase Auth operacional.
2. Confirme que o município existe em `public.municipalities`.
3. Insira um registro em `public.aps_agent_profiles` usando o UUID do Auth.
4. Para não administradores com municípios adicionais, use `aps_agent_user_municipalities`.

```sql
insert into public.aps_agent_profiles
  (auth_user_id, organization_id, municipality_id, municipality_name, role, nominal_access)
values
  ('UUID_AUTH', 'UUID_ORGANIZACAO', 'UUID_MUNICIPIO', 'Município', 'admin', true);
```

## Executar

```bash
npm run dev
```

Abra `http://localhost:3000/login`. Depois do login, configure a conexão PEC em **Configurações → Municípios e conexões PEC**.

## Sequência mínima de validação

1. Salvar e testar conexão.
2. Executar **Validar consultas**.
3. Fazer uma pergunta normativa para testar o RAG.
4. Abrir Visão geral para testar cache/tools.
5. Consultar um indicador agregado.
6. Testar busca nominal somente com perfil autorizado.

## Antes de abrir PR

```bash
git diff --check
npm run build
```

Não inclua `.env.local`, dumps, credenciais, resultados nominais ou arquivos gerados em `.next/`.
