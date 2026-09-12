WITH atendimentos_mes AS (
    SELECT e.nu_ine,
           e.no_equipe,
           date_trunc('month', o.dt_inicial_atendimento)::date AS competencia,
           trim(o.nu_cns) AS cidadao,
           tc.nu_identificador AS tipo_consulta,
           coalesce(o.st_conduta_tratamento_concluid, 0) AS tratamento_concluido
    FROM public.tb_fat_atendimento_odonto o
    JOIN public.tb_dim_tipo_consulta_odonto tc
      ON tc.co_seq_dim_tipo_cnsulta_odonto = o.co_dim_tipo_consulta
    JOIN public.tb_dim_cbo cbo
      ON cbo.co_seq_dim_cbo = o.co_dim_cbo_1
    JOIN public.tb_dim_municipio m
      ON m.co_seq_dim_municipio = o.co_dim_municipio
    LEFT JOIN public.tb_dim_equipe e
      ON e.co_seq_dim_equipe = o.co_dim_equipe_1
    WHERE o.dt_inicial_atendimento >= date_trunc('month', CURRENT_DATE)
      AND o.dt_inicial_atendimento < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      AND replace(cbo.nu_cbo, '-', '') IN ('223208', '223293', '223272')
      AND m.co_ibge = {{MUNICIPALITY_IBGE}}::varchar
      AND o.nu_cns IS NOT NULL
      AND trim(o.nu_cns) <> ''
)
SELECT am.competencia,
       am.nu_ine,
       coalesce(am.no_equipe, 'SEM EQUIPE IDENTIFICADA') AS equipe,
       COUNT(DISTINCT CASE WHEN am.tipo_consulta = '1' THEN am.cidadao END) AS pessoas_primeira_consulta,
       COUNT(DISTINCT CASE WHEN am.tratamento_concluido = 1 THEN am.cidadao END) AS pessoas_tratamento_concluido,
       ROUND(
         COUNT(DISTINCT CASE WHEN am.tratamento_concluido = 1 THEN am.cidadao END)::numeric
         / NULLIF(COUNT(DISTINCT CASE WHEN am.tipo_consulta = '1' THEN am.cidadao END), 0) * 100,
         2
       ) AS perc_tratamento_concluido
FROM atendimentos_mes am
GROUP BY am.competencia, am.nu_ine, am.no_equipe
ORDER BY perc_tratamento_concluido DESC NULLS LAST, pessoas_primeira_consulta DESC;
