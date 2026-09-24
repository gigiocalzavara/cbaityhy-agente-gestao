-- C3 · Cuidado na gestação e puerpério
-- Nota Metodológica C3/SAPS/MS, versão assinada em 22/06/2026.
-- Prévia local calculada exclusivamente com registros disponíveis no PEC.
WITH gestacoes_identificadas AS MATERIALIZED (
  SELECT DISTINCT ON (a.co_fat_cidadao_pec)
    a.co_fat_cidadao_pec AS cid,
    COALESCE(dum.dt_registro::date,
      (a.dt_inicial_atendimento::date - (NULLIF(a.nu_idade_gestacional_semanas, 0) * 7))::date
    ) AS inicio_gestacao
  FROM public.tb_fat_atendimento_individual a
  LEFT JOIN public.tb_dim_tempo dum ON dum.co_seq_dim_tempo = a.co_dim_tempo_dum
  WHERE a.co_fat_cidadao_pec IS NOT NULL
    AND a.dt_inicial_atendimento >= CURRENT_DATE - INTERVAL '336 days'
    AND (
      POSITION('|W78|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
      OR POSITION('|W79|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
      OR POSITION('|W84|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
      OR POSITION('Z34' IN COALESCE(a.ds_filtro_cids,'')) > 0
      OR POSITION('Z35' IN COALESCE(a.ds_filtro_cids,'')) > 0
      OR a.co_dim_tempo_dum IS NOT NULL
      OR COALESCE(a.nu_idade_gestacional_semanas, 0) > 0
    )
    AND COALESCE(dum.dt_registro::date,
      (a.dt_inicial_atendimento::date - (NULLIF(a.nu_idade_gestacional_semanas, 0) * 7))::date
    ) BETWEEN CURRENT_DATE - 336 AND CURRENT_DATE
  ORDER BY a.co_fat_cidadao_pec,
    COALESCE(dum.dt_registro::date,
      (a.dt_inicial_atendimento::date - (NULLIF(a.nu_idade_gestacional_semanas, 0) * 7))::date
    ) DESC,
    a.dt_inicial_atendimento DESC
),
puerperios_registrados AS MATERIALIZED (
  SELECT a.co_fat_cidadao_pec AS cid, MIN(a.dt_inicial_atendimento::date) AS referencia_puerperio
  FROM public.tb_fat_atendimento_individual a
  JOIN gestacoes_identificadas g ON g.cid = a.co_fat_cidadao_pec
  WHERE a.dt_inicial_atendimento >= CURRENT_DATE - INTERVAL '42 days'
    AND (
      POSITION('|W96|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
      OR POSITION('Z39' IN COALESCE(a.ds_filtro_cids,'')) > 0
    )
  GROUP BY a.co_fat_cidadao_pec
),
vinculo_atual AS MATERIALIZED (
  SELECT DISTINCT ON (v.co_cidadao)
    v.co_cidadao, NULLIF(v.nu_ine, '-') AS nu_ine
  FROM public.tb_cidadao_vinculacao_equipe v
  WHERE COALESCE(v.st_usar_cadastro_individual, 1) = 1
    AND COALESCE(v.st_saida_cadastro_obito, 0) = 0
    AND COALESCE(v.st_saida_cadastro_territorio, 0) = 0
  ORDER BY v.co_cidadao, v.dt_atualizacao_cadastro DESC NULLS LAST,
    v.co_seq_cidadao_vinculacao_eqp DESC
),
pessoas AS MATERIALIZED (
  SELECT g.cid, g.inicio_gestacao,
    CASE
      -- O fato local não expõe a data do desfecho. O primeiro registro
      -- puerperal delimita, de forma conservadora, o início do puerpério.
      WHEN p.referencia_puerperio IS NOT NULL THEN p.referencia_puerperio - 1
      ELSE (g.inicio_gestacao + 294)
    END::date AS fim_gestacao,
    p.referencia_puerperio IS NOT NULL
      OR CURRENT_DATE > (g.inicio_gestacao + 294) AS em_puerperio,
    va.nu_ine,
    COALESCE(e.no_equipe, 'SEM EQUIPE') AS equipe
  FROM gestacoes_identificadas g
  JOIN public.tb_fat_cidadao_pec fcp ON fcp.co_seq_fat_cidadao_pec = g.cid
  LEFT JOIN puerperios_registrados p ON p.cid = g.cid
  LEFT JOIN vinculo_atual va ON va.co_cidadao = fcp.co_cidadao
  LEFT JOIN public.tb_dim_equipe e ON e.nu_ine = va.nu_ine
  WHERE COALESCE(fcp.st_faleceu, 0) = 0
    AND COALESCE(fcp.st_deletar, 0) = 0
    AND va.nu_ine IS NOT NULL
    AND (
      CURRENT_DATE BETWEEN g.inicio_gestacao AND g.inicio_gestacao + 294
      OR p.referencia_puerperio IS NOT NULL
      OR CURRENT_DATE BETWEEN g.inicio_gestacao + 295 AND g.inicio_gestacao + 336
    )
),
consultas AS MATERIALIZED (
  SELECT a.co_fat_cidadao_pec AS cid,
    MIN(t.dt_registro::date) FILTER (
      WHERE t.dt_registro::date <= p.fim_gestacao
        AND (POSITION('|W78|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
          OR POSITION('|W79|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
          OR POSITION('|W84|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
          OR POSITION('Z34' IN COALESCE(a.ds_filtro_cids,'')) > 0
          OR POSITION('Z35' IN COALESCE(a.ds_filtro_cids,'')) > 0)
    ) AS primeira_consulta,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) FILTER (
      WHERE t.dt_registro::date <= p.fim_gestacao
        AND (POSITION('|W78|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
          OR POSITION('|W79|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
          OR POSITION('|W84|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
          OR POSITION('Z34' IN COALESCE(a.ds_filtro_cids,'')) > 0
          OR POSITION('Z35' IN COALESCE(a.ds_filtro_cids,'')) > 0)
    ) AS consultas_gestacao,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) FILTER (
      WHERE p.em_puerperio AND t.dt_registro::date > p.fim_gestacao
      AND t.dt_registro::date <= p.fim_gestacao + 42
      AND (POSITION('|W96|' IN COALESCE(a.ds_filtro_ciaps,'')) > 0
        OR POSITION('Z39' IN COALESCE(a.ds_filtro_cids,'')) > 0)
    ) AS consultas_puerperio
  FROM public.tb_fat_atendimento_individual a
  JOIN pessoas p ON p.cid = a.co_fat_cidadao_pec
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo c1 ON c1.co_seq_dim_cbo = a.co_dim_cbo_1
  LEFT JOIN public.tb_dim_cbo c2 ON c2.co_seq_dim_cbo = a.co_dim_cbo_2
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao + 42
    AND (
      REPLACE(COALESCE(c1.nu_cbo,''),'-','') ~ '^(2231|2235|2251|2252|2253)'
      OR REPLACE(COALESCE(c2.nu_cbo,''),'-','') ~ '^(2231|2235|2251|2252|2253)'
    )
  GROUP BY a.co_fat_cidadao_pec
),
medicoes AS MATERIALIZED (
  SELECT cid,
    COUNT(DISTINCT dia) FILTER (WHERE tem_pa) AS afericoes_pa,
    COUNT(DISTINCT dia) FILTER (WHERE tem_peso_altura) AS antropometrias
  FROM (
    SELECT a.co_fat_cidadao_pec AS cid, t.dt_registro::date AS dia,
      (a.nu_pressao_sistolica IS NOT NULL AND a.nu_pressao_diastolica IS NOT NULL) AS tem_pa,
      (a.nu_peso IS NOT NULL AND a.nu_altura IS NOT NULL) AS tem_peso_altura
    FROM public.tb_fat_atendimento_individual a
    JOIN pessoas p ON p.cid = a.co_fat_cidadao_pec
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
    WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
    UNION ALL
    SELECT v.co_fat_cidadao_pec, t.dt_registro::date,
      v.nu_medicao_pressao_arterial IS NOT NULL,
      (v.nu_peso IS NOT NULL AND v.nu_altura IS NOT NULL)
    FROM public.tb_fat_visita_domiciliar v
    JOIN pessoas p ON p.cid = v.co_fat_cidadao_pec
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
    WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
  ) x
  GROUP BY cid
),
visitas AS MATERIALIZED (
  SELECT v.co_fat_cidadao_pec AS cid,
    COUNT(DISTINCT t.dt_registro::date) FILTER (
      WHERE t.dt_registro::date > q.primeira_consulta AND t.dt_registro::date <= p.fim_gestacao
    ) AS visitas_gestacao,
    COUNT(DISTINCT t.dt_registro::date) FILTER (
      WHERE p.em_puerperio AND t.dt_registro::date > p.fim_gestacao
        AND t.dt_registro::date <= p.fim_gestacao + 42
    ) AS visitas_puerperio
  FROM public.tb_fat_visita_domiciliar v
  JOIN pessoas p ON p.cid = v.co_fat_cidadao_pec
  LEFT JOIN consultas q ON q.cid = p.cid
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = v.co_dim_cbo
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao + 42
    AND REPLACE(COALESCE(cbo.nu_cbo,''),'-','') ~ '^(3222|515105)'
  GROUP BY v.co_fat_cidadao_pec
),
dtpa AS MATERIALIZED (
  SELECT v.co_fat_cidadao_pec AS cid, COUNT(*) AS registros
  FROM public.tb_fat_vacinacao v
  JOIN pessoas p ON p.cid = v.co_fat_cidadao_pec
  JOIN public.tb_fat_vacinacao_vacina vv ON vv.co_fat_vacinacao = v.co_seq_fat_vacinacao
  JOIN public.tb_dim_imunobiologico i ON i.co_seq_dim_imunobiologico = vv.co_dim_imunobiologico
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = vv.co_dim_tempo_vacina_aplicada
  WHERE NULLIF(regexp_replace(COALESCE(i.nu_identificador::text,''), '[^0-9]', '', 'g'),'')::int = 57
    AND t.dt_registro::date BETWEEN p.inicio_gestacao + 140 AND p.fim_gestacao
  GROUP BY v.co_fat_cidadao_pec
),
exames AS MATERIALIZED (
  SELECT cid,
    BOOL_OR(dia <= inicio_gestacao + 97 AND grupo = 'HIV') AS hiv_t1,
    BOOL_OR(dia <= inicio_gestacao + 97 AND grupo = 'SIFILIS') AS sifilis_t1,
    BOOL_OR(dia <= inicio_gestacao + 97 AND grupo = 'HEPB') AS hepb_t1,
    BOOL_OR(dia <= inicio_gestacao + 97 AND grupo = 'HEPC') AS hepc_t1,
    BOOL_OR(dia BETWEEN inicio_gestacao + 196 AND fim_gestacao AND grupo = 'HIV') AS hiv_t3,
    BOOL_OR(dia BETWEEN inicio_gestacao + 196 AND fim_gestacao AND grupo = 'SIFILIS') AS sifilis_t3
  FROM (
    SELECT a.co_fat_cidadao_pec AS cid, p.inicio_gestacao, p.fim_gestacao,
      t.dt_registro::date AS dia,
      CASE
        WHEN d.codigo ~ '(0214010040|0214010279|0214010058|0213010780|0213010500|0202030300)' THEN 'HIV'
        WHEN d.codigo ~ '(0214010074|0214010082|0214010252|0202031098|0202031110|0202031179)' THEN 'SIFILIS'
        WHEN d.codigo ~ '(0214010104|0214010236|0202030784|0202030970|0213010208)' THEN 'HEPB'
        WHEN d.codigo ~ '(0214010090|0214010309|0202030059|0202030679)' THEN 'HEPC'
      END AS grupo
    FROM public.tb_fat_atendimento_individual a
    JOIN pessoas p ON p.cid = a.co_fat_cidadao_pec
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(a.ds_filtro_proced_avaliados,''), '[^0-9|]', '', 'g') AS codigo
    ) d
    WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
      AND d.codigo <> ''
  ) x
  WHERE grupo IS NOT NULL
  GROUP BY cid
),
saude_bucal AS MATERIALIZED (
  SELECT o.co_fat_cidadao_pec AS cid, COUNT(*) AS atividades
  FROM public.tb_fat_atendimento_odonto o
  JOIN pessoas p ON p.cid = o.co_fat_cidadao_pec
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = o.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo c1 ON c1.co_seq_dim_cbo = o.co_dim_cbo_1
  LEFT JOIN public.tb_dim_cbo c2 ON c2.co_seq_dim_cbo = o.co_dim_cbo_2
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
    AND (
      REPLACE(COALESCE(c1.nu_cbo,''),'-','') ~ '^(2232|3224)'
      OR REPLACE(COALESCE(c2.nu_cbo,''),'-','') ~ '^(2232|3224)'
    )
  GROUP BY o.co_fat_cidadao_pec
),
avaliacao AS (
  SELECT p.*,
    COALESCE((q.primeira_consulta <= p.inicio_gestacao + 83)::int, 0) AS a,
    (COALESCE(q.consultas_gestacao,0) >= 7)::int AS b,
    (COALESCE(m.afericoes_pa,0) >= 7)::int AS c,
    (COALESCE(m.antropometrias,0) >= 7)::int AS d,
    (COALESCE(v.visitas_gestacao,0) >= 3)::int AS e,
    (COALESCE(f.registros,0) >= 1)::int AS f,
    (COALESCE(x.hiv_t1,false) AND COALESCE(x.sifilis_t1,false)
      AND COALESCE(x.hepb_t1,false) AND COALESCE(x.hepc_t1,false))::int AS g,
    (COALESCE(x.hiv_t3,false) AND COALESCE(x.sifilis_t3,false))::int AS h,
    (COALESCE(q.consultas_puerperio,0) >= 1)::int AS i,
    (COALESCE(v.visitas_puerperio,0) >= 1)::int AS j,
    (COALESCE(sb.atividades,0) >= 1)::int AS k
  FROM pessoas p
  LEFT JOIN consultas q ON q.cid = p.cid
  LEFT JOIN medicoes m ON m.cid = p.cid
  LEFT JOIN visitas v ON v.cid = p.cid
  LEFT JOIN dtpa f ON f.cid = p.cid
  LEFT JOIN exames x ON x.cid = p.cid
  LEFT JOIN saude_bucal sb ON sb.cid = p.cid
)
SELECT nu_ine, equipe,
  SUM(a)::int AS pratica_a, SUM(b)::int AS pratica_b,
  SUM(c)::int AS pratica_c, SUM(d)::int AS pratica_d,
  SUM(e)::int AS pratica_e, SUM(f)::int AS pratica_f,
  SUM(g)::int AS pratica_g, SUM(h)::int AS pratica_h,
  SUM(i)::int AS pratica_i, SUM(j)::int AS pratica_j,
  SUM(k)::int AS pratica_k,
  SUM(10 * a + 9 * (b + c + d + e + f + g + h + i + j + k))::int AS numerador_pontos,
  COUNT(*)::int AS denominador_gestantes_puerperas,
  ROUND(SUM(10 * a + 9 * (b + c + d + e + f + g + h + i + j + k))::numeric / NULLIF(COUNT(*),0), 2) AS resultado_percentual
FROM avaliacao
GROUP BY nu_ine, equipe
ORDER BY resultado_percentual DESC NULLS LAST, equipe;
