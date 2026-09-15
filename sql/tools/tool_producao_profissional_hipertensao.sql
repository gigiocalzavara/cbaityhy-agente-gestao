WITH base AS (
  SELECT p.no_profissional AS profissional,
         cbo.no_cbo AS ocupacao,
         COALESCE(NULLIF(e1.nu_ine, '-'), NULLIF(e2.nu_ine, '-')) AS ine,
         COALESCE(NULLIF(e1.no_equipe, ''), NULLIF(e2.no_equipe, ''), 'SEM EQUIPE') AS equipe,
         a.nu_cpf_cidadao,
         a.dt_inicial_atendimento,
         (COALESCE(a.nu_pressao_sistolica, 0) > 0) AS pa_aferida
  FROM public.tb_fat_atendimento_individual a
  JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = a.co_dim_profissional_1
  JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = a.co_dim_cbo_1
  LEFT JOIN public.tb_dim_equipe e1 ON e1.co_seq_dim_equipe = a.co_dim_equipe_1
  LEFT JOIN public.tb_dim_equipe e2 ON e2.co_seq_dim_equipe = a.co_dim_equipe_2
  WHERE a.dt_inicial_atendimento >= date_trunc('month', CURRENT_DATE)
    AND (a.ds_filtro_ciaps LIKE '%|K86|%' OR a.ds_filtro_ciaps LIKE '%|K87|%' OR a.ds_filtro_cids LIKE '%I10%')
)
SELECT profissional, ocupacao, ine, equipe,
       COUNT(*) AS atendimentos_hipertensao_mes,
       COUNT(DISTINCT nu_cpf_cidadao) AS pessoas_hipertensas_atendidas,
       COUNT(*) FILTER (WHERE pa_aferida) AS atendimentos_com_pa,
       MAX(dt_inicial_atendimento)::date AS ultimo_atendimento
FROM base
WHERE lower(profissional) LIKE '%' || lower($1::varchar) || '%'
  AND ($2::varchar IS NULL OR lower(equipe) LIKE '%' || lower($2::varchar) || '%' OR regexp_replace(COALESCE(ine,''), '[^0-9]', '', 'g') = regexp_replace($2::varchar, '[^0-9]', '', 'g'))
GROUP BY profissional, ocupacao, ine, equipe
ORDER BY atendimentos_hipertensao_mes DESC;
