# Configuração

## Variáveis de runtime

| Variável | Obrigatória | Padrão | Uso |
|---|---:|---|---|
| `CBAITYHY_OPERATIONAL_SUPABASE_URL` | sim | — | Auth e REST operacional |
| `CBAITYHY_OPERATIONAL_SUPABASE_SECRET_KEY` | sim | — | acesso server-side operacional |
| `CBAITYHY_AI_SUPABASE_URL` | sim para RAG | — | REST/RPC da base vetorial |
| `CBAITYHY_AI_SUPABASE_SECRET_KEY` | sim para RAG | — | acesso server-side ao RAG |
| `CBAITYHY_ORGANIZATION_ID` | sim | — | filtro organizacional do conhecimento |
| `OPENAI_API_KEY` | sim para IA | — | Responses API e embeddings |
| `OPENAI_MODEL` | não | `gpt-5.6-luna` | agente conversacional e fallback SQL |
| `OPENAI_SQL_MODEL` | não | `OPENAI_MODEL` | geração da consulta agregada restrita |
| `OPENAI_EMBEDDING_MODEL` | não | `text-embedding-3-small` | embedding do RAG |
| `APS_AGENT_DB_CREDENTIALS_KEY` | sim | — | AES-256-GCM das senhas PEC/SSH |
| `CACHE_REFRESH_SECRET` | sim para job | — | autenticação do refresh interno |
| `PEC_PG_POOL_MAX` | não | `5` | pool direto por município |
| `PEC_PG_STATEMENT_TIMEOUT_MS` | não | `30000` no código; compose usa `8000` | timeout geral, limitado a 120 s |
| `DEFAULT_RESULT_LIMIT` | não | `15` | máximo nominal padrão |
| `NODE_ENV` | produção | — | cookies seguros e runtime Next.js |

`APP_URL` e `LOG_LEVEL` estão presentes nos arquivos de ambiente/compose, mas não possuem consumidor direto no código atual.

## Variáveis do compose/Traefik

| Variável | Padrão | Uso |
|---|---|---|
| `APP_DOMAIN` | sem padrão útil | host público do router |
| `TRAEFIK_NETWORK` | `azurranet` | rede externa compartilhada |
| `TRAEFIK_CERTRESOLVER` | `letsencryptresolver` | emissão TLS |

## Regras operacionais

- Não altere `APS_AGENT_DB_CREDENTIALS_KEY` em produção sem plano de recifragem.
- O valor de `CACHE_REFRESH_SECRET` deve ser idêntico no Portainer e GitHub Actions.
- Variáveis alteradas no Portainer só chegam ao container após redeploy.
- Nunca use aspas como parte do valor de secrets.
- Não exponha nenhuma secret com prefixo `NEXT_PUBLIC_`.

## Rotação

- OpenAI/Supabase/cache: atualize secret, redeploy e revogue o anterior.
- PEC/SSH: altere pela interface e execute teste.
- Chave AES: exige descriptografar com a chave antiga, recifrar todos os registros com a nova e somente então redeploy. Sem esse procedimento, as conexões existentes deixam de funcionar.
