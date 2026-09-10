WITH hipertensos_cadastrados AS (
    SELECT DISTINCT c.nu_cpf, cve.nu_ine, eq.no_equipe
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    JOIN public.tb_fat_atendimento_individual fat ON fat.nu_cpf_cidadao = c.nu_cpf
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
      AND (fat.ds_filtro_ciaps LIKE '%|K86|%' OR fat.ds_filtro_ciaps LIKE '%|K87|%' OR fat.ds_filtro_cids LIKE '%I10%')
      AND c.nu_cpf IS NOT NULL
),
pa_aferida_6m AS (
    SELECT DISTINCT fat.nu_cpf_cidadao
    FROM public.tb_fat_atendimento_individual fat
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '6 months'
      AND coalesce(fat.nu_pressao_sistolica, 0) > 0
      AND fat.nu_cpf_cidadao IS NOT NULL
)
SELECT hc.nu_ine,
       coalesce(hc.no_equipe, 'SEM EQUIPE') AS equipe,
       COUNT(DISTINCT hc.nu_cpf) AS total_hipertensos_ativos,
       COUNT(DISTINCT pa.nu_cpf_cidadao) AS hipertensos_com_pa_6m,
       COUNT(DISTINCT hc.nu_cpf) - COUNT(DISTINCT pa.nu_cpf_cidadao) AS pendentes_busca_ativa,
       ROUND(COUNT(DISTINCT pa.nu_cpf_cidadao)::numeric / NULLIF(COUNT(DISTINCT hc.nu_cpf), 0) * 100, 2) AS perc_cobertura_pa
FROM hipertensos_cadastrados hc
LEFT JOIN pa_aferida_6m pa ON pa.nu_cpf_cidadao = hc.nu_cpf
GROUP BY hc.nu_ine, hc.no_equipe
ORDER BY perc_cobertura_pa DESC, total_hipertensos_ativos DESC;

