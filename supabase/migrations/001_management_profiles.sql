create table if not exists public.management_profiles (
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

create index if not exists idx_management_profiles_organization
  on public.management_profiles (organization_id, municipality_id)
  where active = true;

alter table public.management_profiles enable row level security;

-- O backend deste app usa service role para resolver o vínculo após validar
-- o access token no Supabase Auth. Não há policy pública de leitura/gravação.
comment on table public.management_profiles is
  'Vínculo de usuários autenticados do CBAItyhy Inteligência APS com organização, município e RBAC.';
