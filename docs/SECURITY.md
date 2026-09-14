# Segurança e LGPD

## Fronteiras

- navegador não confiável;
- servidor Next.js aplica sessão, RBAC e políticas;
- OpenAI recebe apenas contexto necessário, nunca credenciais;
- Supabase operacional guarda autorização, segredos cifrados, cache e histórico;
- PEC deve aceitar somente leitura.

## Credenciais

- Senhas PEC/SSH usam AES-256-GCM.
- `APS_AGENT_DB_CREDENTIALS_KEY` tem 32 bytes hex/base64.
- Trocar a chave sem recifrar torna conexões ilegíveis.
- Secrets são server-side; nunca usar `NEXT_PUBLIC_*`.
- Não registrar connection strings ou payloads descriptografados.

## Autorização

Organização, município e papel vêm da sessão. Administradores veem municípios ativos da organização; demais usuários dependem de vínculos.

Tools nominais são permitidas a `admin`, `manager`, `municipal_manager` e `coordinator`; `team` é bloqueado. A identidade também contém `nominal_access`, mas a verificação efetiva atual da registry é por papel. Alterar isso exige revisão de segurança.

## Dados nominais

- nunca armazenar em cache/histórico;
- não enviar para gráficos ou logs;
- retornar apenas o mínimo operacional;
- revisar futuras exportações por necessidade e rastreabilidade.

## SQL e SSH

Tools estáticas ficam em allowlist, parâmetros são normalizados e consultas usam `READ ONLY`. Para SSH, use usuário dedicado, firewall por IP e fingerprint fixada.

## Incidente

Revogue secrets/sessões, rotacione credenciais, preserve logs sem dados pessoais, identifique municípios/tools afetados, siga o processo LGPD e recifre conexões se a chave AES foi comprometida.
