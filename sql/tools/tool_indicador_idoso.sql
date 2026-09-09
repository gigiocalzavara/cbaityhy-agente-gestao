WITH parametros AS (
    SELECT $1::varchar AS ine_filtro
),
denominador_idosos AS (
    SELECT c.co_seq_cidadao, c.no_cidadao, c.nu_cpf, cve.nu_ine, eq.no_equipe
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
      AND date_part('year', age(c.dt_nascimento)) >= 60
      AND c.nu_cpf IS NOT NULL AND trim(c.nu_cpf) <> ''
),
numerador_atendimentos_12m AS (
    SELECT DISTINCT fat.nu_cpf_cidadao
    FROM public.tb_fat_atendimento_individual fat
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '12 months'
      AND date_part('year', age(fat.dt_nascimento)) >= 60
      AND fat.nu_cpf_cidadao IS NOT NULL
      AND ((coalesce(fat.nu_pressao_sistolica, 0) > 0 AND coalesce(fat.nu_peso, 0) > 0)
        OR coalesce(fat.nu_perim_panturrilha, 0) > 0
        OR fat.ds_filtro_proced_solicitados LIKE '%0101010044%'
        OR fat.ds_filtro_proced_avaliados LIKE '%0101010044%'
        OR fat.ds_filtro_ciaps LIKE '%|A98|%')
)
SELECT di.nu_ine,
       coalesce(di.no_equipe, 'SEM EQUIPE') AS equipe,
       COUNT(DISTINCT di.nu_cpf) AS total_idosos_cadastrados,
       COUNT(DISTINCT na.nu_cpf_cidadao) AS idosos_com_avaliacao_anual,
       COUNT(DISTINCT di.nu_cpf) - COUNT(DISTINCT na.nu_cpf_cidadao) AS pendentes_busca_ativa,
       ROUND(COUNT(DISTINCT na.nu_cpf_cidadao)::numeric / NULLIF(COUNT(DISTINCT di.nu_cpf), 0) * 100, 2) AS perc_cobertura_idoso
FROM denominador_idosos di
LEFT JOIN numerador_atendimentos_12m na ON na.nu_cpf_cidadao = di.nu_cpf
CROSS JOIN parametros p
WHERE (p.ine_filtro IS NULL OR di.nu_ine = p.ine_filtro)
GROUP BY di.nu_ine, di.no_equipe
ORDER BY perc_cobertura_idoso DESC, total_idosos_cadastrados DESC;
