-- C3 · Cuidado na gestação e puerpério
-- Nota Metodológica C3/SAPS/MS, atualizada em 24/06/2026.
-- Prévia local: usa somente eventos identificados no PEC, deduplicados por CPF/CNS.
WITH parametros AS (SELECT $1::varchar AS ine_filtro),
identidades AS (
  SELECT f.co_seq_fat_cidadao_pec AS cid, f.co_cidadao,
    CASE
      WHEN length(regexp_replace(COALESCE(f.nu_cpf_cidadao,''), '[^0-9]', '', 'g')) = 11
        THEN 'CPF:' || regexp_replace(f.nu_cpf_cidadao, '[^0-9]', '', 'g')
      WHEN length(regexp_replace(COALESCE(f.nu_cns,''), '[^0-9]', '', 'g')) = 15
        THEN 'CNS:' || regexp_replace(f.nu_cns, '[^0-9]', '', 'g')
    END AS pessoa_id
  FROM public.tb_fat_cidadao_pec f
  WHERE COALESCE(f.st_faleceu, 0) = 0
    AND COALESCE(f.st_deletar, 0) = 0
),
eventos_gestacao AS (
  SELECT i.pessoa_id, a.co_fat_cidadao_pec AS cid,
    a.dt_inicial_atendimento::date AS dia,
    COALESCE(
      dum.dt_registro::date,
      (a.dt_inicial_atendimento::date - (NULLIF(a.nu_idade_gestacional_semanas, 0) * 7))::date
    ) AS inicio_gestacao
  FROM public.tb_fat_atendimento_individual a
  JOIN identidades i ON i.cid = a.co_fat_cidadao_pec AND i.pessoa_id IS NOT NULL
  LEFT JOIN public.tb_dim_tempo dum ON dum.co_seq_dim_tempo = a.co_dim_tempo_dum
  WHERE a.dt_inicial_atendimento >= CURRENT_DATE - INTERVAL '336 days'
    AND (
      COALESCE(a.ds_filtro_ciaps,'') ~ '\|(W03|W78|W79|W81|W84|W85)\|'
      OR replace(upper(COALESCE(a.ds_filtro_cids,'')),'.','') ~
        '\|(O10|O11|O12|O13|O14|O15|O16|O20|O21|O22|O23|O24|O25|O26|O28|O29|O30|O31|O32|O33|O34|O35|O36|O40|O41|O43|O44|O46|O47|O48|O752|O753|O98|O990|O991|O992|O993|O994|O995|O996|O997|Z321|Z33|Z34|Z35|Z36|Z640)'
    )
    AND COALESCE(
      dum.dt_registro::date,
      (a.dt_inicial_atendimento::date - (NULLIF(a.nu_idade_gestacional_semanas, 0) * 7))::date
    ) BETWEEN CURRENT_DATE - 336 AND CURRENT_DATE
),
episodios AS (
  SELECT DISTINCT ON (pessoa_id)
    pessoa_id, inicio_gestacao
  FROM eventos_gestacao
  ORDER BY pessoa_id, inicio_gestacao DESC, dia DESC
),
eventos_puerperio AS (
  SELECT pessoa_id, MIN(dia) AS primeiro_puerperio
  FROM (
    SELECT i.pessoa_id, a.dt_inicial_atendimento::date AS dia
    FROM public.tb_fat_atendimento_individual a
    JOIN identidades i ON i.cid = a.co_fat_cidadao_pec AND i.pessoa_id IS NOT NULL
    JOIN episodios ep ON ep.pessoa_id = i.pessoa_id
    WHERE a.dt_inicial_atendimento::date BETWEEN ep.inicio_gestacao AND ep.inicio_gestacao + 336
      AND (
        COALESCE(a.ds_filtro_ciaps,'') ~ '\|(48|49|P29|W18|W19|W70|W90|W91|W92|W93|W94|W95|W96)\|'
        OR replace(upper(COALESCE(a.ds_filtro_cids,'')),'.','') ~
          '\|(F53|M830|O152|O266|O722|O723|O85|O86|O87|O90|O91|O92|O94|Z370|Z371|Z372|Z373|Z374|Z375|Z376|Z377|Z379|Z38|Z39)'
        OR replace(COALESCE(a.ds_filtro_proced_avaliados,''),'.','') LIKE '%0301010129%'
      )
    UNION ALL
    SELECT i.pessoa_id, t.dt_registro::date
    FROM public.tb_fat_proced_atend_proced pr
    JOIN identidades i ON i.cid = pr.co_fat_cidadao_pec AND i.pessoa_id IS NOT NULL
    JOIN episodios ep ON ep.pessoa_id = i.pessoa_id
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = pr.co_dim_tempo
    JOIN public.tb_dim_procedimento dp ON dp.co_seq_dim_procedimento = pr.co_dim_procedimento
    WHERE t.dt_registro::date BETWEEN ep.inicio_gestacao AND ep.inicio_gestacao + 336
      AND regexp_replace(COALESCE(
        to_jsonb(dp)->>'nu_identificador',
        to_jsonb(dp)->>'co_procedimento',
        to_jsonb(dp)->>'nu_procedimento',
        to_jsonb(dp)->>'ds_procedimento',
        ''
      ), '[^0-9]', '', 'g') = '0301010129'
  ) x
  GROUP BY pessoa_id
),
exclusoes AS (
  SELECT DISTINCT i.pessoa_id
  FROM public.tb_fat_atendimento_individual a
  JOIN identidades i ON i.cid = a.co_fat_cidadao_pec AND i.pessoa_id IS NOT NULL
  JOIN episodios ep ON ep.pessoa_id = i.pessoa_id
  WHERE a.dt_inicial_atendimento::date BETWEEN ep.inicio_gestacao AND LEAST(CURRENT_DATE, ep.inicio_gestacao + 336)
    AND (
      COALESCE(a.ds_filtro_ciaps,'') ~ '\|(W82|W83)\|'
      OR replace(upper(COALESCE(a.ds_filtro_cids,'')),'.','') ~ '\|(O02|O03|O04|O05|O06|Z303)'
    )
),
vinculo_atual AS (
  SELECT DISTINCT ON (i.pessoa_id)
    i.pessoa_id, NULLIF(v.nu_ine, '-') AS nu_ine
  FROM identidades i
  JOIN public.tb_cidadao_vinculacao_equipe v ON v.co_cidadao = i.co_cidadao
  WHERE i.pessoa_id IS NOT NULL
    AND COALESCE(v.st_usar_cadastro_individual, 1) = 1
    AND COALESCE(v.st_saida_cadastro_obito, 0) = 0
    AND COALESCE(v.st_saida_cadastro_territorio, 0) = 0
  ORDER BY i.pessoa_id, v.dt_atualizacao_cadastro DESC NULLS LAST,
    v.co_seq_cidadao_vinculacao_eqp DESC
),
pessoas AS (
  SELECT ep.pessoa_id, ep.inicio_gestacao,
    CASE WHEN pu.primeiro_puerperio IS NOT NULL THEN pu.primeiro_puerperio - 1
      ELSE ep.inicio_gestacao + 294 END::date AS fim_gestacao,
    pu.primeiro_puerperio IS NOT NULL OR CURRENT_DATE > ep.inicio_gestacao + 294 AS em_puerperio,
    va.nu_ine, COALESCE(de.no_equipe, 'SEM EQUIPE') AS equipe
  FROM episodios ep
  JOIN vinculo_atual va ON va.pessoa_id = ep.pessoa_id
  LEFT JOIN eventos_puerperio pu ON pu.pessoa_id = ep.pessoa_id
  LEFT JOIN exclusoes ex ON ex.pessoa_id = ep.pessoa_id
  LEFT JOIN public.tb_dim_equipe de ON de.nu_ine = va.nu_ine
  WHERE ex.pessoa_id IS NULL
    AND (
      CURRENT_DATE BETWEEN ep.inicio_gestacao AND ep.inicio_gestacao + 294
      OR pu.primeiro_puerperio BETWEEN CURRENT_DATE - 42 AND CURRENT_DATE
      OR CURRENT_DATE BETWEEN ep.inicio_gestacao + 295 AND ep.inicio_gestacao + 336
    )
),
consultas AS (
  SELECT i.pessoa_id,
    MIN(t.dt_registro::date) FILTER (
      WHERE t.dt_registro::date <= p.fim_gestacao
        AND (
          COALESCE(a.ds_filtro_ciaps,'') ~ '\|(W03|W78|W79|W81|W84|W85)\|'
          OR replace(upper(COALESCE(a.ds_filtro_cids,'')),'.','') ~
            '\|(O10|O11|O12|O13|O14|O15|O16|O20|O21|O22|O23|O24|O25|O26|O28|O29|O30|O31|O32|O33|O34|O35|O36|O40|O41|O43|O44|O46|O47|O48|O752|O753|O98|O990|O991|O992|O993|O994|O995|O996|O997|Z321|Z33|Z34|Z35|Z36|Z640)'
        )
    ) AS primeira_consulta,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) FILTER (
      WHERE t.dt_registro::date <= p.fim_gestacao
        AND (
          COALESCE(a.ds_filtro_ciaps,'') ~ '\|(W03|W78|W79|W81|W84|W85)\|'
          OR replace(upper(COALESCE(a.ds_filtro_cids,'')),'.','') ~
            '\|(O10|O11|O12|O13|O14|O15|O16|O20|O21|O22|O23|O24|O25|O26|O28|O29|O30|O31|O32|O33|O34|O35|O36|O40|O41|O43|O44|O46|O47|O48|O752|O753|O98|O990|O991|O992|O993|O994|O995|O996|O997|Z321|Z33|Z34|Z35|Z36|Z640)'
        )
    ) AS consultas_gestacao,
    COUNT(DISTINCT a.co_seq_fat_atd_ind) FILTER (
      WHERE p.em_puerperio AND t.dt_registro::date > p.fim_gestacao
        AND t.dt_registro::date <= p.fim_gestacao + 42
        AND (
          COALESCE(a.ds_filtro_ciaps,'') ~ '\|(48|49|P29|W18|W19|W70|W90|W91|W92|W93|W94|W95|W96)\|'
          OR replace(upper(COALESCE(a.ds_filtro_cids,'')),'.','') ~
            '\|(F53|M830|O10|O152|O266|O722|O723|O85|O86|O87|O90|O91|O92|O94|O98|O99|Z370|Z371|Z372|Z373|Z374|Z375|Z376|Z377|Z379|Z38|Z39)'
          OR replace(COALESCE(a.ds_filtro_proced_avaliados,''),'.','') LIKE '%0301010129%'
        )
    ) AS consultas_puerperio
  FROM public.tb_fat_atendimento_individual a
  JOIN identidades i ON i.cid = a.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo c1 ON c1.co_seq_dim_cbo = a.co_dim_cbo_1
  LEFT JOIN public.tb_dim_cbo c2 ON c2.co_seq_dim_cbo = a.co_dim_cbo_2
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao + 42
    AND (
      replace(COALESCE(c1.nu_cbo,''),'-','') ~ '^(2231|2235|2251|2252|2253)'
      OR replace(COALESCE(c2.nu_cbo,''),'-','') ~ '^(2231|2235|2251|2252|2253)'
    )
  GROUP BY i.pessoa_id
),
consultas_puerperais_mip AS (
  SELECT i.pessoa_id, COUNT(*) AS registros
  FROM public.tb_fat_proced_atend_proced pr
  JOIN identidades i ON i.cid = pr.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = pr.co_dim_tempo
  JOIN public.tb_dim_procedimento dp ON dp.co_seq_dim_procedimento = pr.co_dim_procedimento
  LEFT JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = pr.co_dim_cbo
  WHERE p.em_puerperio
    AND t.dt_registro::date > p.fim_gestacao
    AND t.dt_registro::date <= p.fim_gestacao + 42
    AND regexp_replace(COALESCE(
      to_jsonb(dp)->>'nu_identificador',
      to_jsonb(dp)->>'co_procedimento',
      to_jsonb(dp)->>'nu_procedimento',
      to_jsonb(dp)->>'ds_procedimento',
      ''
    ), '[^0-9]', '', 'g') = '0301010129'
    AND replace(COALESCE(cbo.nu_cbo,''),'-','') ~ '^(2231|2235|2251|2252|2253)'
  GROUP BY i.pessoa_id
),
medicoes AS (
  SELECT pessoa_id,
    COUNT(DISTINCT dia) FILTER (WHERE tem_pa) AS afericoes_pa,
    COUNT(DISTINCT dia) FILTER (WHERE tem_peso_altura) AS antropometrias
  FROM (
    SELECT i.pessoa_id, t.dt_registro::date AS dia,
      (a.nu_pressao_sistolica IS NOT NULL AND a.nu_pressao_diastolica IS NOT NULL) AS tem_pa,
      (a.nu_peso IS NOT NULL AND a.nu_altura IS NOT NULL) AS tem_peso_altura
    FROM public.tb_fat_atendimento_individual a
    JOIN identidades i ON i.cid = a.co_fat_cidadao_pec
    JOIN pessoas p ON p.pessoa_id = i.pessoa_id
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
    WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
    UNION ALL
    SELECT i.pessoa_id, t.dt_registro::date,
      v.nu_medicao_pressao_arterial IS NOT NULL,
      (v.nu_peso IS NOT NULL AND v.nu_altura IS NOT NULL)
    FROM public.tb_fat_visita_domiciliar v
    JOIN identidades i ON i.cid = v.co_fat_cidadao_pec
    JOIN pessoas p ON p.pessoa_id = i.pessoa_id
    JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
    WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
  ) x GROUP BY pessoa_id
),
visitas AS (
  SELECT i.pessoa_id,
    COUNT(DISTINCT t.dt_registro::date) FILTER (
      WHERE t.dt_registro::date > q.primeira_consulta AND t.dt_registro::date <= p.fim_gestacao
    ) AS visitas_gestacao,
    COUNT(DISTINCT t.dt_registro::date) FILTER (
      WHERE p.em_puerperio AND t.dt_registro::date > p.fim_gestacao
        AND t.dt_registro::date <= p.fim_gestacao + 42
    ) AS visitas_puerperio
  FROM public.tb_fat_visita_domiciliar v
  JOIN identidades i ON i.cid = v.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  LEFT JOIN consultas q ON q.pessoa_id = p.pessoa_id
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = v.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = v.co_dim_cbo
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao + 42
    AND replace(COALESCE(cbo.nu_cbo,''),'-','') ~ '^(322255|515105)'
    AND (
      COALESCE(v.st_mot_vis_cad_att,0) = 1 OR COALESCE(v.st_mot_vis_visita_periodica,0) = 1
      OR COALESCE(v.st_mot_vis_busca_ativa,0) = 1 OR COALESCE(v.st_mot_vis_acompanhamento,0) = 1
      OR COALESCE(v.st_mot_vis_egresso_internacao,0) = 1 OR COALESCE(v.st_mot_vis_ctrl_ambnte_vetor,0) = 1
      OR COALESCE(v.st_mot_vis_convte_atvidd_cltva,0) = 1 OR COALESCE(v.st_mot_vis_orintacao_prevncao,0) = 1
      OR COALESCE(v.st_mot_vis_outros,0) = 1
    )
  GROUP BY i.pessoa_id
),
dtpa AS (
  SELECT i.pessoa_id, COUNT(*) AS registros
  FROM public.tb_fat_vacinacao v
  JOIN identidades i ON i.cid = v.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  JOIN public.tb_fat_vacinacao_vacina vv ON vv.co_fat_vacinacao = v.co_seq_fat_vacinacao
  JOIN public.tb_dim_imunobiologico im ON im.co_seq_dim_imunobiologico = vv.co_dim_imunobiologico
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = vv.co_dim_tempo_vacina_aplicada
  WHERE NULLIF(regexp_replace(COALESCE(im.nu_identificador::text,''), '[^0-9]', '', 'g'),'')::int = 57
    AND t.dt_registro::date BETWEEN p.inicio_gestacao + 140 AND p.fim_gestacao
  GROUP BY i.pessoa_id
),
exame_eventos AS (
  SELECT i.pessoa_id, p.inicio_gestacao, p.fim_gestacao, t.dt_registro::date AS dia,
    regexp_replace(COALESCE(a.ds_filtro_proced_avaliados,''), '[^0-9|]', '', 'g') AS codigos
  FROM public.tb_fat_atendimento_individual a
  JOIN identidades i ON i.cid = a.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = a.co_dim_tempo
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
  UNION ALL
  SELECT i.pessoa_id, p.inicio_gestacao, p.fim_gestacao, t.dt_registro::date,
    regexp_replace(COALESCE(
      to_jsonb(dp)->>'nu_identificador',
      to_jsonb(dp)->>'co_procedimento',
      to_jsonb(dp)->>'nu_procedimento',
      to_jsonb(dp)->>'ds_procedimento',
      ''
    ), '[^0-9]', '', 'g')
  FROM public.tb_fat_proced_atend_proced pr
  JOIN identidades i ON i.cid = pr.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = pr.co_dim_tempo
  JOIN public.tb_dim_procedimento dp ON dp.co_seq_dim_procedimento = pr.co_dim_procedimento
  LEFT JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = pr.co_dim_cbo
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
    AND replace(COALESCE(cbo.nu_cbo,''),'-','') ~ '^(2231|2232|2234|2235|2236|2237|2238|2239|2241|2251|2252|2253|3222|3224|515105)'
),
exames AS (
  SELECT pessoa_id,
    BOOL_OR(dia <= inicio_gestacao + 97 AND codigos ~ '(0214010040|0214010279|0214010058|0213010780|0213010500|0202030300)') AS hiv_t1,
    BOOL_OR(dia <= inicio_gestacao + 97 AND codigos ~ '(0214010074|0214010082|0214010252|0202031098|0202031110|0202031179)') AS sifilis_t1,
    BOOL_OR(dia <= inicio_gestacao + 97 AND codigos ~ '(0214010104|0214010236|0202030784|0202030970|0213010208)') AS hepb_t1,
    BOOL_OR(dia <= inicio_gestacao + 97 AND codigos ~ '(0214010090|0214010309|0202030059|0202030679)') AS hepc_t1,
    BOOL_OR(dia BETWEEN inicio_gestacao + 196 AND fim_gestacao AND codigos ~ '(0214010040|0214010279|0214010058|0213010780|0213010500|0202030300)') AS hiv_t3,
    BOOL_OR(dia BETWEEN inicio_gestacao + 196 AND fim_gestacao AND codigos ~ '(0214010074|0214010082|0214010252|0202031098|0202031110|0202031179)') AS sifilis_t3
  FROM exame_eventos GROUP BY pessoa_id
),
saude_bucal AS (
  SELECT i.pessoa_id, COUNT(*) AS atividades
  FROM public.tb_fat_atendimento_odonto o
  JOIN identidades i ON i.cid = o.co_fat_cidadao_pec
  JOIN pessoas p ON p.pessoa_id = i.pessoa_id
  JOIN public.tb_dim_tempo t ON t.co_seq_dim_tempo = o.co_dim_tempo
  LEFT JOIN public.tb_dim_cbo c1 ON c1.co_seq_dim_cbo = o.co_dim_cbo_1
  LEFT JOIN public.tb_dim_cbo c2 ON c2.co_seq_dim_cbo = o.co_dim_cbo_2
  WHERE t.dt_registro::date BETWEEN p.inicio_gestacao AND p.fim_gestacao
    AND (replace(COALESCE(c1.nu_cbo,''),'-','') ~ '^(2232|3224)'
      OR replace(COALESCE(c2.nu_cbo,''),'-','') ~ '^(2232|3224)')
  GROUP BY i.pessoa_id
),
avaliacao AS (
  SELECT p.*,
    COALESCE((q.primeira_consulta <= p.inicio_gestacao + 83)::int,0) AS a,
    (COALESCE(q.consultas_gestacao,0) >= 7)::int AS b,
    (COALESCE(m.afericoes_pa,0) >= 7)::int AS c,
    (COALESCE(m.antropometrias,0) >= 7)::int AS d,
    (COALESCE(v.visitas_gestacao,0) >= 3)::int AS e,
    (COALESCE(f.registros,0) >= 1)::int AS f,
    (COALESCE(x.hiv_t1,false) AND COALESCE(x.sifilis_t1,false)
      AND COALESCE(x.hepb_t1,false) AND COALESCE(x.hepc_t1,false))::int AS g,
    (COALESCE(x.hiv_t3,false) AND COALESCE(x.sifilis_t3,false))::int AS h,
    (COALESCE(q.consultas_puerperio,0) + COALESCE(pm.registros,0) >= 1)::int AS i,
    (COALESCE(v.visitas_puerperio,0) >= 1)::int AS j,
    (COALESCE(sb.atividades,0) >= 1)::int AS k
  FROM pessoas p
  LEFT JOIN consultas q ON q.pessoa_id = p.pessoa_id
  LEFT JOIN consultas_puerperais_mip pm ON pm.pessoa_id = p.pessoa_id
  LEFT JOIN medicoes m ON m.pessoa_id = p.pessoa_id
  LEFT JOIN visitas v ON v.pessoa_id = p.pessoa_id
  LEFT JOIN dtpa f ON f.pessoa_id = p.pessoa_id
  LEFT JOIN exames x ON x.pessoa_id = p.pessoa_id
  LEFT JOIN saude_bucal sb ON sb.pessoa_id = p.pessoa_id
)
SELECT
  CASE WHEN a.pessoa_id LIKE 'CPF:%' THEN
    substr(replace(a.pessoa_id,'CPF:',''),1,3) || '.***.***-' || substr(replace(a.pessoa_id,'CPF:',''),10,2)
    ELSE 'CPF não informado' END AS cpf,
  COALESCE(cid.no_cidadao, 'Nome não localizado') AS gestante,
  a.nu_ine AS ine, a.equipe,
  a.a AS pratica_a, a.b AS pratica_b, a.c AS pratica_c, a.d AS pratica_d,
  a.e AS pratica_e, a.f AS pratica_f, a.g AS pratica_g, a.h AS pratica_h,
  a.i AS pratica_i, a.j AS pratica_j, a.k AS pratica_k,
  CONCAT_WS(', ', CASE WHEN a.a=0 THEN 'A' END, CASE WHEN a.b=0 THEN 'B' END,
    CASE WHEN a.c=0 THEN 'C' END, CASE WHEN a.d=0 THEN 'D' END, CASE WHEN a.e=0 THEN 'E' END,
    CASE WHEN a.f=0 THEN 'F' END, CASE WHEN a.g=0 THEN 'G' END, CASE WHEN a.h=0 THEN 'H' END,
    CASE WHEN a.i=0 THEN 'I' END, CASE WHEN a.j=0 THEN 'J' END, CASE WHEN a.k=0 THEN 'K' END) AS praticas_pendentes,
  (10*a.a + 9*(a.b+a.c+a.d+a.e+a.f+a.g+a.h+a.i+a.j+a.k))::int AS pontuacao_atual,
  CASE WHEN a.em_puerperio THEN 'Puerpério' ELSE 'Gestação' END AS fase_cuidado
FROM avaliacao a
LEFT JOIN LATERAL (
  SELECT c.no_cidadao
  FROM public.tb_cidadao c
  WHERE (a.pessoa_id LIKE 'CPF:%' AND regexp_replace(COALESCE(c.nu_cpf,''),'[^0-9]','','g') = replace(a.pessoa_id,'CPF:',''))
     OR (a.pessoa_id LIKE 'CNS:%' AND regexp_replace(COALESCE(c.nu_cns,''),'[^0-9]','','g') = replace(a.pessoa_id,'CNS:',''))
  ORDER BY COALESCE(c.st_ativo,1) DESC, c.co_seq_cidadao DESC
  LIMIT 1
) cid ON TRUE
CROSS JOIN parametros p
WHERE (p.ine_filtro IS NULL OR a.nu_ine=p.ine_filtro)
  AND (a.a+a.b+a.c+a.d+a.e+a.f+a.g+a.h+a.i+a.j+a.k)<11
ORDER BY pontuacao_atual ASC, a.equipe, a.pessoa_id;
