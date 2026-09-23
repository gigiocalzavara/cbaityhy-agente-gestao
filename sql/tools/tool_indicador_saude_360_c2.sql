WITH criancas AS (
  SELECT DISTINCT ON (c.co_seq_fat_cidadao_pec)
    c.co_seq_fat_cidadao_pec AS cid,
    c.nu_cpf_cidadao,
    c.nu_cns,
    nasc.dt_registro::date AS nascimento,
    e.nu_ine,
    COALESCE(e.no_equipe, 'SEM EQUIPE') AS equipe
  FROM public.tb_fat_cidadao_pec c
  JOIN public.tb_dim_tempo nasc ON nasc.co_seq_dim_tempo = c.co_dim_tempo_nascimento
  LEFT JOIN public.tb_dim_equipe e ON e.co_seq_dim_equipe = c.co_dim_equipe_vinc
  WHERE COALESCE(c.st_faleceu, 0) = 0
    AND COALESCE(c.st_deletar, 0) = 0
    AND nasc.dt_registro > CURRENT_DATE - INTERVAL '2 years'
    AND nasc.dt_registro <= CURRENT_DATE
    AND e.nu_ine IS NOT NULL
  ORDER BY c.co_seq_fat_cidadao_pec
),
consultas AS (
  SELECT a.co_fat_cidadao_pec AS cid,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) FILTER (
      WHERE t.dt_registro::date BETWEEN c.nascimento AND c.nascimento + 30
    ) AS consultas_30d,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) AS consultas_2a
  FROM public.tb_fat_atendimento_individual a
  JOIN criancas c ON c.cid = a.co_fat_cidadao_pec
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo cbo1 ON cbo1.co_seq_dim_cbo = a.co_dim_cbo_1
  LEFT JOIN public.tb_dim_cbo cbo2 ON cbo2.co_seq_dim_cbo = a.co_dim_cbo_2
  WHERE t.dt_registro::date BETWEEN c.nascimento AND LEAST(CURRENT_DATE, (c.nascimento + INTERVAL '2 years')::date)
    AND (
      COALESCE(cbo1.nu_cbo,'') ~ '^(2235|2231|2251|2252|2253)'
      OR COALESCE(cbo2.nu_cbo,'') ~ '^(2235|2231|2251|2252|2253)'
    )
  GROUP BY a.co_fat_cidadao_pec
),
antropometria AS (
  SELECT x.cid, COUNT(DISTINCT x.dia) AS registros
  FROM (
    SELECT a.co_fat_cidadao_pec AS cid, t.dt_registro::date AS dia
    FROM public.tb_fat_atendimento_individual a
    JOIN criancas c ON c.cid = a.co_fat_cidadao_pec
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
    WHERE a.nu_peso IS NOT NULL AND a.nu_altura IS NOT NULL
      AND t.dt_registro::date BETWEEN c.nascimento AND LEAST(CURRENT_DATE, (c.nascimento + INTERVAL '2 years')::date)
    UNION
    SELECT v.co_fat_cidadao_pec AS cid, t.dt_registro::date AS dia
    FROM public.tb_fat_visita_domiciliar v
    JOIN criancas c ON c.cid = v.co_fat_cidadao_pec
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
    WHERE v.nu_peso IS NOT NULL AND v.nu_altura IS NOT NULL
      AND t.dt_registro::date BETWEEN c.nascimento AND LEAST(CURRENT_DATE, (c.nascimento + INTERVAL '2 years')::date)
  ) x GROUP BY x.cid
),
visitas AS (
  SELECT v.co_fat_cidadao_pec AS cid,
    COUNT(DISTINCT t.dt_registro::date) FILTER (
      WHERE t.dt_registro::date BETWEEN c.nascimento AND c.nascimento + 30
    ) AS visita_30d,
    COUNT(DISTINCT t.dt_registro::date) FILTER (
      WHERE t.dt_registro::date > c.nascimento + 30
        AND t.dt_registro::date <= c.nascimento + INTERVAL '6 months'
    ) AS visita_6m
  FROM public.tb_fat_visita_domiciliar v
  JOIN criancas c ON c.cid = v.co_fat_cidadao_pec
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = v.co_dim_cbo
  WHERE COALESCE(cbo.nu_cbo,'') IN ('515105','322255')
    AND (COALESCE(v.st_acomp_recem_nascido,0) = 1 OR COALESCE(v.st_acomp_crianca,0) = 1)
  GROUP BY v.co_fat_cidadao_pec
),
vacinas AS (
  SELECT v.co_fat_cidadao_pec AS cid,
    COUNT(DISTINCT v.co_seq_fat_vacinacao) FILTER (
      WHERE UPPER(COALESCE(v.ds_filtro_imunobiologico,'')) LIKE ANY (ARRAY['%PENTA%','%DTP%','%HEXA%'])
    ) AS dtp_hb_hib,
    COUNT(DISTINCT v.co_seq_fat_vacinacao) FILTER (
      WHERE UPPER(COALESCE(v.ds_filtro_imunobiologico,'')) LIKE ANY (ARRAY['%VIP%','%POLIO%'])
    ) AS polio,
    COUNT(DISTINCT v.co_seq_fat_vacinacao) FILTER (
      WHERE UPPER(COALESCE(v.ds_filtro_imunobiologico,'')) LIKE ANY (ARRAY['%PNEUMO%'])
    ) AS pneumo,
    COUNT(DISTINCT v.co_seq_fat_vacinacao) FILTER (
      WHERE UPPER(COALESCE(v.ds_filtro_imunobiologico,'')) LIKE ANY (ARRAY['%TRIPLICE VIRAL%','%TRÍPLICE VIRAL%','%TETRA VIRAL%','%SCR%'])
    ) AS triplice_viral
  FROM public.tb_fat_vacinacao v
  JOIN criancas c ON c.cid = v.co_fat_cidadao_pec
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
  WHERE t.dt_registro::date BETWEEN c.nascimento AND LEAST(CURRENT_DATE, (c.nascimento + INTERVAL '2 years')::date)
  GROUP BY v.co_fat_cidadao_pec
),
avaliacao AS (
  SELECT c.*,
    (COALESCE(q.consultas_30d,0) >= 1)::int AS a,
    (COALESCE(q.consultas_2a,0) >= 9)::int AS b,
    (COALESCE(an.registros,0) >= 9)::int AS cc,
    (COALESCE(vd.visita_30d,0) >= 1 AND COALESCE(vd.visita_6m,0) >= 1)::int AS d,
    (COALESCE(va.dtp_hb_hib,0) >= 3 AND COALESCE(va.polio,0) >= 3
      AND COALESCE(va.pneumo,0) >= 3 AND COALESCE(va.triplice_viral,0) >= 1)::int AS e
  FROM criancas c
  LEFT JOIN consultas q ON q.cid = c.cid
  LEFT JOIN antropometria an ON an.cid = c.cid
  LEFT JOIN visitas vd ON vd.cid = c.cid
  LEFT JOIN vacinas va ON va.cid = c.cid
)
SELECT nu_ine, equipe,
  SUM(a)::int AS pratica_a,
  SUM(b)::int AS pratica_b,
  SUM(cc)::int AS pratica_c,
  SUM(d)::int AS pratica_d,
  SUM(e)::int AS pratica_e,
  (20 * SUM(a + b + cc + d + e))::int AS numerador_pontos,
  COUNT(*)::int AS denominador_criancas,
  ROUND((20 * SUM(a + b + cc + d + e))::numeric / NULLIF(COUNT(*),0), 2) AS resultado_percentual
FROM avaliacao
GROUP BY nu_ine, equipe
ORDER BY resultado_percentual DESC NULLS LAST, equipe;