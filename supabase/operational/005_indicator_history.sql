CREATE TABLE IF NOT EXISTS public.aps_agent_indicator_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  tool_id text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  result jsonb NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, tool_id, parameters, snapshot_date)
);

CREATE INDEX IF NOT EXISTS aps_agent_indicator_history_timeline_idx
  ON public.aps_agent_indicator_history (municipality_id, tool_id, snapshot_date DESC);

ALTER TABLE public.aps_agent_indicator_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.aps_agent_indicator_history IS
  'Snapshots diários somente de resultados agregados dos indicadores PEC; dados nominais são proibidos.';

COMMENT ON COLUMN public.aps_agent_indicator_history.snapshot_date IS
  'Data civil do snapshot no fuso America/Sao_Paulo.';

COMMENT ON COLUMN public.aps_agent_indicator_history.result IS
  'Resultado agregado da consulta; CPF, CNS, nome e demais identificadores pessoais não podem ser armazenados.';
