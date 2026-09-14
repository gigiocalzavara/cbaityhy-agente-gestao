WITH parametros AS (
  SELECT $1::varchar AS ine_filtro
),
idosos AS MATERIALIZED (
  SELECT DISTINCT ON (c.co_seq_cidadao)
    c.co_seq_cidadao,
    c.no_cidadao,
    NULLIF(TRIM(c.nu_cpf), '') AS nu_cpf,
    DATE_PART('year', AGE(c.dt_nascimento))::integer AS idade,
    COALESCE(c.nu_telefone_celular, c.nu_telefone_contato, c.nu_telefone_residencial, 'Sem telefone') AS telefone,
    CONCAT_WS(', ', c.ds_logradouro, CASE WHEN c.st_sem_numero = 1 THEN 'S/N' ELSE c.nu_numero END, c.no_bairro) AS endereco,
    cve.nu_ine,
    eq.no_equipe
  FROM public.tb_cidadao c
  JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
  LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
  CROSS JOIN parametros p
  WHERE COALESCE(cve.st_saida_cadastro_obito, 0) = 0
    AND COALESCE(cve.st_saida_cadastro_territorio, 0) = 0
    AND c.dt_nascimento <= CURRENT_DATE - INTERVAL '60 years'
    AND NULLIF(TRIM(c.nu_cpf), '') IS NOT NULL
    AND (p.ine_filtro IS NULL OR cve.nu_ine = p.ine_filtro)
  ORDER BY c.co_seq_cidadao, cve.nu_ine NULLS LAST
),
ultimo_atendimento AS MATERIALIZED (
  SELECT i.co_seq_cidadao, MAX(fat.dt_inicial_atendimento) AS dt_ultimo_atendimento
  FROM idosos i
  LEFT JOIN public.tb_fat_atendimento_individual fat ON fat.nu_cpf_cidadao = i.nu_cpf
  GROUP BY i.co_seq_cidadao
)
SELECT
  i.no_cidadao AS nome_idoso,
  CONCAT(SUBSTR(i.nu_cpf, 1, 3), '.***.***-', SUBSTR(i.nu_cpf, 10, 2)) AS cpf_protegido,
  i.idade,
  i.telefone,
  COALESCE(NULLIF(TRIM(i.endereco), ''), 'Endereço não informado') AS endereco,
  i.nu_ine AS ine,
  COALESCE(i.no_equipe, 'SEM EQUIPE') AS equipe,
  CASE WHEN ua.dt_ultimo_atendimento IS NULL THEN 'Sem registro de atendimento no PEC'
    ELSE CONCAT('Último atendimento em: ', TO_CHAR(ua.dt_ultimo_atendimento, 'DD/MM/YYYY'))
  END AS historico_consulta,
  CASE WHEN ua.dt_ultimo_atendimento IS NULL THEN 'Prioridade Máxima: Idoso sem histórico clínico'
    ELSE CONCAT('Atraso: ', DATE_PART('day', CURRENT_TIMESTAMP - ua.dt_ultimo_atendimento)::integer, ' dias sem consulta')
  END AS status_busca_ativa
FROM idosos i
LEFT JOIN ultimo_atendimento ua ON ua.co_seq_cidadao = i.co_seq_cidadao
WHERE ua.dt_ultimo_atendimento IS NULL
   OR ua.dt_ultimo_atendimento < CURRENT_TIMESTAMP - INTERVAL '12 months'
ORDER BY CASE WHEN ua.dt_ultimo_atendimento IS NULL THEN 0 ELSE 1 END, i.idade DESC, i.no_cidadao;
