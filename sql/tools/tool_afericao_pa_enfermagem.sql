SELECT COALESCE(NULLIF(e1.nu_ine, '-'), NULLIF(e2.nu_ine, '-')) AS ine,
       COALESCE(NULLIF(e1.no_equipe, ''), NULLIF(e2.no_equipe, ''), 'SEM EQUIPE') AS equipe,
       p.no_profissional AS profissional,
       cbo.no_cbo AS ocupacao,
       COUNT(*) AS atendimentos_mes,
       COUNT(*) FILTER (WHERE COALESCE(a.nu_pressao_sistolica, 0) > 0) AS atendimentos_com_pa,
       ROUND(100.0 * COUNT(*) FILTER (WHERE COALESCE(a.nu_pressao_sistolica, 0) > 0) / NULLIF(COUNT(*), 0), 2) AS percentual_com_pa
FROM public.tb_fat_atendimento_individual a
JOIN public.tb_dim_profissional p ON p.co_seq_dim_profissional = a.co_dim_profissional_1
JOIN public.tb_dim_cbo cbo ON cbo.co_seq_dim_cbo = a.co_dim_cbo_1
LEFT JOIN public.tb_dim_equipe e1 ON e1.co_seq_dim_equipe = a.co_dim_equipe_1
LEFT JOIN public.tb_dim_equipe e2 ON e2.co_seq_dim_equipe = a.co_dim_equipe_2
WHERE a.dt_inicial_atendimento >= date_trunc('month', CURRENT_DATE)
  AND replace(cbo.nu_cbo, '-', '') IN ('322205','322245','322230','322250')
  AND ($1::varchar IS NULL OR lower(COALESCE(e1.no_equipe,e2.no_equipe,'')) LIKE '%' || lower($1::varchar) || '%' OR regexp_replace(COALESCE(NULLIF(e1.nu_ine,'-'),NULLIF(e2.nu_ine,'-'),''), '[^0-9]', '', 'g') = regexp_replace($1::varchar, '[^0-9]', '', 'g'))
GROUP BY 1,2,3,4
ORDER BY percentual_com_pa DESC NULLS LAST, atendimentos_mes DESC;
