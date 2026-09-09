WITH parametros AS (
    SELECT $1::varchar AS termo_busca_logradouro,
           $2::varchar AS ine_filtro
)
SELECT c.ds_logradouro AS nome_logradouro,
       coalesce(c.no_bairro, 'Bairro não informado') AS bairro,
       coalesce(eq.no_equipe, 'SEM EQUIPE VINCULADA') AS equipe,
       COUNT(c.co_seq_cidadao) AS total_cidadaos_cadastrados,
       COUNT(CASE WHEN c.nu_cpf IS NOT NULL AND trim(c.nu_cpf) <> '' THEN 1 END) AS com_cpf_valido,
       COUNT(CASE WHEN date_part('year', age(c.dt_nascimento)) >= 60 THEN 1 END) AS idosos_na_rua,
       COUNT(CASE WHEN date_part('year', age(c.dt_nascimento)) < 2 THEN 1 END) AS bebes_menores_2a
FROM public.tb_cidadao c
JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
CROSS JOIN parametros p
WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
  AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
  AND c.ds_logradouro ILIKE concat('%', trim(p.termo_busca_logradouro), '%')
  AND (p.ine_filtro IS NULL OR cve.nu_ine = p.ine_filtro)
GROUP BY c.ds_logradouro, c.no_bairro, eq.no_equipe
ORDER BY total_cidadaos_cadastrados DESC;
