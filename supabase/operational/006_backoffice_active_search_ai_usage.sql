-- DESTINO: SUPABASE OPERACIONAL DA CBAITYHY
-- Backoffice interno, cache nominal de busca ativa e medição de consumo.
-- Executar depois da migration 005.

alter table public.aps_agent_profiles
  add column if not exists staff_role text null,
  add column if not exists can_access_all_municipalities boolean not null default false;

alter table public.aps_agent_profiles drop constraint if exists aps_agent_profiles_staff_role_check;
alter table public.aps_agent_profiles
  add constraint aps_agent_profiles_staff_role_check
  check (staff_role is null or staff_role in ('cbaityhy_admin','cbaityhy_analyst'));

alter table public.municipalities
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists ai_disabled_reason text null,
  add column if not exists ai_updated_at timestamptz null,
  add column if not exists ai_updated_by uuid null;

create table if not exists public.aps_agent_processing_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  municipality_id uuid null references public.municipalities(id) on delete cascade,
  routine text not null check (routine in ('active_search','aggregate_cache')),
  trigger_source text not null default 'schedule' check (trigger_source in ('schedule','retry','admin')),
  status text not null default 'queued' check (status in ('queued','running','success','partial','error','cancelled')),
  total_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  failed_tasks integer not null default 0,
  row_count integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists aps_processing_runs_admin_idx
  on public.aps_agent_processing_runs (routine, status, created_at desc);
create index if not exists aps_processing_runs_municipality_idx
  on public.aps_agent_processing_runs (municipality_id, created_at desc);

create table if not exists public.aps_agent_active_search_cache (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  tool_id text not null,
  generation_id uuid not null references public.aps_agent_processing_runs(id) on delete cascade,
  citizen_key text not null,
  ine text null,
  team_name text null,
  priority text null,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  unique (municipality_id, tool_id, generation_id, citizen_key)
);

create index if not exists aps_active_search_lookup_idx
  on public.aps_agent_active_search_cache (municipality_id, tool_id, ine, priority, citizen_key);
create index if not exists aps_active_search_generation_idx
  on public.aps_agent_active_search_cache (generation_id);

create table if not exists public.aps_agent_active_search_current (
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  tool_id text not null,
  generation_id uuid not null references public.aps_agent_processing_runs(id) on delete cascade,
  published_at timestamptz not null default now(),
  primary key (municipality_id, tool_id)
);

create table if not exists public.aps_agent_ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  auth_user_id uuid null,
  response_id text null,
  model text not null,
  feature text not null check (feature in ('assistant','rag','dynamic_query','synthesis')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  estimated_cost_usd numeric(14,6) null,
  success boolean not null default true,
  error_code text null,
  created_at timestamptz not null default now()
);

create index if not exists aps_ai_usage_admin_idx
  on public.aps_agent_ai_usage (municipality_id, created_at desc);
create index if not exists aps_ai_usage_period_idx
  on public.aps_agent_ai_usage (organization_id, created_at desc);

create table if not exists public.aps_agent_admin_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_auth_user_id uuid not null,
  municipality_id uuid null references public.municipalities(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists aps_admin_audit_idx
  on public.aps_agent_admin_audit (organization_id, created_at desc);

alter table public.aps_agent_processing_runs enable row level security;
alter table public.aps_agent_active_search_cache enable row level security;
alter table public.aps_agent_active_search_current enable row level security;
alter table public.aps_agent_ai_usage enable row level security;
alter table public.aps_agent_admin_audit enable row level security;

comment on table public.aps_agent_active_search_cache is
  'Cache nominal operacional. A API libera somente após RBAC e escopo municipal; nunca usar no histórico agregado.';
comment on column public.municipalities.ai_enabled is
  'Interruptor contratual da IA. Não desativa painéis, indicadores ou buscas ativas.';
