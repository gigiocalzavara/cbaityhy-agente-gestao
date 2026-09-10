WITH diabeticos_cadastrados AS (
    SELECT DISTINCT c.nu_cpf, cve.nu_ine, eq.no_equipe
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    JOIN public.tb_fat_atendimento_individual fat ON fat.nu_cpf_cidadao = c.nu_cpf
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
      AND (fat.ds_filtro_ciaps LIKE '%|T89|%' OR fat.ds_filtro_ciaps LIKE '%|T90|%' OR fat.ds_filtro_cids LIKE '%E10%' OR fat.ds_filtro_cids LIKE '%E11%')
      AND c.nu_cpf IS NOT NULL
),
hba1c_6m AS (
    SELECT DISTINCT fat.nu_cpf_cidadao
    FROM public.tb_fat_atendimento_individual fat
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '6 months'
      AND (fat.ds_filtro_proced_solicitados LIKE '%0202010503%' OR fat.ds_filtro_proced_avaliados LIKE '%0202010503%')
      AND fat.nu_cpf_cidadao IS NOT NULL
)
SELECT dc.nu_ine,
       coalesce(dc.no_equipe, 'SEM EQUIPE') AS equipe,
       COUNT(DISTINCT dc.nu_cpf) AS total_diabeticos_ativos,
       COUNT(DISTINCT h.nu_cpf_cidadao) AS diabeticos_com_hba1c_6m,
       COUNT(DISTINCT dc.nu_cpf) - COUNT(DISTINCT h.nu_cpf_cidadao) AS pendentes_busca_ativa,
       ROUND(COUNT(DISTINCT h.nu_cpf_cidadao)::numeric / NULLIF(COUNT(DISTINCT dc.nu_cpf), 0) * 100, 2) AS perc_cobertura_hba1c
FROM diabeticos_cadastrados dc
LEFT JOIN hba1c_6m h ON h.nu_cpf_cidadao = dc.nu_cpf
GROUP BY dc.nu_ine, dc.no_equipe
ORDER BY perc_cobertura_hba1c DESC, total_diabeticos_ativos DESC;
