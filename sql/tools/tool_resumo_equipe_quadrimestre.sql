WITH periodo AS (
  SELECT make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, ((EXTRACT(MONTH FROM CURRENT_DATE)::int - 1) / 4) * 4 + 1, 1) AS inicio
), equipe_alvo AS (
  SELECT e.co_seq_dim_equipe, e.nu_ine, e.no_equipe
  FROM public.tb_dim_equipe e
  WHERE lower(COALESCE(e.no_equipe, '')) LIKE '%' || lower($1::varchar) || '%'
     OR regexp_replace(COALESCE(e.nu_ine, ''), '[^0-9]', '', 'g') = regexp_replace($1::varchar, '[^0-9]', '', 'g')
), atendimentos AS (
  SELECT ea.nu_ine, ea.no_equipe AS equipe, COUNT(*) AS atendimentos,
         COUNT(DISTINCT COALESCE(NULLIF(a.nu_cpf_cidadao,''), NULLIF(a.nu_cns,''), a.co_fat_cidadao_pec::text)) AS pessoas_atendidas,
         COUNT(*) FILTER (WHERE a.ds_filtro_ciaps LIKE '%|K86|%' OR a.ds_filtro_ciaps LIKE '%|K87|%' OR a.ds_filtro_cids LIKE '%I10%') AS atendimentos_hipertensao,
         COUNT(*) FILTER (WHERE COALESCE(a.nu_pressao_sistolica,0) > 0) AS atendimentos_com_pa
  FROM public.tb_fat_atendimento_individual a
  JOIN equipe_alvo ea ON ea.co_seq_dim_equipe IN (a.co_dim_equipe_1, a.co_dim_equipe_2)
  CROSS JOIN periodo p
  WHERE a.dt_inicial_atendimento >= p.inicio
  GROUP BY ea.nu_ine, ea.no_equipe
), populacao AS (
  SELECT v.nu_ine, COUNT(DISTINCT v.co_cidadao) AS populacao_vinculada
  FROM public.tb_cidadao_vinculacao_equipe v
  WHERE COALESCE(v.st_saida_cadastro_obito,0)=0 AND COALESCE(v.st_saida_cadastro_territorio,0)=0
  GROUP BY v.nu_ine
)
SELECT a.nu_ine AS ine, a.equipe, p.inicio AS inicio_quadrimestre,
       (p.inicio + INTERVAL '4 months - 1 day')::date AS fim_quadrimestre,
       COALESCE(pop.populacao_vinculada,0) AS populacao_vinculada,
       a.atendimentos, a.pessoas_atendidas, a.atendimentos_hipertensao, a.atendimentos_com_pa,
       ROUND(100.0 * a.atendimentos_com_pa / NULLIF(a.atendimentos,0),2) AS percentual_atendimentos_com_pa
FROM atendimentos a CROSS JOIN periodo p
LEFT JOIN populacao pop ON pop.nu_ine = a.nu_ine
ORDER BY a.equipe;
