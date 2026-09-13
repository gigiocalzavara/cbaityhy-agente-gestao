SELECT DISTINCT e.nu_ine AS ine,
       e.no_equipe AS equipe
FROM public.tb_equipe e
WHERE e.st_ativo = 1
  AND e.tp_equipe = 56
  AND e.nu_ine IS NOT NULL
  AND trim(e.nu_ine) <> ''
ORDER BY equipe, ine;
