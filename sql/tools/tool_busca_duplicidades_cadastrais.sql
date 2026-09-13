WITH candidatos AS (
    SELECT c.co_seq_cidadao,
           c.no_cidadao,
           c.nu_cpf,
           c.nu_cns,
           c.dt_nascimento,
           c.no_mae,
           c.no_social,
           c.st_ativo,
           c.st_ativo_para_exibicao,
           c.st_unificado,
           c.st_faleceu,
           c.dt_obito,
           c.dt_atualizado_cadsus,
           concat_ws(', ', nullif(c.ds_logradouro, ''), nullif(c.nu_numero, ''), nullif(c.no_bairro, '')) AS endereco,
           coalesce(nullif(c.nu_telefone_celular, ''), nullif(c.nu_telefone_contato, ''), nullif(c.nu_telefone_residencial, '')) AS telefone,
           concat_ws('|', coalesce(c.no_cidadao_filtro, lower(trim(c.no_cidadao))), coalesce(c.dt_nascimento::text, ''), coalesce(c.no_mae_filtro, lower(trim(c.no_mae)))) AS chave_demografica,
           (CASE WHEN length(regexp_replace(coalesce(c.nu_cpf, ''), '[^0-9]', '', 'g')) = 11 THEN 35 ELSE 0 END
            + CASE WHEN length(regexp_replace(coalesce(c.nu_cns, ''), '[^0-9]', '', 'g')) = 15 THEN 25 ELSE 0 END
            + CASE WHEN c.dt_nascimento IS NOT NULL THEN 15 ELSE 0 END
            + CASE WHEN nullif(trim(c.no_mae), '') IS NOT NULL THEN 10 ELSE 0 END
            + CASE WHEN c.dt_atualizado_cadsus IS NOT NULL THEN 5 ELSE 0 END
            + CASE WHEN nullif(trim(c.ds_logradouro), '') IS NOT NULL THEN 5 ELSE 0 END
            + CASE WHEN nullif(trim(coalesce(c.nu_telefone_celular, c.nu_telefone_contato, c.nu_telefone_residencial)), '') IS NOT NULL THEN 5 ELSE 0 END
           ) AS confiabilidade_demografica
    FROM public.tb_cidadao c
    WHERE coalesce(c.no_cidadao_filtro, lower(c.no_cidadao)) ILIKE '%' || lower($1::varchar) || '%'
), classificados AS (
    SELECT ca.*,
           COUNT(*) OVER (PARTITION BY ca.chave_demografica) AS cadastros_no_grupo,
           ROW_NUMBER() OVER (
               PARTITION BY ca.chave_demografica
               ORDER BY ca.confiabilidade_demografica DESC,
                        ca.st_ativo DESC NULLS LAST,
                        ca.dt_atualizado_cadsus DESC NULLS LAST,
                        ca.co_seq_cidadao DESC
           ) AS prioridade
    FROM candidatos ca
)
SELECT co_seq_cidadao AS codigo_cadastro,
       no_cidadao AS nome,
       nu_cpf AS cpf,
       nu_cns AS cns,
       to_char(dt_nascimento, 'DD/MM/YYYY') AS nascimento,
       no_mae AS nome_mae,
       no_social AS nome_social,
       CASE WHEN coalesce(st_ativo, 0) = 1 AND coalesce(st_ativo_para_exibicao, 1) = 1 THEN 'Ativo' ELSE 'Inativo' END AS situacao,
       CASE WHEN coalesce(st_unificado, 0) = 1 THEN 'Sim' ELSE 'Não' END AS cadastro_unificado,
       CASE WHEN coalesce(st_faleceu, 0) = 1 OR dt_obito IS NOT NULL THEN 'Óbito registrado' ELSE 'Sem óbito registrado' END AS situacao_obito,
       endereco,
       telefone,
       confiabilidade_demografica AS pontuacao_confiabilidade,
       cadastros_no_grupo,
       CASE WHEN cadastros_no_grupo > 1 THEN 'Possível duplicidade' ELSE 'Cadastro único entre os resultados' END AS avaliacao,
       CASE WHEN prioridade = 1 THEN 'Principal recomendado' ELSE 'Comparar com o principal recomendado' END AS recomendacao
FROM classificados
ORDER BY cadastros_no_grupo DESC, chave_demografica, prioridade
LIMIT 100;
