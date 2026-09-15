WITH cidadaos AS (
  SELECT c.co_seq_cidadao, c.no_cidadao AS nome, c.no_social AS nome_social,
         c.nu_cpf AS cpf, c.nu_cns AS cns, c.dt_nascimento AS nascimento,
         c.no_mae AS nome_mae,
         CASE WHEN COALESCE(c.st_faleceu,0)=1 OR c.dt_obito IS NOT NULL THEN 'Óbito registrado'
              WHEN COALESCE(c.st_ativo,1)=1 AND COALESCE(c.st_ativo_para_exibicao,1)=1 THEN 'Ativo' ELSE 'Inativo' END AS situacao
  FROM public.tb_cidadao c
  WHERE COALESCE(c.no_cidadao_filtro, lower(c.no_cidadao)) LIKE '%' || lower($1::varchar) || '%'
  ORDER BY CASE WHEN lower(c.no_cidadao)=lower($1::varchar) THEN 0 ELSE 1 END, c.no_cidadao
  LIMIT 10
), vinculo AS (
  SELECT DISTINCT ON (v.co_cidadao) v.co_cidadao, v.nu_ine AS ine, e.no_equipe AS equipe,
         v.dt_atualizacao_cadastro AS cadastro_atualizado_em
  FROM public.tb_cidadao_vinculacao_equipe v
  LEFT JOIN public.tb_equipe e ON e.nu_ine=v.nu_ine
  JOIN cidadaos c ON c.co_seq_cidadao=v.co_cidadao
  ORDER BY v.co_cidadao, v.dt_atualizacao_cadastro DESC NULLS LAST
), historico AS (
  SELECT c.co_seq_cidadao,
         COUNT(a.*) AS total_atendimentos,
         COUNT(a.*) FILTER (WHERE a.dt_inicial_atendimento >= date_trunc('month',CURRENT_DATE)) AS atendimentos_mes,
         MAX(a.dt_inicial_atendimento)::date AS ultimo_atendimento,
         MAX(a.dt_inicial_atendimento) FILTER (WHERE COALESCE(a.nu_pressao_sistolica,0)>0)::date AS ultima_pa
  FROM cidadaos c
  LEFT JOIN public.tb_fat_atendimento_individual a
    ON (NULLIF(c.cpf,'') IS NOT NULL AND a.nu_cpf_cidadao=c.cpf)
    OR (NULLIF(c.cns,'') IS NOT NULL AND a.nu_cns=c.cns)
  GROUP BY c.co_seq_cidadao
)
SELECT c.nome, c.nome_social, c.cpf, c.cns, c.nascimento, c.nome_mae, c.situacao,
       v.ine, COALESCE(v.equipe,'SEM EQUIPE VINCULADA') AS equipe, v.cadastro_atualizado_em,
       h.total_atendimentos, h.atendimentos_mes, h.ultimo_atendimento, h.ultima_pa
FROM cidadaos c
LEFT JOIN vinculo v ON v.co_cidadao=c.co_seq_cidadao
LEFT JOIN historico h ON h.co_seq_cidadao=c.co_seq_cidadao
ORDER BY CASE WHEN lower(c.nome)=lower($1::varchar) THEN 0 ELSE 1 END, c.nome;
