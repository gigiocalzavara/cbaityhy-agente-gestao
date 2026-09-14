# API HTTP

Todas as rotas, exceto login, healthcheck e refresh interno, dependem da sessão HTTP-only.

| Método e rota | Finalidade | Acesso |
|---|---|---|
| `POST /api/auth/login` | autenticar | público |
| `POST /api/auth/logout` | limpar sessão | autenticado |
| `GET /api/auth/me` | identidade ativa | autenticado |
| `GET /api/health` | vida da aplicação | público |
| `POST /api/chat` | agente de gestão | autenticado |
| `GET /api/municipalities` | listar municípios e conexão | autenticado |
| `POST /api/municipalities` | cadastrar município | admin |
| `POST /api/municipalities/select` | trocar município | autorizado |
| `GET /api/municipalities/{id}/connection` | resumo sem senhas | admin |
| `PUT /api/municipalities/{id}/connection` | salvar; `?test=1` salva/testa | admin |
| `POST /api/municipalities/{id}/connection` | testar configuração salva | admin |
| `POST /api/municipalities/{id}/validate` | validar SQLs | admin |
| `POST /api/tools/{toolId}` | executar tool | autenticado/RBAC |
| `GET /api/indicators/history` | histórico agregado | autenticado |
| `POST /api/internal/cache/refresh` | cache global | Bearer secret |

## Chat

```json
{
  "message": "Como está a saúde bucal do município?",
  "history": [{ "role": "user", "content": "..." }]
}
```

Resposta: `answer`, `sources`, `ragUsed`, `toolUsed`, `presentation` e `responseId`.

## Tool

```json
{
  "parameters": { "ine": null }
}
```

O backend ignora qualquer município enviado pelo cliente; o escopo vem da sessão.

## Histórico

```text
GET /api/indicators/history?toolId=tool_indicador_hipertensao&from=2026-01-01&to=2026-09-30&limit=180
```

Datas usam `AAAA-MM-DD`; limite entre 1 e 366.

## Status comuns

- `400`: payload inválido;
- `401`: sessão/secret inválido;
- `403`: acesso negado;
- `404`: tool não homologada;
- `500`: falha interna ou integração;
- `502`: teste PostgreSQL/SSH falhou.

Não exponha credenciais, SQL completa ou dados pessoais em erros.
