WITH atendimentos AS (
  SELECT
    date_trunc('month', a.dt_inicial_atendimento)::date AS competencia,
    COALESCE(NULLIF(e1.nu_ine, '-'), NULLIF(e2.nu_ine, '-')) AS nu_ine,
    COALESCE(NULLIF(e1.no_equipe, ''), NULLIF(e2.no_equipe, ''), 'SEM EQUIPE IDENTIFICADA') AS equipe,
    ta.nu_identificador AS tipo_demanda
  FROM public.tb_fat_atendimento_individual a
  JOIN public.tb_dim_municipio m ON m.co_seq_dim_municipio = a.co_dim_municipio
  JOIN public.tb_dim_tipo_atendimento ta ON ta.co_seq_dim_tipo_atendimento = a.co_dim_tipo_atendimento
  JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = a.co_dim_cbo_1
  JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = a.co_dim_profissional_1
  LEFT JOIN public.tb_dim_equipe e1 ON e1.co_seq_dim_equipe = a.co_dim_equipe_1
  LEFT JOIN public.tb_dim_equipe e2 ON e2.co_seq_dim_equipe = a.co_dim_equipe_2
  WHERE a.dt_inicial_atendimento >= date_trunc('month', CURRENT_DATE)
    AND a.dt_inicial_atendimento < date_trunc('month', CURRENT_DATE) + interval '1 month'
    AND m.co_ibge = {{MUNICIPALITY_IBGE}}::varchar
    AND replace(cbo.nu_cbo, '-', '') IN ('225142','225170','225130','225125','225250','223565','223505')
    AND NULLIF(trim(p.nu_cns), '') IS NOT NULL
    AND ta.nu_identificador IN ('1','2','4','5','6')
)
SELECT competencia, nu_ine, equipe,
       count(*) FILTER (WHERE tipo_demanda IN ('1','2')) AS atendimentos_programados,
       count(*) FILTER (WHERE tipo_demanda IN ('4','5','6')) AS atendimentos_espontaneos,
       count(*) AS total_atendimentos,
       round(count(*) FILTER (WHERE tipo_demanda IN ('1','2'))::numeric / NULLIF(count(*), 0) * 100, 2) AS perc_mais_acesso
FROM atendimentos
GROUP BY competencia, nu_ine, equipe
ORDER BY perc_mais_acesso DESC NULLS LAST, equipe;
