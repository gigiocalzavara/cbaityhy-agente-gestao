WITH denominador_mulheres AS (
    SELECT cve.nu_ine, eq.no_equipe, c.nu_cpf
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
      AND (c.no_sexo ILIKE 'f%' OR c.no_sexo ILIKE '%mulher%')
      AND date_part('year', age(c.dt_nascimento)) BETWEEN 25 AND 64
      AND c.nu_cpf IS NOT NULL AND trim(c.nu_cpf) <> ''
),
numerador_exames_36m AS (
    SELECT DISTINCT fat.nu_cpf_cidadao
    FROM public.tb_fat_atendimento_individual fat
    WHERE (
        fat.ds_filtro_proced_solicitados LIKE '%0203010086%'
        OR fat.ds_filtro_proced_avaliados LIKE '%0203010086%'
        OR fat.ds_filtro_proced_solicitados LIKE '%0203010019%'
        OR fat.ds_filtro_proced_avaliados LIKE '%0203010019%'
        OR fat.ds_filtro_ciaps LIKE '%|X85|%'
    )
    AND fat.dt_inicial_atendimento >= NOW() - INTERVAL '3 years'
    AND fat.nu_cpf_cidadao IS NOT NULL
)
SELECT dm.nu_ine,
       coalesce(dm.no_equipe, 'SEM EQUIPE') AS equipe,
       COUNT(DISTINCT dm.nu_cpf) AS total_mulheres_elegiveis,
       COUNT(DISTINCT ne.nu_cpf_cidadao) AS mulheres_com_preventivo_36m,
       COUNT(DISTINCT dm.nu_cpf) - COUNT(DISTINCT ne.nu_cpf_cidadao) AS pendentes_busca_ativa,
       ROUND(COUNT(DISTINCT ne.nu_cpf_cidadao)::numeric / NULLIF(COUNT(DISTINCT dm.nu_cpf), 0) * 100, 2) AS perc_cobertura_trienal
FROM denominador_mulheres dm
LEFT JOIN numerador_exames_36m ne ON ne.nu_cpf_cidadao = dm.nu_cpf
GROUP BY dm.nu_ine, dm.no_equipe
ORDER BY perc_cobertura_trienal DESC, total_mulheres_elegiveis DESC;
