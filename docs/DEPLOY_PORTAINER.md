# Deploy e operação

Produção atual: `https://gestaosus.azurratech.com.br`, stack `cbaityhy-gestao`, rede externa `azurranet`.

## Pipeline

1. Push/merge em `main`.
2. workflow **Build** executa `npm install` e `npm run build`.
3. **Docker Publish** publica `ghcr.io/gigiocalzavara/cbaityhy-agente-gestao:latest` e `sha-*`.
4. Operador aguarda workflows verdes.
5. Portainer faz pull/redeploy da stack.
6. Traefik publica HTTPS e Docker verifica `/api/health`.

O redeploy não é automático no código atual.

## Stack

No Portainer, use Repository/Git com branch `main` e compose `docker-compose.portainer.yml`. A rede `${TRAEFIK_NETWORK:-azurranet}` precisa existir previamente e ser a mesma do Traefik.

## Variáveis

```env
APP_DOMAIN=gestaosus.azurratech.com.br
TRAEFIK_NETWORK=azurranet
TRAEFIK_CERTRESOLVER=letsencryptresolver

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
LOG_LEVEL=info
```

`OPENAI_SQL_MODEL` é usado pelo código, mas ainda não aparece explicitamente no compose. Adicione-o à stack/compose se precisar divergir de `OPENAI_MODEL`.

Não existem mais variáveis globais `PEC_PG_HOST`, `PEC_PG_DATABASE`, `PEC_PG_USER` e `PEC_PG_PASSWORD` no runtime; conexões ficam por município no Supabase operacional.

## GHCR

Se o package for privado, configure credencial `ghcr.io` no Portainer com PAT `read:packages`. A GitHub Action usa `GITHUB_TOKEN` com `packages: write`.

## Traefik

O compose define:

- router `cbaityhy-gestao`;
- regra `Host(${APP_DOMAIN})`;
- entrypoint `websecure`;
- TLS e certresolver;
- porta interna 3000;
- rede Docker explicitada.

Default certificate ou 404 do Traefik normalmente indica router não carregado, host divergente, provider Swarm/rede incorretos ou resolver inválido.

## Healthcheck

```text
GET https://gestaosus.azurratech.com.br/api/health
```

Ele verifica apenas a aplicação Next.js. PEC, Supabase e OpenAI são testados separadamente para não reiniciar o container por falha externa transitória.

## Cache diário

O workflow **Daily PEC Cache Refresh** executa às 08:00 UTC (05:00 Brasília com UTC−3) e pode ser disparado manualmente. Configure `CACHE_REFRESH_SECRET` em GitHub Actions e com o mesmo valor na stack.

## Checklist pós-deploy

1. Confirmar imagem/tag nova no serviço.
2. Verificar `/api/health` e certificado TLS.
3. Entrar em `/login`.
4. Confirmar município ativo e selo PEC conectado.
5. Testar pergunta normativa e uma tool agregada.
6. Abrir Visão geral e Indicadores.
7. Quando houver SQL/migration nova, executar validador e refresh do cache.
8. Inspecionar logs por erro de Supabase, OpenAI, PostgreSQL ou SSH.

## Rollback

O Swarm está configurado com `failure_action: rollback`, mas erro funcional pode passar pelo healthcheck. Para rollback manual, selecione a imagem `sha-*` anterior validada no Portainer, redeploy e registre o commit revertido. Não apague cache/histórico como primeira medida.

## Migrations

Migrations não são aplicadas pelos workflows. Devem ser executadas manualmente no Supabase operacional antes do código que depende delas. Registre data, operador e resultado.
