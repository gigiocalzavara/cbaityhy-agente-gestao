-- DESTINO: SUPABASE OPERACIONAL DA CBAItyhy
-- Adiciona túnel SSH opcional às conexões PEC existentes.

alter table public.aps_agent_municipality_connections
  add column if not exists ssh_enabled boolean not null default false,
  add column if not exists ssh_host text,
  add column if not exists ssh_port integer default 22,
  add column if not exists ssh_username text,
  add column if not exists ssh_password_encrypted text,
  add column if not exists ssh_host_fingerprint text;

alter table public.aps_agent_municipality_connections
  drop constraint if exists aps_agent_municipality_connections_ssh_port_check;

alter table public.aps_agent_municipality_connections
  add constraint aps_agent_municipality_connections_ssh_port_check
  check (ssh_port is null or (ssh_port > 0 and ssh_port <= 65535));

comment on column public.aps_agent_municipality_connections.ssh_password_encrypted is
  'Senha SSH cifrada pela aplicação com AES-256-GCM. Nunca armazenar em texto puro.';

comment on column public.aps_agent_municipality_connections.ssh_host_fingerprint is
  'Fingerprint SHA256 opcional da chave do servidor SSH, no formato SHA256:base64.';
