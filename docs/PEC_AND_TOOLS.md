# Conexões PEC e ferramentas SQL

## Conexão por município

A conexão não é configurada por variáveis globais. O administrador cadastra host, porta, banco, usuário, senha, SSL e, opcionalmente, SSH. A aplicação cifra as senhas antes de gravar no Supabase operacional.

Use usuário PostgreSQL dedicado e somente leitura. Recomenda-se também impor no servidor:

```sql
alter role usuario_pec set default_transaction_read_only = on;
alter role usuario_pec set statement_timeout = '30000ms';
```

## Direta e SSH

- Direta: pool `pg` por município.
- SSH: canal `forwardOut` por consulta, sem publicar a porta PostgreSQL.
- `ssl_enabled` refere-se ao PostgreSQL depois do túnel, não ao SSH.
- Fingerprint `SHA256:base64` é opcional tecnicamente e recomendado em produção.

O firewall municipal deve permitir o IP da VPS na porta SSH. O servidor SSH precisa alcançar o host/porta PostgreSQL informados.

## Garantias de execução

Toda consulta usa `BEGIN READ ONLY`, `SET LOCAL statement_timeout`, `COMMIT` ou `ROLLBACK`. O timeout efetivo fica entre 1 e 120 segundos.

## Catálogo

`config/tool-catalog.json` é a allowlist:

```json
{
  "id": "tool_exemplo",
  "sql": "sql/tools/tool_exemplo.sql",
  "kind": "aggregate",
  "nominal": false,
  "chart": true,
  "parameters": ["ine"],
  "municipalityScoped": true
}
```

- `nominal`: exige papel autorizado e impede cache/histórico.
- `parameters`: `ine`, `logradouro` e `nome` têm normalizadores atuais.
- `municipalityScoped`: substitui `{{MUNICIPALITY_IBGE}}` por parâmetro server-side.

## Criar uma tool

1. Escreva a SQL em `sql/tools/`.
2. Use parâmetros posicionais na ordem declarada.
3. Quando necessário, use `{{MUNICIPALITY_IBGE}}` e marque `municipalityScoped`.
4. Retorne nomes de colunas estáveis.
5. Adicione a entrada ao catálogo.
6. Adicione descrição em `describeTool()` de `lib/tool-registry.ts`.
7. Para indicador, associe `toolId` no JSON de `config/`.
8. Atualize `indicatorMetricColumns` quando houver resumo numérico.
9. Rode build e validador contra PEC real.

## Homologação

1. Confirmar tabelas e tipos na versão real do PEC.
2. Executar no DBeaver com competência conhecida.
3. Conferir amostras e regras de inclusão/exclusão.
4. Comparar por INE, não apenas total municipal.
5. Medir tempo e plano fora do horário de pico.
6. Executar **Validar consultas**.
7. Atualizar cache e comparar com SIAPS/Saúde 360.

Nunca use outro banco ou município para validar uma consulta, mesmo com schema igual.

## Consulta dinâmica agregada

É fallback, não substituta das tools. O modelo recebe cinco tabelas autorizadas; SQL escrita, dados pessoais, comandos de alteração, schemas do sistema, listas agregadas e funções fora da allowlist são rejeitados. A consulta passa por `EXPLAIN`, limite de 100 linhas e supressão de células pequenas.
