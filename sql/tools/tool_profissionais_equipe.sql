WITH producao AS (
  SELECT COALESCE(NULLIF(e1.nu_ine, '-'), NULLIF(e2.nu_ine, '-')) AS ine,
         COALESCE(NULLIF(e1.no_equipe, ''), NULLIF(e2.no_equipe, '')) AS equipe,
         p.no_profissional AS profissional,
         cbo.nu_cbo AS cbo,
         cbo.no_cbo AS ocupacao,
         COUNT(*) AS atendimentos_12m,
         MAX(a.dt_inicial_atendimento)::date AS ultima_atividade
  FROM public.tb_fat_atendimento_individual a
  JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = a.co_dim_profissional_1
  JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = a.co_dim_cbo_1
  LEFT JOIN public.tb_dim_equipe e1 ON e1.co_seq_dim_equipe = a.co_dim_equipe_1
  LEFT JOIN public.tb_dim_equipe e2 ON e2.co_seq_dim_equipe = a.co_dim_equipe_2
  WHERE a.dt_inicial_atendimento >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY 1,2,3,4,5
)
SELECT ine, equipe, profissional, cbo, ocupacao, atendimentos_12m, ultima_atividade
FROM producao
WHERE lower(COALESCE(equipe, '')) LIKE '%' || lower($1::varchar) || '%'
   OR regexp_replace(COALESCE(ine, ''), '[^0-9]', '', 'g') = regexp_replace($1::varchar, '[^0-9]', '', 'g')
ORDER BY ocupacao, profissional;
