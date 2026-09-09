# Arquitetura do Agente de Gestão APS

## Regra central

O modelo generativo interpreta intenção e sintetiza respostas. As regras dos indicadores ficam em consultas SQL versionadas e homologadas. O modelo não executa SQL arbitrário no banco operacional.

## Pipeline

1. Webhook recebe a mensagem da Evolution API.
2. Nó de saneamento normaliza o payload e descarta eventos originados pelo próprio bot.
3. Nó de contexto resolve o escopo autorizado da solicitação.
4. Roteador classifica a intenção: conversa, dúvida normativa, indicador, busca operacional ou não suportado.
5. Para consultas de dados, o roteador escolhe somente um `tool_id` presente na allowlist.
6. A tool correspondente executa consulta SQL homologada usando conexão somente leitura.
7. O analista recebe o JSON da consulta e, quando necessário, trechos recuperados do RAG.
8. O formatador gera resposta textual ou gráfico agregado.
9. A Evolution API envia a resposta ao WhatsApp.

## Contrato do roteador

```json
{
  "intent": "INDICATOR",
  "tool_id": "tool_indicador_hipertensao",
  "parameters": {
    "ine": null,
    "logradouro": null
  },
  "needs_rag": true,
  "needs_chart": true
}
```

`tool_id` deve pertencer a uma allowlist validada fora do LLM.

## Tools iniciais

- tool_indicador_citopatologico
- tool_busca_ativa_gestantes_atraso
- tool_indicador_hipertensao
- tool_indicador_diabetes
- tool_indicador_idoso
- tool_busca_ativa_idosos
- tool_indicador_vacinacao_infantil
- tool_censo_gestantes
- tool_busca_territorial_rua
- tool_auditoria_cadastros

## Executor de dados

- conexão somente leitura;
- timeout de consulta;
- consultas versionadas;
- limites de retorno;
- parâmetros validados;
- resposta JSON estruturada.

## RAG

Metadados recomendados para cada documento:

```json
{
  "source": "Ministério da Saúde",
  "document_type": "portaria|nota_tecnica|ficha_indicador|manual",
  "document_number": "...",
  "publication_date": "YYYY-MM-DD",
  "indicator": "...",
  "url": "...",
  "version": "..."
}
```

O agente analista deve separar claramente: resultado calculado, explicação normativa e recomendação operacional.

## Gráficos

QuickChart deve receber somente dados agregados dos indicadores. A geração de gráfico é opcional e ocorre após a consulta.
