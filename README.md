# Pipeline Executor

Pipeline de desenvolvimento automatizado orientado por IA. A partir de um requisito em linguagem natural, o sistema aciona uma cadeia de agentes LLM especializados que percorre todas as etapas de um ciclo de desenvolvimento — especificação, análise, design UX, código, code review, segurança, QA e DevOps — e integra o resultado diretamente em um repositório GitHub via Pull Request.

---

## Como funciona

O pipeline recebe um requisito, analisa o repositório alvo e executa agentes em sequência. Cada agente usa um `SKILL.md` como system prompt especializado e gera documentação estruturada da sua etapa. Ao final, o código gerado é integrado nos arquivos do repositório e um Pull Request é aberto automaticamente para revisão.

```
Requisito
    │
    ▼
┌─────────────┐
│  Stage 0    │  Spec Agent          Transforma o requisito em especificação estruturada
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 1    │  Analyst Agent       Gera user stories, requisitos técnicos e critérios de aceite
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 2    │  UX/UI Agent         Cria especificações de design, jornadas e componentes
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 3    │  Developer Agent     Gera código e testes compatíveis com a stack do repositório
└──────┬──────┘
       ▼
┌─────────────┐
│  Stage 4    │  Code Review Agent   Valida compilação, padrões de arquitetura, segurança e LGPD
└──────┬──────┘  Auto-corrige issues menores; reenvia ao developer se reprovado (max 2x)
       │
       ├─── Reprovado após 2 tentativas → pipeline bloqueado (status: blocked_by_review)
       │
       ▼
┌─────────────┐
│  Stage 5    │  Security Agent      Checklist Privacy by Design + Security by Design + LGPD
└──────┬──────┘  Avalia autenticação, autorização, exposição de APIs e dependências externas
       │
       ├─── Vulnerabilidade crítica ou alta → pipeline bloqueado (status: blocked_by_security)
       │
       ▼
┌─────────────┐
│  Stage 6    │  QA Agent            Executa testes reais no repositório alvo (jest/vitest/mocha)
└──────┬──────┘  Coleta cobertura real, detecta regressão vs baseline, roda lint — gateway ≥ 80%
       │
       ├─── QA reprovado ou regressão de cobertura → pipeline bloqueado (status: blocked_by_qa)
       │
       ▼
┌─────────────┐
│  Stage 7    │  DevOps Agent        Planeja deploy, health checks e plano de rollback
└──────┬──────┘
       ▼
┌─────────────┐
│  Documenter │  Gera documentação Markdown para cada etapa automaticamente
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

Pipeline bloqueado pelo Code Review:
```json
{
  "status": "blocked_by_review",
  "reason": "src/eventos/eventos.controller.ts: endpoint DELETE sem @UseGuards — qualquer usuário autenticado pode deletar eventos de outros casais"
}
```

Pipeline bloqueado pelo Security Agent:
```json
{
  "status": "blocked_by_security",
  "reason": "1 vulnerabilidade(s) crítica(s)/alta(s): [critical] authorization"
}
```

Pipeline bloqueado pelo QA:
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

Cada agente carrega seu `SKILL.md` como system prompt antes de executar. Os arquivos ficam em `skills/<nome-do-agente>/SKILL.md` e podem ser editados sem alterar código. O `skill-loader.js` compõe o prompt final concatenando o SKILL base com subdiretórios opcionais:

```
skills/<agente>/
├── SKILL.md              Prompt base — obrigatório
├── references/           Referências técnicas (ex: api_reference.md)
├── context/              Contexto de domínio
├── migration/            Guias de migração
└── checklists/           Checklists por tipo de entrega
```

Agentes disponíveis:

```
skills/
├── spec-agent/           Spec-Driven Development
├── analyst-agent/        Análise de requisitos e user stories
├── ui-ux-agent/          Design e experiência do usuário
├── developer-agent/      Geração de código com testes (schema: files[], tests[])
├── code-review-agent/    Revisão técnica: compilação, segurança, LGPD
├── security-agent/       Privacy by Design, Security by Design, LGPD, OWASP
├── qa-agent/             Qualidade, cobertura e gateway bloqueante
├── devops-agent/         Deploy e infraestrutura
└── documenter-agent/     Documentação técnica Markdown
```

Para adaptar o pipeline ao contexto da sua empresa, edite os SKILLs com suas convenções, stack e padrões.

---

## Gateways de qualidade

### Code Review Gateway (Stage 4)

O Code Review Agent valida o código antes do Security com até **2 tentativas de correção automática**:

1. Recebe `files[]` e `tests[]` do Developer Agent
2. Verifica: compilação, padrões de arquitetura, guards de autenticação, DTOs com validação, ausência de segredos hardcoded, conformidade LGPD nos logs
3. **Issues menores** (decorators faltando, imports inferíveis): corrige diretamente em `corrected_files`
4. **Issues complexas** (falha de autorização, arquitetura incorreta): devolve `blocking_issues` ao Developer Agent para re-geração
5. Após 2 tentativas sem aprovação: pipeline retorna `status: blocked_by_review`

### Security Gateway (Stage 5)

O Security Agent executa dois checklists obrigatórios antes do QA:

**Privacy by Design**
- Minimização de dados, finalidade declarada, política de retenção
- Consentimento explícito para dados sensíveis
- Proteção técnica: criptografia em repouso, mascaramento de PII em logs, HTTPS

**Security by Design**
- Autenticação (JWT com expiração, refresh token rotation, proteção contra força bruta)
- Autorização (RBAC, verificação de propriedade, escopo de acesso)
- Validação de entrada, proteção contra OWASP Top 10 (SQL Injection, XSS, CSRF, Path Traversal)
- Configuração segura (sem segredos hardcoded, CORS restrito, headers de segurança)
- Dependências sem vulnerabilidades críticas ou altas

Quando bloqueado: `status: blocked_by_security` com lista de vulnerabilidades por severidade e referência OWASP.

### QA Gateway (Stage 6)

O QA Agent é um gateway bloqueante orientado por **evidências reais de execução**. O pipeline não avança para DevOps se:

- `approved: false` retornado pelo agente QA
- Cobertura medida < 80% (para projetos novos)
- Regressão de cobertura detectada vs baseline do repositório (tolerância: 0,5%)
- Presença de issues classificadas como críticas ou altas

**Funcionamento do QA Runner:**

Quando o pipeline tem acesso ao repositório alvo, o `qa-runner.js` é executado antes do LLM:

1. Detecta automaticamente o framework de testes (`jest`, `vitest`, `mocha`) via `package.json`
2. Copia o repositório para um diretório temporário isolado (symlink de `node_modules` — sem reinstalação)
3. Aplica os arquivos gerados pelo Developer Agent por cima da cópia
4. Executa os testes com flag de cobertura → coleta `coverage/coverage-summary.json` (istanbul/c8)
5. Calcula delta vs cobertura baseline do repositório original
6. Executa ESLint se configurado no projeto
7. Repassa todas as evidências ao agente LLM, que usa dados reais para análise e recomendações
8. O campo `coverage_percentage` no resultado final reflete sempre a cobertura **medida**, nunca estimada

Resultado estruturado do QA:
```json
{
  "approved": true,
  "coverage_percentage": 87.4,
  "coverage_real": { "lines": 87.4, "functions": 91.0, "branches": 78.2, "statements": 86.8 },
  "coverage_baseline": { "overall": 85.1 },
  "coverage_delta": 2.3,
  "coverage_regression": false,
  "test_execution": { "total": 42, "passed": 42, "failed": 0, "pending": 0 },
  "lint_results": { "errors": 0, "warnings": 3 },
  "test_cases": [...],
  "issues_found": [...],
  "recommendations": [...]
}
```

Quando bloqueado: `status: blocked_by_qa` com motivo detalhado (cobertura, regressão, issues críticas).

---

## Observabilidade

Todos os logs são emitidos em JSON estruturado com `pipelineId` e `executionId` em cada linha, prontos para ingestão no CloudWatch ou qualquer sistema de log centralizado:

```json
{
  "timestamp": "2026-04-13T12:00:00.000Z",
  "level": "info",
  "message": "Security check completed",
  "service": "pipeline-executor",
  "pipelineId": "pipeline-1234567890",
  "executionId": "exec-abc",
  "status": "approved_with_warnings"
}
```

Níveis disponíveis: `error`, `warn`, `info`, `debug` — controlados por `LOG_LEVEL` no `.env`.

---

## Persistência

O histórico de execuções é salvo em `data/executions/<pipelineId>.json` e recarregado automaticamente ao reiniciar o servidor. Os workspaces dos repositórios clonados ficam em `workspaces/`.

A documentação gerada por cada pipeline é salva em `docs/<pipelineId>/`:

```
docs/pipeline-1234567890/
├── 00-especificacao.md
├── 01-analise.md
├── 02-design-ux.md
├── 03-desenvolvimento.md
├── 04-code-review.md
├── 05-seguranca.md
├── 06-qa-testes.md
└── 07-devops.md
```

Todos os diretórios estão no `.gitignore`.

---

## Testes

```bash
npm test
```

Executa testes de integração cobrindo autenticação, health check, validação de body e estrutura de resposta dos endpoints principais. Não requer `OPENAI_API_KEY` — o teste do pipeline aceita retorno 500 quando a chave não está configurada no ambiente de testes.

---

## Estrutura do projeto

```
pipeline-executor/
├── server.js                  Servidor Express, rotas e middleware
├── orchestrator.js            Orquestrador do pipeline (8 estágios) e persistência
├── agents.js                  Agentes base (Analyst, Developer, QA, DevOps)
├── agents-spec.js             Spec Agent com carregamento de SKILL
├── agents-ux.js               UX/UI Agent com carregamento de SKILL
├── agents-code-review.js      Code Review Agent com loop de correção (max 2x)
├── agents-security.js         Security Agent — Privacy/Security by Design + LGPD
├── agents-documenter.js       Documenter Agent com carregamento de SKILL
├── qa-runner.js               QA Runner — executa testes reais, coleta cobertura e lint
├── skill-loader.js            Carrega e compõe system prompts a partir dos SKILLs
├── repository-manager.js      Clone, commit, branch e push via Git
├── repository-analyzer.js     Análise estática de repositórios (stack, moduleType, deps)
├── code-integrator.js         Integração do código gerado (schema files[] ou legado)
├── code-persister.js          Persistência dos outputs do pipeline
├── github-pr.js               Criação de Pull Requests via GitHub API
├── port-manager.js            Alocação dinâmica de portas por execução
├── dashboard-monitor.js       Rotas do dashboard de monitoramento
├── logger.js                  Logger JSON estruturado com correlation ID
├── retry.js                   Retry com backoff exponencial e timeout configurável
├── config/
│   └── documentation.config.js  Mapeamento de stages 0–7 para arquivos de documentação
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
