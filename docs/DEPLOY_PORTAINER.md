# Deploy no Portainer — CBAItyhy Inteligência APS

Este projeto foi preparado para rodar em Docker Swarm/Portainer atrás do Traefik.

## 1. Fluxo de deploy

1. Push na branch `main`.
2. GitHub Actions executa o build normal do Next.js.
3. O workflow `Docker Publish` gera a imagem:
   `ghcr.io/gigiocalzavara/cbaityhy-agente-gestao:latest`
4. O Portainer usa `docker-compose.portainer.yml` para subir o serviço.
5. O Traefik publica o domínio HTTPS e verifica `/api/health`.

## 2. Atenção: são dois Supabases diferentes

### Supabase OPERACIONAL
Use para Auth, municípios e RBAC do Inteligência APS.

Variáveis:
- `CBAITYHY_OPERATIONAL_SUPABASE_URL`
- `CBAITYHY_OPERATIONAL_SUPABASE_SECRET_KEY`

A migration `supabase/operational/001_aps_agent_profiles.sql` pertence SOMENTE a este banco.

### Supabase IA
Use somente para RAG/vector/embeddings.

Variáveis:
- `CBAITYHY_AI_SUPABASE_URL`
- `CBAITYHY_AI_SUPABASE_SECRET_KEY`
- `CBAITYHY_ORGANIZATION_ID`

Não execute migrations operacionais neste banco.

## 3. Criar a Stack no Portainer

No Portainer:

1. `Stacks` → `Add stack`.
2. Nome sugerido: `cbaityhy-agente-gestao`.
3. Use o método Repository/Git.
4. Repositório: `https://github.com/gigiocalzavara/cbaityhy-agente-gestao.git`
5. Branch: `main`.
6. Compose path: `docker-compose.portainer.yml`.
7. Cadastre as variáveis abaixo no ambiente da stack.

## 4. Variáveis obrigatórias

```env
APP_DOMAIN=gestao.cbaityhy.com.br
TRAEFIK_NETWORK=network_public
TRAEFIK_CERTRESOLVER=letsencryptresolver

CBAITYHY_OPERATIONAL_SUPABASE_URL=
CBAITYHY_OPERATIONAL_SUPABASE_SECRET_KEY=

CBAITYHY_AI_SUPABASE_URL=
CBAITYHY_AI_SUPABASE_SECRET_KEY=
CBAITYHY_ORGANIZATION_ID=61c7d4bf-f911-4972-8be9-feaab184a1f1

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

PEC_PG_HOST=
PEC_PG_PORT=5432
PEC_PG_DATABASE=
PEC_PG_USER=
PEC_PG_PASSWORD=
PEC_PG_SSL=true
PEC_PG_POOL_MAX=5
PEC_PG_STATEMENT_TIMEOUT_MS=8000

DEFAULT_RESULT_LIMIT=15
LOG_LEVEL=info
```

## 5. Rede do Traefik

O compose assume por padrão a rede externa `network_public`.

Se a rede usada pelo Traefik na VPS tiver outro nome, altere apenas:

```env
TRAEFIK_NETWORK=nome_real_da_rede
```

O mesmo vale para o resolver TLS:

```env
TRAEFIK_CERTRESOLVER=nome_real_do_certresolver
```

## 6. Imagem GHCR

O workflow publica a imagem no GitHub Container Registry.

Se o pacote GHCR estiver privado, o Portainer precisa de uma Registry Credential com acesso ao GitHub Container Registry. Alternativamente, torne apenas esse package público no GitHub Packages.

Registry:
- URL: `ghcr.io`
- usuário: usuário GitHub com acesso ao repositório/package
- token: GitHub PAT com permissão `read:packages`

## 7. DNS

Crie no Cloudflare um registro para o domínio definido em `APP_DOMAIN`, apontando para a VPS onde o Traefik está rodando.

Exemplo:

`gestao.cbaityhy.com.br` → IP público da VPS

Se o Traefik já atende outros domínios CBAItyhy na mesma VPS, use a mesma estratégia de DNS/proxy já adotada neles.

## 8. Healthcheck

Endpoint público:

`https://gestao.cbaityhy.com.br/api/health`

Resposta esperada:

```json
{
  "status": "ok",
  "service": "cbaityhy-agente-gestao"
}
```

O healthcheck não testa PEC, Supabase nem OpenAI de propósito. Ele informa apenas que a aplicação Next.js está viva; integrações são testadas separadamente para não derrubar o container por indisponibilidade externa transitória.

## 9. Primeiro teste funcional

Depois do deploy:

1. Abra `/login`.
2. Entre com o usuário criado no Supabase Auth OPERACIONAL.
3. A API `/api/auth/me` deve resolver `aps_agent_profiles`.
4. O sidebar deve exibir o município vinculado.
5. Faça primeiro uma pergunta normativa para testar RAG.
6. Depois faça uma pergunta agregada de indicador para testar o PostgreSQL PEC.

## 10. Segurança

- Nunca coloque as secret keys em variáveis `NEXT_PUBLIC_*`.
- Use uma conta PostgreSQL do PEC exclusivamente READ ONLY.
- Não publique a porta 3000 diretamente na internet; o acesso deve passar pelo Traefik.
- `nominal_access=false` deve permanecer até a validação de auditoria e LGPD do fluxo nominal.

## 11. Cache diário dos indicadores

Antes do deploy, execute no Supabase Operacional:

`supabase/operational/004_indicator_cache.sql`

Adicione `CACHE_REFRESH_SECRET` à stack usando um segredo longo e aleatório. Cadastre o
mesmo valor no GitHub Actions, em **Settings → Secrets and variables → Actions**, com o
nome `CACHE_REFRESH_SECRET`. O workflow `Daily PEC Cache Refresh` executa diariamente
às 05h no horário de Brasília e também pode ser disparado manualmente.

Somente ferramentas agregadas são persistidas. Listas nominais de busca ativa nunca são
gravadas no cache e continuam protegidas por perfil e por `nominal_access`.
# Conexões PEC por túnel SSH

Antes de publicar uma versão com suporte a SSH, execute no Supabase Operacional:

`supabase/operational/003_pec_ssh_tunnel.sql`

O container precisa conseguir sair para o IP e porta SSH do município. O firewall remoto deve liberar o IP público da VPS. Use preferencialmente um usuário SSH dedicado e um usuário PostgreSQL somente leitura. O fingerprint `SHA256` do host é opcional na primeira configuração e recomendado antes de colocar a integração em produção.
