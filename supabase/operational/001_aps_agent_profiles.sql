-- DESTINO: SUPABASE OPERACIONAL DA CBAITYHY
-- NÃO executar no Supabase de IA/RAG.

create table if not exists public.aps_agent_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  organization_id uuid not null,
  municipality_id uuid not null,
  municipality_name text not null,
  role text not null check (role in ('admin','manager','municipal_manager','coordinator','team')),
  nominal_access boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aps_agent_profiles_organization
  on public.aps_agent_profiles (organization_id, municipality_id)
  where active = true;

alter table public.aps_agent_profiles enable row level security;

comment on table public.aps_agent_profiles is
  'SUPABASE OPERACIONAL: vínculo de usuários do CBAItyhy Inteligência APS com organização, município e RBAC. Não pertence ao banco de IA/RAG.';
