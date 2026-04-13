# Pipeline Executor

Pipeline de desenvolvimento automatizado orientado por IA. A partir de um requisito em linguagem natural, o sistema aciona uma cadeia de agentes LLM especializados que percorre todas as etapas de um ciclo de desenvolvimento — especificação, análise, design UX, código, QA e DevOps — e integra o resultado diretamente em um repositório GitHub via Pull Request.

---

## Como funciona

O pipeline recebe um requisito, analisa o repositório alvo e executa 7 agentes em sequência. Cada agente usa um `SKILL.md` como system prompt especializado e gera documentação estruturada da sua etapa. Ao final, o código gerado é integrado nos arquivos do repositório e um Pull Request é aberto automaticamente para revisão.

```
Requisito
    │
    ▼
┌─────────────┐
│  Stage 0    │  Spec Agent       Transforma o requisito em especificação estruturada
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 1    │  Analyst Agent    Gera user stories, requisitos técnicos e critérios de aceite
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 2    │  UX/UI Agent      Cria especificações de design, jornadas e componentes
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 3    │  Developer Agent  Gera o código alinhado com a especificação
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 4    │  QA Agent         Valida o código — gateway bloqueante se cobertura < 80%
└──────┬──────┘
       │
       ├─── QA reprovado → pipeline bloqueado (status: blocked_by_qa)
       │
       ▼
┌─────────────┐
│  Stage 5    │  DevOps Agent     Planeja deploy, health checks e plano de rollback
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 6    │  Documenter       Gera documentação Markdown para cada etapa
└──────┬──────┘
       ▼
  Pull Request aberto no repositório alvo
```

---

## Requisitos

- Node.js 20+
- npm
- OpenAI API Key
- GitHub Token (para pipelines externos com PR automático)

---

## Instalação

```bash
git clone https://github.com/ospm1970/pipeline-executor.git
cd pipeline-executor
npm install
cp .env.example .env
# Edite .env com suas credenciais
npm start
```

O servidor sobe em `http://localhost:3001`.

---

## Configuração

Todas as variáveis estão documentadas em `.env.example`. As essenciais:

```env
# Obrigatório
OPENAI_API_KEY=sk-proj-...
API_KEY=sua-chave-para-autenticar-requisicoes

# Para pipelines com repositório externo
GITHUB_TOKEN=ghp_...

# Opcionais
PORT=3001
OPENAI_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=http://localhost:3001
DEFAULT_BASE_BRANCH=main
LOG_LEVEL=info
```

---

## Autenticação

Todas as rotas `/api/*` exigem o header `x-api-key`:

```bash
curl -H "x-api-key: sua-chave" http://localhost:3001/api/pipeline
```

---

## API

### Pipeline simples

Executa o pipeline sem repositório externo — útil para explorar o fluxo ou gerar documentação.

```bash
POST /api/pipeline/execute
Content-Type: application/json
x-api-key: sua-chave

{
  "requirement": "Criar endpoint de autenticação com JWT"
}
```

Resposta:
```json
{
  "pipelineId": "pipeline-1234567890",
  "status": "completed",
  "requirement": "Criar endpoint de autenticação com JWT",
  "createdAt": "2026-04-13T12:00:00.000Z"
}
```

Se o QA reprovar:
```json
{
  "status": "blocked_by_qa",
  "reason": "Cobertura insuficiente: 62% (mínimo 80%)",
  "qa": { ... }
}
```

---

### Pipeline externo (repositório GitHub)

Clona o repositório, executa o pipeline completo, integra o código gerado e abre um Pull Request.

```bash
POST /api/pipeline/external
Content-Type: application/json
x-api-key: sua-chave

{
  "repositoryUrl": "https://github.com/sua-org/seu-repo",
  "requirement": "Adicionar paginação no endpoint /api/products",
  "autoCommit": true
}
```

O `githubToken` é lido automaticamente da variável `GITHUB_TOKEN` do ambiente. Para sobrescrever por requisição, envie `"githubToken": "ghp_..."` no body.

Resposta inclui:
```json
{
  "executionId": "exec-1234567890-abc",
  "pipelineId": "pipeline-...",
  "pullRequest": {
    "url": "https://github.com/sua-org/seu-repo/pull/42",
    "number": 42
  },
  "status": "completed"
}
```

---

### Outros endpoints

