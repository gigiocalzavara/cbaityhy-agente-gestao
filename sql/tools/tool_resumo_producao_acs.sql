WITH periodo AS (
  SELECT make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, ((EXTRACT(MONTH FROM CURRENT_DATE)::int - 1) / 4) * 4 + 1, 1) AS inicio
), visitas AS (
  SELECT COALESCE(NULLIF(e.nu_ine, '-'), 'SEM INE') AS ine,
         COALESCE(NULLIF(e.no_equipe, ''), 'SEM EQUIPE') AS equipe,
         COALESCE(NULLIF(p.no_profissional, ''), 'PROFISSIONAL NÃO IDENTIFICADO') AS profissional,
         COUNT(*) FILTER (WHERE t.dt_registro >= date_trunc('month', CURRENT_DATE)) AS visitas_mes,
         COUNT(*) FILTER (WHERE t.dt_registro >= pe.inicio) AS visitas_quadrimestre,
         COUNT(DISTINCT v.co_fat_cidadao_pec) FILTER (WHERE t.dt_registro >= date_trunc('month', CURRENT_DATE)) AS pessoas_visitadas_mes,
         MAX(t.dt_registro)::date AS ultima_visita
  FROM public.tb_fat_visita_domiciliar v
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
  JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = v.co_dim_profissional
  JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = v.co_dim_cbo
  LEFT JOIN public.tb_dim_equipe e ON e.co_seq_dim_equipe = v.co_dim_equipe
  CROSS JOIN periodo pe
  WHERE t.dt_registro >= pe.inicio
    AND replace(cbo.nu_cbo, '-', '') = '515105'
  GROUP BY 1,2,3
)
SELECT ine, equipe, profissional, visitas_mes, pessoas_visitadas_mes, visitas_quadrimestre, ultima_visita
FROM visitas
WHERE lower(equipe) LIKE '%' || lower($1::varchar) || '%'
   OR regexp_replace(ine, '[^0-9]', '', 'g') = regexp_replace($1::varchar, '[^0-9]', '', 'g')
ORDER BY visitas_mes DESC, profissional;
