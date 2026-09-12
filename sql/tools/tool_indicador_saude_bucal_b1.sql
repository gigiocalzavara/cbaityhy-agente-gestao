WITH primeiras_consultas AS (
    SELECT e.nu_ine,
           e.no_equipe,
           date_trunc('month', o.dt_inicial_atendimento)::date AS competencia,
           trim(o.nu_cns) AS cidadao
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
      AND tc.nu_identificador = '1'
      AND replace(cbo.nu_cbo, '-', '') IN ('223208', '223293', '223272')
      AND m.co_ibge = {{MUNICIPALITY_IBGE}}::varchar
      AND o.nu_cns IS NOT NULL
      AND trim(o.nu_cns) <> ''
)
SELECT pc.competencia,
       pc.nu_ine,
       coalesce(pc.no_equipe, 'SEM EQUIPE IDENTIFICADA') AS equipe,
       COUNT(*) AS registros_primeira_consulta,
       COUNT(DISTINCT pc.cidadao) AS pessoas_primeira_consulta,
       NULL::bigint AS pessoas_vinculadas_referencia,
       NULL::numeric AS perc_cobertura_b1
FROM primeiras_consultas pc
GROUP BY pc.competencia, pc.nu_ine, pc.no_equipe
ORDER BY pessoas_primeira_consulta DESC, equipe;
