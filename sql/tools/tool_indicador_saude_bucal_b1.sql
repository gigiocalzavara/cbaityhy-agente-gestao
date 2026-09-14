WITH primeiras_consultas AS (
  SELECT date_trunc('month', o.dt_inicial_atendimento)::date AS competencia,
         COALESCE(NULLIF(e1.nu_ine, '-'), NULLIF(e2.nu_ine, '-')) AS nu_ine,
         COALESCE(NULLIF(e1.no_equipe, ''), NULLIF(e2.no_equipe, ''), 'SEM EQUIPE IDENTIFICADA') AS equipe,
         COALESCE(NULLIF(trim(o.nu_cpf_cidadao), ''), NULLIF(trim(o.nu_cns), ''), o.co_fat_cidadao_pec::text) AS cidadao
  FROM public.tb_fat_atendimento_odonto o
  JOIN public.tb_dim_tipo_consulta_odonto tc
    ON tc.co_seq_dim_tipo_cnsulta_odonto = o.co_dim_tipo_consulta
  JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = o.co_dim_cbo_1
  JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = o.co_dim_profissional_1
  JOIN public.tb_dim_municipio m ON m.co_seq_dim_municipio = o.co_dim_municipio
  LEFT JOIN public.tb_dim_equipe e1 ON e1.co_seq_dim_equipe = o.co_dim_equipe_1
  LEFT JOIN public.tb_dim_equipe e2 ON e2.co_seq_dim_equipe = o.co_dim_equipe_2
  WHERE o.dt_inicial_atendimento >= date_trunc('month', CURRENT_DATE)
    AND o.dt_inicial_atendimento < date_trunc('month', CURRENT_DATE) + interval '1 month'
    AND tc.nu_identificador = '1'
    AND replace(cbo.nu_cbo, '-', '') IN ('223208','223293','223272')
    AND NULLIF(trim(p.nu_cns), '') IS NOT NULL
    AND m.co_ibge = {{MUNICIPALITY_IBGE}}::varchar
), producao AS (
  SELECT competencia, nu_ine, equipe,
         count(*) AS registros_primeira_consulta,
         count(DISTINCT cidadao) AS pessoas_primeira_consulta
  FROM primeiras_consultas
  GROUP BY competencia, nu_ine, equipe
), vinculo_atual AS (
  SELECT DISTINCT ON (v.co_cidadao)
         v.co_cidadao, NULLIF(v.nu_ine, '-') AS nu_ine,
         v.st_usar_cadastro_individual, v.st_saida_cadastro_obito,
         v.st_saida_cadastro_territorio
  FROM public.tb_cidadao_vinculacao_equipe v
  WHERE NULLIF(v.nu_ine, '-') IS NOT NULL
  ORDER BY v.co_cidadao, v.dt_atualizacao_cadastro DESC NULLS LAST, v.co_seq_cidadao_vinculacao_eqp DESC
), populacao AS (
  SELECT va.nu_ine, count(DISTINCT va.co_cidadao) AS pessoas_vinculadas
  FROM vinculo_atual va
  JOIN public.tb_cidadao c ON c.co_seq_cidadao = va.co_cidadao
  WHERE COALESCE(va.st_usar_cadastro_individual, 1) = 1
    AND COALESCE(va.st_saida_cadastro_obito, 0) = 0
    AND COALESCE(va.st_saida_cadastro_territorio, 0) = 0
    AND COALESCE(c.st_ativo, 1) = 1
    AND COALESCE(c.st_faleceu, 0) = 0
  GROUP BY va.nu_ine
), relacoes AS (
  SELECT ep.nu_ine AS equipe_ine, ev.nu_ine AS referencia_ine, ev.no_equipe AS referencia_equipe
  FROM public.tb_dim_vinculacao_equipes v
  JOIN public.tb_dim_equipe ep ON ep.co_seq_dim_equipe = v.co_dim_equipe_principal
  JOIN public.tb_dim_equipe ev ON ev.co_seq_dim_equipe = v.co_dim_equipe_vinculada
  UNION
  SELECT ev.nu_ine, ep.nu_ine, ep.no_equipe
  FROM public.tb_dim_vinculacao_equipes v
  JOIN public.tb_dim_equipe ep ON ep.co_seq_dim_equipe = v.co_dim_equipe_principal
  JOIN public.tb_dim_equipe ev ON ev.co_seq_dim_equipe = v.co_dim_equipe_vinculada
), candidatos AS (
  SELECT p.nu_ine AS equipe_ine, p.nu_ine AS referencia_ine, p.equipe AS referencia_equipe
  FROM producao p
  UNION
  SELECT p.nu_ine, r.referencia_ine, r.referencia_equipe
  FROM producao p JOIN relacoes r ON r.equipe_ine = p.nu_ine
), referencia_escolhida AS (
  SELECT equipe_ine, referencia_ine, referencia_equipe,
         COALESCE(pop.pessoas_vinculadas, 0) AS pessoas_vinculadas,
         row_number() OVER (
           PARTITION BY equipe_ine
           ORDER BY COALESCE(pop.pessoas_vinculadas, 0) DESC,
                    (referencia_ine = equipe_ine) DESC,
                    referencia_ine
         ) AS ordem
  FROM candidatos c
  LEFT JOIN populacao pop ON pop.nu_ine = c.referencia_ine
)
SELECT p.competencia, p.nu_ine, p.equipe,
       r.referencia_ine AS ine_equipe_referencia,
       r.referencia_equipe AS equipe_referencia,
       p.registros_primeira_consulta,
       p.pessoas_primeira_consulta,
       r.pessoas_vinculadas AS pessoas_vinculadas_referencia,
       round(p.pessoas_primeira_consulta::numeric / NULLIF(r.pessoas_vinculadas, 0) * 100, 2) AS perc_cobertura_b1
FROM producao p
LEFT JOIN referencia_escolhida r ON r.equipe_ine = p.nu_ine AND r.ordem = 1
ORDER BY perc_cobertura_b1 DESC NULLS LAST, p.equipe;
