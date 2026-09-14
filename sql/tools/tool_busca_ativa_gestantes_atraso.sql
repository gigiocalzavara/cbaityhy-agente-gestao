WITH parametros AS (
  SELECT $1::varchar AS ine_filtro
),
eventos_gestacao AS MATERIALIZED (
  SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(fat.nu_cpf_cidadao), ''), NULLIF(TRIM(fat.nu_cns), '')))
    NULLIF(TRIM(fat.nu_cpf_cidadao), '') AS cpf,
    NULLIF(TRIM(fat.nu_cns), '') AS cns,
    fat.dt_inicial_atendimento AS dt_ultima_consulta,
    CASE WHEN COALESCE(fat.nu_idade_gestacional_semanas, 0) > 0 THEN fat.nu_idade_gestacional_semanas END AS ig_registrada
  FROM public.tb_fat_atendimento_individual fat
  WHERE fat.dt_inicial_atendimento >= CURRENT_DATE - INTERVAL '294 days'
    AND (NULLIF(TRIM(fat.nu_cpf_cidadao), '') IS NOT NULL OR NULLIF(TRIM(fat.nu_cns), '') IS NOT NULL)
    AND (
      POSITION('|W78|' IN COALESCE(fat.ds_filtro_ciaps, '')) > 0
      OR POSITION('|W79|' IN COALESCE(fat.ds_filtro_ciaps, '')) > 0
      OR POSITION('|W84|' IN COALESCE(fat.ds_filtro_ciaps, '')) > 0
      OR POSITION('Z34' IN COALESCE(fat.ds_filtro_cids, '')) > 0
      OR POSITION('Z35' IN COALESCE(fat.ds_filtro_cids, '')) > 0
    )
  ORDER BY COALESCE(NULLIF(TRIM(fat.nu_cpf_cidadao), ''), NULLIF(TRIM(fat.nu_cns), '')), fat.dt_inicial_atendimento DESC
),
cidadaos_identificados AS MATERIALIZED (
  SELECT
    eg.*,
    COALESCE(cpf_c.co_seq_cidadao, cns_c.co_seq_cidadao) AS co_seq_cidadao,
    COALESCE(cpf_c.no_cidadao, cns_c.no_cidadao) AS no_cidadao,
    COALESCE(cpf_c.nu_cpf, cns_c.nu_cpf) AS nu_cpf,
    COALESCE(cpf_c.nu_telefone_celular, cns_c.nu_telefone_celular, cpf_c.nu_telefone_contato, cns_c.nu_telefone_contato, 'Sem telefone') AS telefone
  FROM eventos_gestacao eg
  LEFT JOIN LATERAL (
    SELECT c.co_seq_cidadao, c.no_cidadao, c.nu_cpf, c.nu_telefone_celular, c.nu_telefone_contato
    FROM public.tb_cidadao c
    WHERE eg.cpf IS NOT NULL AND c.nu_cpf = eg.cpf
    ORDER BY COALESCE(c.st_ativo, 1) DESC, c.co_seq_cidadao DESC
    LIMIT 1
  ) cpf_c ON TRUE
  LEFT JOIN LATERAL (
    SELECT c.co_seq_cidadao, c.no_cidadao, c.nu_cpf, c.nu_telefone_celular, c.nu_telefone_contato
    FROM public.tb_cidadao c
    WHERE cpf_c.co_seq_cidadao IS NULL AND eg.cns IS NOT NULL AND c.nu_cns = eg.cns
    ORDER BY COALESCE(c.st_ativo, 1) DESC, c.co_seq_cidadao DESC
    LIMIT 1
  ) cns_c ON TRUE
)
SELECT
  ci.no_cidadao AS gestante,
  CASE WHEN ci.nu_cpf IS NOT NULL THEN CONCAT(SUBSTR(ci.nu_cpf, 1, 3), '.***.***-', SUBSTR(ci.nu_cpf, 10, 2)) ELSE 'CPF não informado' END AS cpf_protegido,
  ci.telefone,
  vinc.nu_ine AS ine,
  COALESCE(vinc.equipe, 'SEM EQUIPE') AS equipe,
  TO_CHAR(ci.dt_ultima_consulta, 'DD/MM/YYYY') AS data_ultima_consulta,
  DATE_PART('day', CURRENT_TIMESTAMP - ci.dt_ultima_consulta)::integer AS dias_sem_consulta,
  CASE WHEN ci.ig_registrada IS NOT NULL
    THEN CONCAT(ROUND(ci.ig_registrada + DATE_PART('day', CURRENT_TIMESTAMP - ci.dt_ultima_consulta) / 7.0), ' semanas')
    ELSE 'Não informada'
  END AS idade_gestacional_estimada
FROM cidadaos_identificados ci
LEFT JOIN LATERAL (
  SELECT cve.nu_ine, eq.no_equipe AS equipe
  FROM public.tb_cidadao_vinculacao_equipe cve
  LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
  WHERE cve.co_cidadao = ci.co_seq_cidadao
    AND COALESCE(cve.st_saida_cadastro_obito, 0) = 0
    AND COALESCE(cve.st_saida_cadastro_territorio, 0) = 0
  LIMIT 1
) vinc ON TRUE
CROSS JOIN parametros p
WHERE ci.co_seq_cidadao IS NOT NULL
  AND ci.dt_ultima_consulta < CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND (p.ine_filtro IS NULL OR vinc.nu_ine = p.ine_filtro)
ORDER BY dias_sem_consulta DESC, ci.no_cidadao;
