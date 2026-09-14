# Supabase operacional e migrations

## Dois projetos distintos

| Projeto | Responsabilidade |
|---|---|
| Operacional | Auth, perfis, municípios, conexões PEC, cache e histórico |
| IA/RAG | fontes, chunks, embeddings e RPC de busca semântica |

As migrations deste repositório pertencem exclusivamente ao operacional.

## Ordem das migrations

| Arquivo | Cria/altera |
|---|---|
| `001_aps_agent_profiles.sql` | `aps_agent_profiles` e RBAC base |
| `002_multi_municipality_pec_connections.sql` | vínculos adicionais e conexões PEC |
| `003_pec_ssh_tunnel.sql` | colunas de SSH nas conexões |
| `004_indicator_cache.sql` | cache agregado persistente |
| `005_indicator_history.sql` | snapshots diários agregados |

Devem ser aplicadas e registradas em ordem.

## Tabelas da aplicação

### `aps_agent_profiles`

Um perfil ativo por `auth_user_id`, com organização, município padrão, papel e `nominal_access`. Papéis aceitos: `admin`, `manager`, `municipal_manager`, `coordinator`, `team`.

### `aps_agent_user_municipalities`

Municípios adicionais permitidos para usuários não administradores. Administradores recebem todos os municípios ativos da organização.

### `aps_agent_municipality_connections`

Uma configuração PEC ativa por município. Senhas PostgreSQL e SSH ficam cifradas pela aplicação em AES-256-GCM. A tabela também guarda o último teste e erro resumido.

### `aps_agent_tool_cache`

Uma entrada por município, tool e conjunto de parâmetros. Expira em 26 horas. Uma falha preserva o último resultado válido e registra a tentativa.

### `aps_agent_indicator_history`

Um snapshot por dia civil de São Paulo, município, tool e parâmetros. Dados nominais são proibidos.

## Supabase de IA

O código espera `knowledge_sources`, `knowledge_chunks` e a RPC `match_knowledge_chunks`. O embedding padrão é `text-embedding-3-small`, com 1536 dimensões. A recuperação filtra por organização e, quando aplicável, município.

## RLS e chave de serviço

As tabelas operacionais têm RLS habilitado. O backend usa a secret/service key server-side. Não crie variáveis `NEXT_PUBLIC_*` para essas chaves.

## Mudanças de schema

1. Crie uma nova migration numerada.
2. Não edite migration já aplicada para representar mudança nova.
3. Use operações idempotentes quando possível.
4. Documente rollback ou correção compensatória.
5. Valide em homologação antes da produção.
