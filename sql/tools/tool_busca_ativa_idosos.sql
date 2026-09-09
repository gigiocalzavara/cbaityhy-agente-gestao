WITH parametros AS (
    SELECT NULL::varchar AS ine_filtro
),
idosos_cadastrados AS (
    SELECT 
        c.co_seq_cidadao,
        c.no_cidadao,
        c.nu_cpf,
        date_part('year', age(c.dt_nascimento)) AS idade,
        coalesce(c.nu_telefone_celular, c.nu_telefone_contato, c.nu_telefone_residencial, 'Sem telefone') AS telefone,
        concat_ws(', ', c.ds_logradouro, CASE WHEN c.st_sem_numero = 1 THEN 'S/N' ELSE c.nu_numero END, c.no_bairro) AS endereco,
        cve.nu_ine,
        eq.no_equipe
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
      AND date_part('year', age(c.dt_nascimento)) >= 60
      AND c.nu_cpf IS NOT NULL AND trim(c.nu_cpf) <> ''
),
ultimo_atendimento_idoso AS (
    SELECT fat.nu_cpf_cidadao, MAX(fat.dt_inicial_atendimento) AS dt_ultimo_atendimento
    FROM public.tb_fat_atendimento_individual fat
    WHERE date_part('year', age(fat.dt_nascimento)) >= 60
      AND fat.nu_cpf_cidadao IS NOT NULL
    GROUP BY fat.nu_cpf_cidadao
)
SELECT ic.no_cidadao AS nome_idoso,
       concat(substr(ic.nu_cpf, 1, 3), '.***.***-', substr(ic.nu_cpf, 10, 2)) AS cpf_protegido,
       ic.idade,
       ic.telefone,
       coalesce(nullif(trim(ic.endereco), ''), 'Endereço não informado') AS endereco,
       ic.no_equipe,
       CASE WHEN uai.dt_ultimo_atendimento IS NULL THEN 'Sem registro de atendimento no PEC'
            ELSE concat('Último atendimento em: ', to_char(uai.dt_ultimo_atendimento, 'DD/MM/YYYY')) END AS historico_consulta,
       CASE WHEN uai.dt_ultimo_atendimento IS NULL THEN 'Prioridade Máxima: Idoso sem histórico clínico'
            ELSE concat('Atraso: ', date_part('day', NOW() - uai.dt_ultimo_atendimento), ' dias sem consulta') END AS status_busca_ativa
FROM idosos_cadastrados ic
LEFT JOIN ultimo_atendimento_idoso uai ON uai.nu_cpf_cidadao = ic.nu_cpf
CROSS JOIN parametros p
WHERE (p.ine_filtro IS NULL OR ic.nu_ine = p.ine_filtro)
  AND (uai.dt_ultimo_atendimento IS NULL OR uai.dt_ultimo_atendimento < NOW() - INTERVAL '12 months')
ORDER BY CASE WHEN uai.dt_ultimo_atendimento IS NULL THEN 0 ELSE 1 END, ic.idade DESC
LIMIT 15;
