WITH base AS (
  SELECT
    COALESCE(NULLIF(TRIM(nu_ine_vinc_equipe), ''), '-') AS ine,
    COALESCE(NULLIF(TRIM(no_equipe_vinc_equipe), ''), 'SEM EQUIPE') AS equipe,
    COALESCE(NULLIF(TRIM(nu_cnes_vinc_equipe), ''), '-') AS cnes,
    COALESCE(co_fat_cidadao_pec, co_cidadao, co_seq_acomp_cidadaos_vinc) AS cidadao_id,
    COALESCE(st_usar_cadastro_individual, 0) AS usa_cadastro_individual,
    COALESCE(st_possui_fci, 0) AS possui_fci,
    COALESCE(st_possui_fcdt, 0) AS possui_fcdt
  FROM public.tb_acomp_cidadaos_vinculados
),
equipes AS (
  SELECT
    ine,
    equipe,
    cnes,
    COUNT(DISTINCT cidadao_id) AS populacao_cadastrada,
    COUNT(DISTINCT cidadao_id) FILTER (
      WHERE ine <> '-' AND usa_cadastro_individual = 1
    ) AS cidadaos_vinculados,
    COUNT(DISTINCT cidadao_id) FILTER (WHERE possui_fci = 1) AS cadastros_individuais,
    COUNT(DISTINCT cidadao_id) FILTER (WHERE possui_fcdt = 1) AS cadastros_domiciliares
  FROM base
  GROUP BY ine, equipe, cnes
)
SELECT
  ine,
  equipe,
  cnes,
  populacao_cadastrada,
  cidadaos_vinculados,
  cadastros_individuais,
  cadastros_domiciliares,
  ROUND(100.0 * cidadaos_vinculados / NULLIF(populacao_cadastrada, 0), 2) AS percentual_vinculado,
  ROUND(3.0 * cadastros_individuais / NULLIF(populacao_cadastrada, 0), 2) AS escore_cadastro,
  ROUND(7.0 * cidadaos_vinculados / NULLIF(populacao_cadastrada, 0), 2) AS escore_acompanhamento,
  ROUND(
    3.0 * cadastros_individuais / NULLIF(populacao_cadastrada, 0)
    + 7.0 * cidadaos_vinculados / NULLIF(populacao_cadastrada, 0),
    2
  ) AS escore_final
FROM equipes
ORDER BY CASE WHEN ine = '-' THEN 1 ELSE 0 END, equipe, ine;
