WITH criancas_1_ano AS (
    SELECT c.co_seq_cidadao, c.no_cidadao, c.nu_cpf, c.nu_cns, c.dt_nascimento, cve.nu_ine, eq.no_equipe
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
      AND c.dt_nascimento >= NOW() - INTERVAL '2 years'
      AND c.dt_nascimento < NOW() - INTERVAL '1 year'
),
doses_registradas AS (
    SELECT coalesce(v.nu_cpf_cidadao, v.nu_cns) AS id_cidadao,
           COUNT(DISTINCT CASE WHEN v.ds_filtro_imunobiologico LIKE '%PENTA%' OR v.ds_filtro_imunobiologico LIKE '%42%' THEN v.co_seq_fat_vacinacao END) AS doses_penta,
           COUNT(DISTINCT CASE WHEN v.ds_filtro_imunobiologico LIKE '%POLIO%' OR v.ds_filtro_imunobiologico LIKE '%VIP%' OR v.ds_filtro_imunobiologico LIKE '%22%' THEN v.co_seq_fat_vacinacao END) AS doses_vip
    FROM public.tb_fat_vacinacao v
    WHERE v.dt_inicial_atendimento >= NOW() - INTERVAL '2 years'
    GROUP BY coalesce(v.nu_cpf_cidadao, v.nu_cns)
)
SELECT cr.nu_ine,
       coalesce(cr.no_equipe, 'SEM EQUIPE') AS equipe,
       COUNT(DISTINCT cr.co_seq_cidadao) AS total_criancas_elegiveis,
       COUNT(DISTINCT CASE WHEN dr.doses_penta >= 3 AND dr.doses_vip >= 3 THEN cr.co_seq_cidadao END) AS com_esquema_completo,
       COUNT(DISTINCT CASE WHEN coalesce(dr.doses_penta, 0) = 0 AND coalesce(dr.doses_vip, 0) = 0 THEN cr.co_seq_cidadao END) AS zero_doses_no_pec,
       ROUND(COUNT(DISTINCT CASE WHEN dr.doses_penta >= 3 AND dr.doses_vip >= 3 THEN cr.co_seq_cidadao END)::numeric / NULLIF(COUNT(DISTINCT cr.co_seq_cidadao), 0) * 100, 2) AS perc_cobertura_vacinal
FROM criancas_1_ano cr
LEFT JOIN doses_registradas dr ON (dr.id_cidadao = cr.nu_cpf OR dr.id_cidadao = cr.nu_cns)
GROUP BY cr.nu_ine, cr.no_equipe
ORDER BY perc_cobertura_vacinal DESC, total_criancas_elegiveis DESC;
