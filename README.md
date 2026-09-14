# CBAItyhy — Inteligência APS

Aplicação web multi-município para gestão da Atenção Primária à Saúde. Combina dados do e-SUS PEC, indicadores gerenciais, busca ativa, conhecimento normativo via RAG e um agente de IA com ferramentas SQL controladas.

> Os indicadores calculados diretamente no PEC são prévias locais. Só devem ser chamados de oficiais após conciliação com o SIAPS/Saúde 360 na mesma competência e INE.

## Documentação técnica

| Documento | Conteúdo |
|---|---|
| [Primeiros passos](docs/GETTING_STARTED.md) | Ambiente local, variáveis e primeiro acesso |
| [Configuração](docs/CONFIGURATION.md) | Referência completa das variáveis de ambiente |
| [Arquitetura](docs/ARCHITECTURE.md) | Componentes, fluxos e estrutura do repositório |
| [Banco operacional e migrations](docs/DATABASE.md) | Supabase operacional, tabelas e ordem das migrations |
| [PEC, SSH e ferramentas SQL](docs/PEC_AND_TOOLS.md) | Conexões municipais, segurança, catálogo e homologação |
| [IA e RAG](docs/AI_AND_RAG.md) | Orquestração, Responses API, RAG e consulta dinâmica |
| [Indicadores e cache](docs/INDICATORS_AND_CACHE.md) | Saúde 360, Saúde Bucal, eMulti, cache e histórico |
| [API](docs/API.md) | Contratos das rotas HTTP |
| [Deploy e operação](docs/DEPLOY_PORTAINER.md) | GitHub Actions, GHCR, Portainer, Traefik e rotina operacional |
| [Segurança](docs/SECURITY.md) | RBAC, LGPD, credenciais e limites de confiança |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Erros conhecidos e diagnóstico |
| [Guia de contribuição](CONTRIBUTING.md) | Fluxo para alterações e checklist de PR |
| [Validação Saúde 360](docs/SAUDE_360_VALIDATION.md) | Critérios para promover uma prévia a validada |

## Stack

- Next.js 16 / React 19 / TypeScript
- Node.js 22
- PostgreSQL do e-SUS PEC, sempre em transação `READ ONLY`
- Supabase operacional para autenticação, autorização, conexões, cache e histórico
- Supabase de IA para documentos e vetores do RAG
- OpenAI Responses API para o agente e geração controlada de consulta agregada
- `ssh2` para municípios cujo PostgreSQL exige túnel SSH
- Docker Swarm, Portainer, Traefik e GHCR

## Comandos

```bash
npm install
npm run dev
npm run build
npm start
```

O projeto ainda não possui suíte automatizada de testes ou lint. `npm run build` é o gate obrigatório atual.

## Estado funcional

- autenticação e RBAC multi-município;
- administração de municípios e conexões PEC diretas ou por SSH;
- Assistente IA com RAG e function calling;
- visão geral, indicadores, busca ativa e território;
- catálogo de SQLs homologadas e consulta agregada dinâmica restrita;
- cache diário de resultados agregados e histórico por snapshot;
- indicadores APS C1–C7 em diferentes estágios de homologação;
- Saúde Bucal B1, B2, B3, B5 e B6 disponíveis como prévias locais; B4 pendente;
- eMulti M1–M2 metodologicamente descritos e ainda pendentes de tool.

Consulte os JSONs em `config/` para o estado técnico efetivo de cada indicador.
