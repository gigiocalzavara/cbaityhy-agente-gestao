# Validação dos indicadores Saúde 360

Os resultados calculados diretamente no PEC são **prévias locais**. O sistema não deve usar “validado”, “oficial” ou “resultado Saúde 360” até que o valor seja confrontado com o SIAPS/Saúde 360 na mesma competência, no mesmo INE e com a mesma data de extração.

## Etapas por município

1. Executar o validador estrutural do catálogo no banco PEC.
2. Confirmar os modelos de atendimento, procedimentos, visitas, vacinação, saúde bucal, problemas/condições e dimensões de CBO/equipe.
3. Confirmar a versão do PEC e a competência dos dados.
4. Executar cada componente A–K e revisar uma amostra dos registros-fonte.
5. Comparar denominador, pontuação média e resultado por INE com o Saúde 360.
6. Registrar divergências de vinculação, CadSUS, SCNES, transmissão e competência.
7. Somente após a conciliação, alterar `partial`/`ready` para `validated`.

## Estados

- `schema_pending`: estrutura PEC ainda não confirmada.
- `partial`: consulta gerencial disponível, mas sem todas as boas práticas oficiais.
- `ready`: cálculo implementado e tecnicamente executável naquele PEC.
- `validated`: cálculo conciliado com o Saúde 360 em uma competência real.

Versão-base: notas C1–C7 do Ministério da Saúde atualizadas em 24/06/2026. Pesos, janelas e populações estão em `config/saude-360-indicators.json`.

O mesmo protocolo se aplica aos indicadores de Saúde Bucal B1–B6, versão de 15/05/2026, e eMulti M1–M2, versão de 01/07/2026. As fórmulas e faixas estão em `config/oral-health-indicators.json` e `config/emulti-indicators.json`.
