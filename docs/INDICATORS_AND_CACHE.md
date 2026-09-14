# Indicadores, cache e histórico

## Grupos

| Grupo | Configuração | Situação geral |
|---|---|---|
| APS C1–C7 | `config/saude-360-indicators.json` | C1 e recortes parciais C2–C7 disponíveis |
| Saúde Bucal B1–B6 | `config/oral-health-indicators.json` | B1, B2, B3, B5 e B6 disponíveis; B4 pendente |
| eMulti M1–M2 | `config/emulti-indicators.json` | mapeamento/tools pendentes |

Estados: `schema_pending` (estrutura pendente), `partial` (recorte não conciliado), `ready` (cálculo completo executável) e `validated` (conciliado com painel oficial).

## B1

O B1 identifica primeiras consultas, localiza eSB → eSF/eAP em `tb_dim_vinculacao_equipes` e conta o vínculo mais recente de cidadãos ativos, excluindo óbito e saída territorial. O SCNES valida equipe/vínculo; a contagem local vem do PEC.

## Cache

Resultados agregados são lidos preferencialmente de `aps_agent_tool_cache` e valem 26 horas. Listas nominais nunca são armazenadas.

```text
POST /api/internal/cache/refresh
Authorization: Bearer <CACHE_REFRESH_SECRET>
```

O refresh percorre municípios conectados e tools agregadas sem parâmetros obrigatórios ou apenas com `ine=null`.

## Agendamento

`.github/workflows/cache-refresh.yml` usa `0 8 * * *`, equivalente a 05h em Brasília com UTC−3. O secret no GitHub e na stack deve ser idêntico.

## Falha e histórico

Falha de atualização preserva o último sucesso e registra a tentativa. A interface pode devolver cache expirado com `stale=true`. Cada sucesso também grava um snapshot diário agregado em `aps_agent_indicator_history`.

## Evolução

Antes de alterar fórmula, SIGTAP, CBO, janela ou população: arquive a fonte, atualize versão, revise SQL/interface, valide por INE e mantenha `partial` até conciliação formal.
