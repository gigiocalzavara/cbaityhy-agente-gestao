WITH gestantes_ativas AS (
    SELECT 
        c.no_cidadao,
        concat(substr(c.nu_cpf, 1, 3), '.***.***-', substr(c.nu_cpf, 10, 2)) AS cpf_protegido,
        coalesce(c.nu_telefone_celular, c.nu_telefone_contato, 'Sem telefone') AS telefone,
        eq.no_equipe AS equipe,
        MAX(fat.dt_inicial_atendimento) AS dt_ultima_consulta,
        MAX(CASE WHEN coalesce(fat.nu_idade_gestacional_semanas, 0) > 0 THEN fat.nu_idade_gestacional_semanas END) AS ig_registrada,
        MAX(CASE WHEN coalesce(fat.nu_idade_gestacional_semanas, 0) > 0 THEN fat.dt_inicial_atendimento END) AS dt_registro_ig
    FROM public.tb_fat_atendimento_individual fat
    JOIN public.tb_cidadao c ON (c.nu_cpf = fat.nu_cpf_cidadao OR c.nu_cns = fat.nu_cns)
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE fat.dt_inicial_atendimento >= NOW() - INTERVAL '294 days'
      AND (
          fat.ds_filtro_ciaps LIKE '%|W78|%' OR fat.ds_filtro_ciaps LIKE '%|W79|%' 
          OR fat.ds_filtro_ciaps LIKE '%|W84|%' OR fat.ds_filtro_cids LIKE '%Z34%' 
          OR fat.ds_filtro_cids LIKE '%Z35%' OR fat.st_gestante = 1
      )
      AND coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
    GROUP BY c.no_cidadao, c.nu_cpf, c.nu_telefone_celular, c.nu_telefone_contato, eq.no_equipe
)
SELECT ga.no_cidadao AS gestante,
       ga.cpf_protegido,
       ga.telefone,
       coalesce(ga.equipe, 'SEM EQUIPE') AS equipe,
       to_char(ga.dt_ultima_consulta, 'DD/MM/YYYY') AS data_ultima_consulta,
       date_part('day', NOW() - ga.dt_ultima_consulta) AS dias_sem_consulta,
       CASE WHEN ga.ig_registrada IS NOT NULL THEN
            concat(round(ga.ig_registrada + (date_part('day', NOW() - ga.dt_registro_ig) / 7.0)), ' semanas')
            ELSE 'Não informada' END AS idade_gestacional_estimada
FROM gestantes_ativas ga
WHERE ga.dt_ultima_consulta < NOW() - INTERVAL '30 days'
ORDER BY dias_sem_consulta DESC
LIMIT 15;