```
GET  /api/pipeline              Lista todos os pipelines executados
GET  /api/pipeline/:pipelineId  Detalhes e documentação de um pipeline
GET  /api/deployments           Lista workspaces ativos
GET  /health                    Health check
GET  /dashboard.html            Dashboard de monitoramento
```

---

## Sistema de SKILLs

Cada agente carrega seu `SKILL.md` como system prompt antes de executar. Os arquivos ficam em `skills/<nome-do-agente>/SKILL.md` e podem ser editados sem alterar código.

```
skills/
├── spec-agent/         Spec-Driven Development
├── analyst-agent/      Análise de requisitos
├── ui-ux-agent/        Design e experiência do usuário
├── developer-agent/    Geração de código
├── qa-agent/           Qualidade e testes
├── devops-agent/       Deploy e infraestrutura
└── documenter-agent/   Documentação técnica
```

Para adaptar o pipeline ao contexto da sua empresa, edite os SKILLs com suas convenções, stack e padrões.

---

## Gateway de qualidade

O Stage 4 (QA) funciona como gateway bloqueante. O pipeline não avança para DevOps se qualquer uma das condições abaixo for verdadeira:

- `approved: false` retornado pelo agente QA
- `coverage_percentage` < 80% (para projetos novos)
- Presença de issues classificadas como críticas

Quando bloqueado, o pipeline retorna `status: blocked_by_qa` com o motivo detalhado.

---

## Observabilidade

Todos os logs são emitidos em JSON estruturado com `pipelineId` e `executionId` em cada linha, prontos para ingestão no CloudWatch ou qualquer sistema de log centralizado:

```json
{
  "timestamp": "2026-04-13T12:00:00.000Z",
  "level": "info",
  "message": "QA Gateway approved",
  "service": "pipeline-executor",
  "pipelineId": "pipeline-1234567890",
  "executionId": "exec-abc",
  "coverage": 87
}
```

Níveis disponíveis: `error`, `warn`, `info`, `debug` — controlados por `LOG_LEVEL` no `.env`.

---

## Persistência

O histórico de execuções é salvo em `data/executions/<pipelineId>.json` e recarregado automaticamente ao reiniciar o servidor. Os workspaces dos repositórios clonados ficam em `workspaces/`.

Ambos os diretórios estão no `.gitignore`.

---

## Testes

```bash
npm test
```

Executa 6 testes de integração cobrindo autenticação, health check, validação de body e estrutura de resposta dos endpoints principais. Não requer `OPENAI_API_KEY` — o teste do pipeline aceita retorno 500 quando a chave não está configurada no ambiente de testes.

---

## Estrutura do projeto

```
pipeline-executor/
├── server.js                  Servidor Express, rotas e middleware
├── orchestrator.js            Orquestrador do pipeline e persistência
├── agents.js                  Agentes base (Analyst, Developer, QA, DevOps)
├── agents-spec.js             Spec Agent com carregamento de SKILL
├── agents-ux.js               UX/UI Agent com carregamento de SKILL
├── agents-documenter.js       Documenter Agent com carregamento de SKILL
├── repository-manager.js      Clone, commit, branch e push via Git
├── repository-analyzer.js     Análise estática de repositórios
├── code-integrator.js         Integração do código gerado nos arquivos
├── code-persister.js          Persistência dos outputs do pipeline
├── github-pr.js               Criação de Pull Requests via GitHub API
├── port-manager.js            Alocação dinâmica de portas por execução
├── dashboard-monitor.js       Rotas do dashboard de monitoramento
├── logger.js                  Logger JSON estruturado com correlation ID
├── retry.js                   Retry com backoff exponencial para chamadas OpenAI
├── config/
│   └── documentation.config.js
├── skills/                    SKILLs (system prompts) dos agentes
├── public/                    Frontend estático (index.html, dashboard.html)
├── tests/
│   └── integration.test.js    Testes de integração (node:test nativo)
├── data/executions/           Histórico persistido de execuções (gitignore)
├── workspaces/                Repositórios clonados por execução (gitignore)
└── docs/                      Documentação gerada pelos pipelines (gitignore)
```

---

## Rate limiting

Para proteger a API e os custos com OpenAI:

- Rotas gerais `/api/*`: 50 requisições por 15 minutos por IP
- Rotas de execução (`/execute`, `/external`): 10 execuções por hora por IP

---

## Licença

MIT
