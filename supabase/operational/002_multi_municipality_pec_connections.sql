-- DESTINO: SUPABASE OPERACIONAL DA CBAItyhy
-- NÃO executar no Supabase de IA/RAG.
-- Multi-município + credenciais de conexão PostgreSQL do e-SUS PEC.

create table if not exists public.aps_agent_user_municipalities (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id, municipality_id)
);

create index if not exists idx_aps_agent_user_municipalities_user
  on public.aps_agent_user_municipalities (auth_user_id, municipality_id)
  where active = true;

-- As credenciais são criptografadas pela aplicação antes de chegarem ao Supabase.
-- Nunca gravar a senha do PostgreSQL em texto puro.
create table if not exists public.aps_agent_municipality_connections (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null unique references public.municipalities(id) on delete cascade,
  host text not null,
  port integer not null default 5432 check (port > 0 and port <= 65535),
  database_name text not null,
  username text not null,
  password_encrypted text not null,
  ssl_enabled boolean not null default true,
  active boolean not null default true,
  last_test_at timestamptz,
  last_test_status text check (last_test_status is null or last_test_status in ('success','error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aps_agent_municipality_connections_active
  on public.aps_agent_municipality_connections (municipality_id)
  where active = true;

alter table public.aps_agent_user_municipalities enable row level security;
alter table public.aps_agent_municipality_connections enable row level security;

comment on table public.aps_agent_user_municipalities is
  'SUPABASE OPERACIONAL: municípios autorizados por usuário do CBAItyhy Inteligência APS.';

comment on table public.aps_agent_municipality_connections is
  'SUPABASE OPERACIONAL: conexão READ ONLY do e-SUS PEC por município. password_encrypted é cifrada no servidor.';

-- Migra o vínculo municipal já existente nos perfis atuais.
insert into public.aps_agent_user_municipalities (auth_user_id, municipality_id, active)
select auth_user_id, municipality_id, true
from public.aps_agent_profiles
where active = true
on conflict (auth_user_id, municipality_id) do update
set active = true,
    updated_at = now();
