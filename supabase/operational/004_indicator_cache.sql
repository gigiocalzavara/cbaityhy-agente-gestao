CREATE TABLE IF NOT EXISTS public.aps_agent_tool_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  tool_id text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  error_message text,
  duration_ms integer,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '26 hours'),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, tool_id, parameters)
);

CREATE INDEX IF NOT EXISTS aps_agent_tool_cache_lookup_idx
  ON public.aps_agent_tool_cache (municipality_id, tool_id, generated_at DESC);

ALTER TABLE public.aps_agent_tool_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.aps_agent_tool_cache IS
  'Cache persistente apenas de resultados agregados do PEC; dados nominais não devem ser gravados nesta tabela.';

