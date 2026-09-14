# Troubleshooting

## Traefik: 404 e certificado padrão

Confirme provider Swarm, labels em `deploy.labels`, `Host()`, entrypoint `websecure`, TLS/certresolver, rede externa `azurranet`, `traefik.docker.network` e DNS.

## PostgreSQL não suporta SSL

Desmarque SSL no município. Em SSH, SSL continua sendo propriedade do PostgreSQL remoto.

## `getaddrinfo ENOTFOUND 186227199180`

O IP perdeu os pontos. Prefira cadastrar `186.227.199.180`; a aplicação só normaliza exatamente 12 dígitos válidos.

## SSH preso em teste

Verifique porta, credenciais, firewall e alcance do PostgreSQL pelo servidor SSH. Os erros distinguem conexão SSH, forward e PostgreSQL sobre SSH.

## `this.stream.setNoDelay/connect is not a function`

O canal `ssh2` precisa da adaptação existente em `lib/ssh-tunnel.ts`. Não remova esses métodos sem teste real.

## `canceling statement due to statement timeout`

Use cache, filtre município/competência cedo, reduza expansão e CTEs, examine índices/plano e só depois aumente timeout.

## Cache retorna 401

`CACHE_REFRESH_SECRET` no GitHub e na stack deve ser idêntico. Header: `Authorization: Bearer VALOR`. Redeploy após alterar variável.

## Cache antigo

Confira `generated_at`, `expires_at`, workflow e relatório do endpoint. Falha preserva o último sucesso.

## IA sem conteúdo

Confirme imagem posterior à correção de múltiplas tools e modelo compatível com Responses API/function calling.

## Indicador zero

Confirme banco/município, IBGE, competência máxima, CBO, INE, SIGTAP e CNS profissional; rode a SQL no DBeaver e compare com o validador.

## SQL ausente na imagem

O Dockerfile copia `config/` e `sql/`. Confirme arquivo versionado, commit da imagem e pull da tag nova no Portainer.

Registre no diagnóstico: commit/tag, município, competência, tool, duração, cache e erro normalizado — nunca credenciais ou dados nominais.
