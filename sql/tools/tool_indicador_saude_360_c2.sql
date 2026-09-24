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
    -- C2 é restrito a eSF/eAP. A dimensão não expõe o tipo; validamos o INE
    -- contra tb_equipe (tp_equipe 70/76) para impedir ESB/eMulti no denominador.
    AND EXISTS (
      SELECT 1 FROM public.tb_equipe eq
      WHERE eq.nu_ine = e.nu_ine
        AND eq.tp_equipe IN (70,76)
        AND COALESCE(eq.st_ativo,1) = 1
    )
  ORDER BY c.co_seq_fat_cidadao_pec
),
consultas AS (
  SELECT a.co_fat_cidadao_pec AS cid,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) FILTER (
      WHERE t.dt_registro::date BETWEEN c.nascimento AND c.nascimento + 30
    ) AS consultas_30d,
    COUNT(DISTINCT t.dt_registro::date) AS consultas_2a
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
    -- Nota Metodológica C2 (24/06/2026): A e B exigem Problema/Condição Avaliada "Puericultura".
    -- No PEC, ao habilitar puericultura, são adicionados automaticamente CIAP A98 e CID Z00.1.
    AND (
      UPPER(COALESCE(a.ds_filtro_ciaps,'')) LIKE '%A98%'
      OR REPLACE(UPPER(COALESCE(a.ds_filtro_cids,'')),'.','') LIKE '%Z001%'
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
    LEFT JOIN public.tb_dim_cbo cbo1 ON cbo1.co_seq_dim_cbo = a.co_dim_cbo_1
    LEFT JOIN public.tb_dim_cbo cbo2 ON cbo2.co_seq_dim_cbo = a.co_dim_cbo_2
    WHERE a.nu_peso IS NOT NULL AND a.nu_altura IS NOT NULL
      AND (
        COALESCE(cbo1.nu_cbo,'') ~ '^(2231|2232|2234|2235|2236|2237|2238|2239|2241|2251|2252|2253|3222|515105)'
        OR COALESCE(cbo2.nu_cbo,'') ~ '^(2231|2232|2234|2235|2236|2237|2238|2239|2241|2251|2252|2253|3222|515105)'
      )
      AND t.dt_registro::date BETWEEN c.nascimento AND LEAST(CURRENT_DATE, (c.nascimento + INTERVAL '2 years')::date)
    UNION
    SELECT v.co_fat_cidadao_pec AS cid, t.dt_registro::date AS dia
    FROM public.tb_fat_visita_domiciliar v
    JOIN criancas c ON c.cid = v.co_fat_cidadao_pec
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
    LEFT JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = v.co_dim_cbo
    WHERE v.nu_peso IS NOT NULL AND v.nu_altura IS NOT NULL
      AND COALESCE(cbo.nu_cbo,'') IN ('515105','322255')
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
vacinas_eventos AS (
  SELECT
    v.co_fat_cidadao_pec AS cid,
    tv.dt_registro::date AS dia,
    NULLIF(regexp_replace(COALESCE(i.nu_identificador::text,''), '[^0-9]', '', 'g'),'')::int AS vacina
  FROM public.tb_fat_vacinacao v
  JOIN public.tb_fat_vacinacao_vacina vv ON vv.co_fat_vacinacao = v.co_seq_fat_vacinacao
  JOIN public.tb_dim_imunobiologico i ON i.co_seq_dim_imunobiologico = vv.co_dim_imunobiologico
  JOIN public.tb_dim_tempo tv ON tv.co_seq_dim_tempo = vv.co_dim_tempo_vacina_aplicada
  JOIN criancas c ON c.cid = v.co_fat_cidadao_pec
  WHERE tv.dt_registro::date BETWEEN c.nascimento AND LEAST(CURRENT_DATE, (c.nascimento + INTERVAL '2 years')::date)
),
vacinas AS (
  SELECT c.cid,
    (
      -- Difteria/tétano/coqueluche: 3 doses, intervalo mínimo de 30 dias.
      EXISTS (
        SELECT 1 FROM vacinas_eventos x1
        JOIN vacinas_eventos x2 ON x2.cid=x1.cid AND x2.dia>=x1.dia+30
        JOIN vacinas_eventos x3 ON x3.cid=x1.cid AND x3.dia>=x2.dia+30
        WHERE x1.cid=c.cid AND x1.vacina IN (29,39,42,43,46,47,58)
          AND x2.vacina IN (29,39,42,43,46,47,58) AND x3.vacina IN (29,39,42,43,46,47,58)
      )
      -- Hepatite B: 3 doses com componente HepB.
      AND EXISTS (
        SELECT 1 FROM vacinas_eventos x1
        JOIN vacinas_eventos x2 ON x2.cid=x1.cid AND x2.dia>=x1.dia+30
        JOIN vacinas_eventos x3 ON x3.cid=x1.cid AND x3.dia>=x2.dia+30
        WHERE x1.cid=c.cid AND x1.vacina IN (9,42,43)
          AND x2.vacina IN (9,42,43) AND x3.vacina IN (9,42,43)
      )
      -- Hib: 3 doses com componente Haemophilus influenzae b.
      AND EXISTS (
        SELECT 1 FROM vacinas_eventos x1
        JOIN vacinas_eventos x2 ON x2.cid=x1.cid AND x2.dia>=x1.dia+30
        JOIN vacinas_eventos x3 ON x3.cid=x1.cid AND x3.dia>=x2.dia+30
        WHERE x1.cid=c.cid AND x1.vacina IN (17,29,39,42,43)
          AND x2.vacina IN (17,29,39,42,43) AND x3.vacina IN (17,29,39,42,43)
      )
      -- VIP: 3 doses, intervalo mínimo de 30 dias.
      AND EXISTS (
        SELECT 1 FROM vacinas_eventos x1
        JOIN vacinas_eventos x2 ON x2.cid=x1.cid AND x2.dia>=x1.dia+30
        JOIN vacinas_eventos x3 ON x3.cid=x1.cid AND x3.dia>=x2.dia+30
        WHERE x1.cid=c.cid AND x1.vacina IN (22,29,43,58)
          AND x2.vacina IN (22,29,43,58) AND x3.vacina IN (22,29,43,58)
      )
      -- SCR/SCRV: 2 doses; doses antes de 12 meses não contam.
      AND (SELECT COUNT(DISTINCT x.dia) FROM vacinas_eventos x
           WHERE x.cid=c.cid AND x.vacina IN (24,56)
             AND x.dia >= (c.nascimento + INTERVAL '12 months')::date) >= 2
      -- Pneumocócica: 2 doses, intervalo mínimo de 30 dias.
      AND EXISTS (
        SELECT 1 FROM vacinas_eventos x1
        JOIN vacinas_eventos x2 ON x2.cid=x1.cid AND x2.dia>=x1.dia+30
        WHERE x1.cid=c.cid AND x1.vacina IN (26,59,106,107)
          AND x2.vacina IN (26,59,106,107)
      )
    )::int AS esquema_completo
  FROM criancas c
),
avaliacao AS (
  SELECT c.*,
    (COALESCE(q.consultas_30d,0) >= 1)::int AS a,
    (COALESCE(q.consultas_2a,0) >= 9)::int AS b,
    (COALESCE(an.registros,0) >= 9)::int AS cc,
    (COALESCE(vd.visita_30d,0) >= 1 AND COALESCE(vd.visita_6m,0) >= 1)::int AS d,
    COALESCE(va.esquema_completo,0)::int AS e
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