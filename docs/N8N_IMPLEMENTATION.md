# Implementação no n8n

## Workflow principal

Sequência recomendada de nós:

1. **Webhook — Evolution Inbound**
   - método: POST
   - path sugerido: `/cbaityhy/aps-agent/inbound`

2. **Code — Sanitize Evolution Payload**
   - usar `n8n/code/sanitize-evolution-payload.js`
   - descarta mensagens próprias e payloads sem texto suportado

3. **IF — Ignored?**
   - se `ignored=true`, finalizar sem responder

4. **Memory — Window Buffer**
   - chave: `remoteJid`
   - janela curta; evitar persistir listas nominais

5. **LLM — Router**
   - system prompt: `prompts/router-system.md`
   - saída estruturada em JSON
   - temperatura baixa

6. **Code — Validate Tool Selection**
   - usar `n8n/code/validate-tool-selection.js`
   - rejeita tool fora da allowlist
   - normaliza parâmetros

7. **Switch — Intent**
   - `TRIVIAL`
   - `NORMATIVE_RAG`
   - `INDICATOR`
   - `NOMINAL_SEARCH`
   - `UNSUPPORTED`

8. **Switch — Tool ID** para `INDICATOR` e `NOMINAL_SEARCH`
   - um ramo por tool SQL
   - cada ramo usa um nó Postgres próprio com SQL homologado

9. **Postgres — Tool específica**
   - credencial dedicada somente leitura
   - timeout de sessão recomendado: 8 s
   - sem expressão que receba SQL do LLM

10. **Supabase Vector Store — Retrieve**
   - obrigatório em `NORMATIVE_RAG`
   - opcional após consulta de indicador quando `needs_rag=true`
   - filtrar por tipo/indicador quando houver metadados

11. **LLM — Analyst**
   - system prompt: `prompts/analyst-system.md`
   - entradas: pergunta original + JSON da tool + trechos RAG

12. **IF — Needs Chart**
   - somente para dados agregados

13. **HTTP Request — QuickChart**
   - enviar apenas labels e números agregados
   - nunca enviar dados nominais

14. **HTTP Request — Evolution sendText**
   - `POST {{$env.EVOLUTION_API_BASE_URL}}/message/sendText/{{$env.EVOLUTION_API_INSTANCE}}`
   - header `apikey: {{$env.EVOLUTION_API_KEY}}`
   - body conceitual:

```json
{
  "number": "={{ $json.remoteJid.replace('@s.whatsapp.net', '') }}",
  "text": "={{ $json.answer }}"
}
```

15. **HTTP Request — Evolution sendMedia**
   - usar quando houver URL de gráfico
   - caption deve conter a síntese textual curta

## Regra para as tools Postgres

Não usar um único nó Postgres com expressão do tipo:

```text
query = {{$json.sql}}
```

O correto é um nó por consulta homologada ou uma camada intermediária que mapeie `tool_id` para SQL versionado fora do LLM.

## Parametrização

As consultas atuais foram homologadas com alguns parâmetros dentro de CTEs. A próxima revisão deve substituir valores fixos por parâmetros controlados pelo workflow. Prioridades:

- `tool_busca_territorial_rua`: `logradouro` e `ine`
- `tool_indicador_idoso`: `ine`
- `tool_busca_ativa_idosos`: `ine`
- `tool_censo_gestantes`: `ine`

Nunca concatenar texto cru produzido pelo LLM dentro da query.

## Configuração da conexão PEC

Após conectar com o usuário de leitura, executar como inicialização de sessão quando suportado:

```sql
SET statement_timeout = '8000ms';
SET default_transaction_read_only = on;
```

No próprio PostgreSQL, preferir também aplicar essas restrições ao usuário/role, para que a segurança não dependa apenas do n8n.

## Tratamento de falhas

Criar um Error Workflow separado com:

- `correlation_id`
- nome da etapa
- `tool_id`
- duração
- código de erro normalizado

Não registrar conteúdo bruto de listas nominais em logs de erro.

## Ordem de homologação

1. Testar cada SQL em banco de espelho.
2. Confirmar nomes/tipos das colunas na versão real do PEC.
3. Medir tempo de execução com `EXPLAIN (ANALYZE, BUFFERS)` fora do horário de pico.
4. Só então habilitar a tool no catálogo de produção.
