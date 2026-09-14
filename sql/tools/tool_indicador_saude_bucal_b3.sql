WITH procedimentos AS (
  SELECT date_trunc('month', o.dt_inicial_atendimento)::date AS competencia,
         COALESCE(NULLIF(e1.nu_ine, '-'), NULLIF(e2.nu_ine, '-')) AS nu_ine,
         COALESCE(NULLIF(e1.no_equipe, ''), NULLIF(e2.no_equipe, ''), 'SEM EQUIPE IDENTIFICADA') AS equipe,
         proc.codigo
  FROM public.tb_fat_atendimento_odonto o
  JOIN public.tb_dim_municipio m ON m.co_seq_dim_municipio = o.co_dim_municipio
  JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = o.co_dim_cbo_1
  JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = o.co_dim_profissional_1
  LEFT JOIN public.tb_dim_equipe e1 ON e1.co_seq_dim_equipe = o.co_dim_equipe_1
  LEFT JOIN public.tb_dim_equipe e2 ON e2.co_seq_dim_equipe = o.co_dim_equipe_2
  CROSS JOIN LATERAL unnest(string_to_array(trim(both '|' from COALESCE(o.ds_filtro_procedimentos, '')), '|')) proc(codigo)
  WHERE o.dt_inicial_atendimento >= date_trunc('month', CURRENT_DATE)
    AND o.dt_inicial_atendimento < date_trunc('month', CURRENT_DATE) + interval '1 month'
    AND m.co_ibge = {{MUNICIPALITY_IBGE}}::varchar
    AND replace(cbo.nu_cbo, '-', '') IN ('223208','223293','223272','322405','322425')
    AND NULLIF(trim(p.nu_cns), '') IS NOT NULL
), elegiveis AS (
  SELECT * FROM procedimentos WHERE codigo IN (
    '0101020058','0101020066','0101020074','0101020082','0101020090','0101020120',
    '0307010015','0307010031','0307010066','0307010074','0307010082','0307010104','0307010112','0307010120',
    '0307020010','0307020029','0307020070','0307030024','0307030040','0307030059','0307030067','0307030075','0307030083',
    '0307050017','0414020138','0414020146'
  )
)
SELECT competencia, nu_ine, equipe,
       count(*) FILTER (WHERE codigo IN ('0414020138','0414020146')) AS total_exodontias,
       count(*) AS total_procedimentos_elegiveis,
       round(count(*) FILTER (WHERE codigo IN ('0414020138','0414020146'))::numeric / NULLIF(count(*), 0) * 100, 2) AS perc_exodontia
FROM elegiveis GROUP BY competencia, nu_ine, equipe
ORDER BY perc_exodontia DESC NULLS LAST, equipe;
