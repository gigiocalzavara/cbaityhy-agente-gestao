# Contribuindo

## Fluxo

1. Atualize `main` e crie branch curta.
2. Faça alterações pequenas e relacionadas.
3. Execute `git diff --check` e `npm run build`.
4. Abra PR com impacto, risco, validação e deploy.

## Commits

```text
feat: add eMulti M1 calculation
fix: calculate B1 population denominator
docs: add developer handbook
```

## Indicadores

Inclua fonte/versão, fórmula/códigos, schema PEC, município/competência, comparação por INE e tempo. Não use `validated` apenas porque a SQL executa.

## Banco

Crie a próxima migration em `supabase/operational/`. Informe destino e ordem. Nunca grave secrets em SQL.

## Checklist de PR

- [ ] build concluído;
- [ ] sem credencial ou dado pessoal;
- [ ] autenticação/RBAC preservados;
- [ ] SQL parametrizada e somente leitura;
- [ ] tool nominal fora do cache;
- [ ] documentação atualizada;
- [ ] deploy/redeploy descrito;
- [ ] rollback indicado.

## Publicação

Merge em `main` dispara Build e Docker Publish. Aguarde ambos verdes, faça redeploy e valide health, login, município, cache e funcionalidade alterada.
