WITH parametros AS (
    SELECT $1::varchar AS ine_filtro
),
gestacoes_recentes AS (
    SELECT coalesce(fat.nu_cpf_cidadao, fat.nu_cns) AS id_gestante,
           cve.nu_ine,
           eq.no_equipe,
           MAX(fat.dt_inicial_atendimento) AS dt_ultima_consulta_prenatal
    FROM public.tb_fat_atendimento_individual fat
    JOIN public.tb_cidadao c ON (c.nu_cpf = fat.nu_cpf_cidadao OR c.nu_cns = fat.nu_cns)
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '294 days'
      AND (fat.ds_filtro_ciaps LIKE '%|W78|%' OR fat.ds_filtro_ciaps LIKE '%|W79|%' OR fat.ds_filtro_ciaps LIKE '%|W84|%' OR fat.ds_filtro_cids LIKE '%Z34%' OR fat.ds_filtro_cids LIKE '%Z35%')
      AND coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
    GROUP BY coalesce(fat.nu_cpf_cidadao, fat.nu_cns), cve.nu_ine, eq.no_equipe
),
puerperio_registrado AS (
    SELECT DISTINCT coalesce(fat.nu_cpf_cidadao, fat.nu_cns) AS id_gestante
    FROM public.tb_fat_atendimento_individual fat
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '60 days'
      AND (fat.ds_filtro_ciaps LIKE '%|W96|%' OR fat.ds_filtro_cids LIKE '%Z39%')
)
SELECT coalesce(g.no_equipe, 'TOTAL MUNICIPAL') AS equipe,
       COUNT(DISTINCT g.id_gestante) AS total_gestantes_ativas
FROM gestacoes_recentes g
LEFT JOIN puerperio_registrado p ON p.id_gestante = g.id_gestante
CROSS JOIN parametros param
WHERE p.id_gestante IS NULL
  AND (param.ine_filtro IS NULL OR g.nu_ine = param.ine_filtro)
GROUP BY GROUPING SETS ((g.no_equipe), ());
