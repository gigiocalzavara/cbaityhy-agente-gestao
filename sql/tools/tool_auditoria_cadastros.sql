WITH cadastros_ativos AS (
    SELECT c.co_seq_cidadao,
           c.nu_cpf,
           cve.nu_ine,
           eq.no_equipe,
           cve.dt_atualizacao_cadastro
    FROM public.tb_cidadao c
    JOIN public.tb_cidadao_vinculacao_equipe cve ON cve.co_cidadao = c.co_seq_cidadao
    LEFT JOIN public.tb_equipe eq ON eq.nu_ine = cve.nu_ine
    WHERE coalesce(cve.st_saida_cadastro_obito, 0) = 0
      AND coalesce(cve.st_saida_cadastro_territorio, 0) = 0
)
SELECT ca.nu_ine,
       coalesce(ca.no_equipe, 'SEM EQUIPE VINCULADA') AS equipe,
       COUNT(ca.co_seq_cidadao) AS total_cadastros,
       COUNT(CASE WHEN ca.nu_cpf IS NOT NULL AND trim(ca.nu_cpf) <> '' THEN 1 END) AS cadastros_com_cpf,
       COUNT(CASE WHEN ca.dt_atualizacao_cadastro >= NOW() - INTERVAL '24 months' THEN 1 END) AS cadastros_vigentes_24m,
       COUNT(CASE WHEN ca.dt_atualizacao_cadastro < NOW() - INTERVAL '24 months' OR ca.dt_atualizacao_cadastro IS NULL THEN 1 END) AS cadastros_expirados,
       ROUND(COUNT(CASE WHEN ca.dt_atualizacao_cadastro >= NOW() - INTERVAL '24 months' THEN 1 END)::numeric / NULLIF(COUNT(ca.co_seq_cidadao), 0) * 100, 2) AS perc_cadastros_vigentes
FROM cadastros_ativos ca
GROUP BY ca.nu_ine, ca.no_equipe
ORDER BY total_cadastros DESC;
