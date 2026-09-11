WITH parametros AS (
    SELECT $1::varchar AS ine_filtro
),
fatos_relevantes AS (
    SELECT fat.nu_cpf_cidadao,
           fat.nu_cns,
           BOOL_OR(
               fat.ds_filtro_ciaps LIKE ANY (ARRAY['%|W78|%', '%|W79|%', '%|W84|%'])
               OR fat.ds_filtro_cids LIKE ANY (ARRAY['%Z34%', '%Z35%'])
           ) AS possui_gestacao,
           BOOL_OR(
               fat.dt_inicial_atendimento >= NOW() - INTERVAL '60 days'
               AND (fat.ds_filtro_ciaps LIKE '%|W96|%' OR fat.ds_filtro_cids LIKE '%Z39%')
           ) AS possui_puerperio_recente
    FROM public.tb_fat_atendimento_individual fat
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '294 days'
      AND (
          fat.ds_filtro_ciaps LIKE ANY (ARRAY['%|W78|%', '%|W79|%', '%|W84|%', '%|W96|%'])
          OR fat.ds_filtro_cids LIKE ANY (ARRAY['%Z34%', '%Z35%', '%Z39%'])
      )
      AND COALESCE(fat.nu_cpf_cidadao, fat.nu_cns) IS NOT NULL
    GROUP BY fat.nu_cpf_cidadao, fat.nu_cns
),
cidadaos_identificados AS (
    SELECT COALESCE(f.nu_cpf_cidadao, f.nu_cns) AS id_gestante,
           c.co_seq_cidadao
    FROM fatos_relevantes f
    JOIN public.tb_cidadao c ON c.nu_cpf = f.nu_cpf_cidadao
    WHERE f.possui_gestacao
      AND NOT f.possui_puerperio_recente
      AND f.nu_cpf_cidadao IS NOT NULL

    UNION

    SELECT f.nu_cns AS id_gestante,
           c.co_seq_cidadao
    FROM fatos_relevantes f
    JOIN public.tb_cidadao c ON c.nu_cns = f.nu_cns
    WHERE f.possui_gestacao
      AND NOT f.possui_puerperio_recente
      AND f.nu_cpf_cidadao IS NULL
      AND f.nu_cns IS NOT NULL
),
gestantes_ativas AS (
    SELECT ci.id_gestante,
           cve.nu_ine,
           eq.no_equipe
    FROM cidadaos_identificados ci
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = ci.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE COALESCE(cve.st_saida_cadastro_obito, 0) = 0
      AND COALESCE(cve.st_saida_cadastro_territorio, 0) = 0
)
SELECT COALESCE(g.no_equipe, 'TOTAL MUNICIPAL') AS equipe,
       COUNT(DISTINCT g.id_gestante) AS total_gestantes_ativas
FROM gestantes_ativas g
CROSS JOIN parametros param
WHERE param.ine_filtro IS NULL OR g.nu_ine = param.ine_filtro
GROUP BY GROUPING SETS ((g.no_equipe), ());
