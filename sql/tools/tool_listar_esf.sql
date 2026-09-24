WITH vinculadas AS (
  SELECT DISTINCT NULLIF(TRIM(cve.nu_ine), '') AS ine
  FROM public.tb_cidadao_vinculacao_equipe cve
  WHERE NULLIF(TRIM(cve.nu_ine), '') IS NOT NULL
    AND COALESCE(cve.st_saida_cadastro_obito, 0) = 0
    AND COALESCE(cve.st_saida_cadastro_territorio, 0) = 0
)
SELECT
  v.ine,
  COALESCE(NULLIF(TRIM(e.no_equipe), ''), 'ESF ' || v.ine) AS equipe
FROM vinculadas v
LEFT JOIN public.tb_equipe e
  ON NULLIF(TRIM(e.nu_ine), '') = v.ine
ORDER BY equipe, v.ine;
