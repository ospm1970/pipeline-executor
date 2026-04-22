import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { RepositoryManager } from '../repository-manager.js';
import { PortManager } from '../port-manager.js';
import { getOpenAIClient, resetOpenAIClientForTests } from '../openai-client.js';

const TEST_API_KEY = 'test-key-pipeline-external-safe-change';
process.env.API_KEY = TEST_API_KEY;
process.env.PORT = '0';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const { default: app } = await import('../server.js');

let server;
let baseUrl;
let fixtureRepoPath;
const clonedReposByExecution = new Map();
const tempDirsToCleanup = new Set();

const originalCloneRepository = RepositoryManager.prototype.cloneRepository;
const originalAllocatePort = PortManager.prototype.allocatePort;

function writeText(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function copyDirectory(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function createFixtureRepository() {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-external-safe-change-'));
  tempDirsToCleanup.add(repoPath);

  writeText(path.join(repoPath, 'package.json'), JSON.stringify({
    name: 'pipeline-safe-change-fixture',
    version: '1.0.0',
    type: 'module',
    scripts: {
      test: 'node --test tests/existing-integrity.test.js tests/pipeline-safe-change.test.js',
    },
    dependencies: {},
  }, null, 2) + '\n');

  writeText(path.join(repoPath, 'package-lock.json'), JSON.stringify({
    name: 'pipeline-safe-change-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'pipeline-safe-change-fixture',
        version: '1.0.0',
      },
    },
  }, null, 2) + '\n');

  writeText(path.join(repoPath, 'server.js'), `import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
`);

  writeText(path.join(repoPath, 'public', 'page-config.js'), `export const HERO_TITLE = 'Casarcom Pipeline Smoke Original';

export function getHeroTitle() {
  return HERO_TITLE;
}
`);

  writeText(path.join(repoPath, 'public', 'index.html'), `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Casarcom Pipeline Smoke Original</title>
  </head>
  <body>
    <main>
      <h1 id="hero-title">Casarcom Pipeline Smoke Original</h1>
      <p id="hero-copy">Validação controlada do pipeline.</p>
    </main>
    <script type="module" src="./page-config.js"></script>
  </body>
</html>
`);

  writeText(path.join(repoPath, 'tests', 'existing-integrity.test.js'), `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getHeroTitle } from '../public/page-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('fixture mantém estrutura mínima da landing page', () => {
  assert.equal(typeof getHeroTitle(), 'string');
  assert.ok(getHeroTitle().length > 0);
  assert.match(html, /id="hero-title"/);
  assert.match(html, /page-config\.js/);
});
`);

  fs.mkdirSync(path.join(repoPath, 'node_modules'), { recursive: true });

  return repoPath;
}

function buildLLMSequence() {
  const updatedTitle = 'Casarcom Pipeline Smoke Validado';
  const updatedConfig = `export const HERO_TITLE = '${updatedTitle}';

export function getHeroTitle() {
  return HERO_TITLE;
}
`;

  const updatedHtml = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${updatedTitle}</title>
  </head>
  <body>
    <main>
      <h1 id="hero-title">${updatedTitle}</h1>
      <p id="hero-copy">Validação controlada do pipeline.</p>
    </main>
    <script type="module" src="./page-config.js"></script>
  </body>
</html>
`;

  const generatedTest = `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getHeroTitle } from '../public/page-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('pipeline aplicou alteração textual segura na landing page', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.equal(getHeroTitle(), '${updatedTitle}');
  assert.match(html, /${updatedTitle}/);
  assert.match(html, /Validação controlada do pipeline/);
});
`;

  return [
    JSON.stringify({
      feature_name: 'Validação ponta a ponta com alteração textual segura',
      description: 'Atualizar apenas o texto visível da landing page estática para validar o pipeline completo sem alterar comportamento funcional.',
      functional_requirements: [
        'Atualizar somente o título textual exibido em public/index.html e no arquivo público de configuração.',
        'Preservar a stack detectada Express com frontend estático.',
        'Não alterar endpoints, fluxo HTTP nem estrutura do servidor.',
      ],
      non_functional_requirements: [
        'Mudança mínima compatível.',
        'Sem impacto em privacidade, segurança ou observabilidade existente.',
        'Compatível com writeback estrutural em public/.',
      ],
      acceptance_criteria: [
        'A interface continua sendo servida a partir de public/.',
        'O texto novo aparece na landing page.',
        'Os testes automatizados passam com cobertura suficiente.',
      ],
    }),
    '# Especificação\n\nMudança textual mínima e segura para validar o pipeline completo.',
    JSON.stringify({
      requirement_summary: 'Executar o pipeline completo gerando apenas uma alteração textual segura na interface estática.',
      user_stories: [
        'Como mantenedor do pipeline, quero validar o fluxo completo com uma mudança inofensiva de conteúdo, para garantir integridade sem risco funcional.',
      ],
      technical_requirements: [
        'Preservar Express e frontend estático.',
        'Modificar apenas arquivos conectados a public/.',
        'Manter testes existentes e adicionar regressão de smoke para o novo texto.',
      ],
      risks: [
        'Mudança fora dos entrypoints reais deve ser evitada.',
      ],
      acceptance_criteria: [
        'Writeback aprovado em arquivos de UI reais.',
        'QA runner executado com sucesso.',
      ],
    }),
    '# Análise\n\nA estratégia é aplicar uma alteração textual mínima em arquivos públicos já conectados ao runtime.',
    JSON.stringify({
      design_summary: 'Nenhuma mudança estrutural de UX; apenas substituição de texto em tela existente.',
      screens: [
        {
          name: 'landing-page',
          changes: ['Atualizar o título principal sem alterar layout, hierarquia visual ou navegação.'],
        },
      ],
      accessibility_notes: ['A alteração não modifica contraste, semântica nem foco.'],
    }),
    '# UX\n\nA experiência permanece idêntica; apenas o texto principal da página é atualizado.',
    JSON.stringify({
      language: 'javascript',
      implementation_summary: 'Atualiza somente o texto da landing page estática e adiciona um teste de regressão para garantir a integridade do pipeline.',
      code_quality_score: 95,
      files: [
        {
          path: 'public/page-config.js',
          content: updatedConfig,
        },
        {
          path: 'public/index.html',
          content: updatedHtml,
        },
      ],
      tests: [
        {
          path: 'tests/pipeline-safe-change.test.js',
          content: generatedTest,
        },
      ],
      dependencies: [],
      security_notes: 'Nenhuma credencial, dado sensível ou fluxo de autenticação foi alterado.',
      privacy_notes: 'Nenhum tratamento de dado pessoal foi alterado.',
      observability_notes: ['Mudança de conteúdo estático sem impacto em logs, métricas ou tracing.'],
    }),
    '# Desenvolvimento\n\nA alteração foi limitada a arquivos públicos já servidos pelo projeto e a um teste de regressão de smoke.',
    JSON.stringify({
      approved: true,
      blocking_issues: [],
      warnings: [],
      corrected_files: [],
      review_summary: 'A mudança respeita a stack Express com frontend estático e mantém alteração mínima compatível.',
      quality_score: 96,
    }),
    '# Code Review\n\nA mudança foi aprovada por aderência à stack e baixo risco estrutural.',
    JSON.stringify({
      security_status: 'approved',
      privacy_by_design: { issues: [] },
      security_by_design: { issues: [] },
      vulnerabilities: [],
      lgpd_compliance: { issues: [] },
      approved: true,
      recommendations: ['Registrar a alteração como smoke test seguro do pipeline.'],
    }),
    '# Segurança\n\nNão foram identificados achados bloqueantes; a mudança é textual e não altera superfícies sensíveis.',
    JSON.stringify({
      approved: true,
      test_cases: [
        'Validar que public/index.html exibe o novo título sem alterar estrutura nem endpoints.',
        'Validar que public/page-config.js expõe o mesmo título atualizado.',
      ],
      coverage_percentage: 100,
      coverage_regression: false,
      issues_found: [],
      recommendations: ['Manter este cenário como regressão de baixa criticidade e alto valor de integridade.'],
    }),
    '# QA\n\nOs testes cobrem a alteração textual segura e preservam a integridade do projeto.',
    JSON.stringify({
      deployment_steps: [
        'Publicar a alteração textual em ambiente controlado.',
        'Validar o conteúdo final da landing page após o writeback.',
      ],
      environment: 'staging',
      health_checks: [
        'Verificar que a landing page continua acessível.',
        'Confirmar que o texto esperado está presente no HTML final.',
      ],
      rollback_plan: [
        'Restaurar public/index.html e public/page-config.js a partir do backup criado pelo writeback.',
      ],
      estimated_deployment_time_minutes: 5,
      deployment_approved: true,
    }),
    '# DevOps\n\nO plano de publicação é trivial e o rollback consiste em restaurar os arquivos públicos alterados.',
  ];
}

function installMockOpenAIClient(llmSequence) {
  resetOpenAIClientForTests();
  const client = getOpenAIClient('Teste end-to-end');
  client.chat = {
    completions: {
      create: async () => {
        assert.ok(llmSequence.length > 0, 'O mock de respostas do modelo foi consumido antes do término do pipeline.');
        return {
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: process.env.OPENAI_MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: llmSequence.shift(),
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 100,
            total_tokens: 200,
          },
        };
      },
    },
  };
}

before(async () => {
  fixtureRepoPath = createFixtureRepository();

  RepositoryManager.prototype.cloneRepository = async function cloneRepositoryStub(_repoUrl, executionId) {
    const workspacePath = this.createWorkspace(executionId);
    const repoPath = path.join(workspacePath, 'repo');
    copyDirectory(fixtureRepoPath, repoPath);
    clonedReposByExecution.set(executionId, repoPath);
    tempDirsToCleanup.add(workspacePath);
    return repoPath;
  };

  PortManager.prototype.allocatePort = async function allocatePortStub() {
    return 3999;
  };

  installMockOpenAIClient(buildLLMSequence());

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  RepositoryManager.prototype.cloneRepository = originalCloneRepository;
  PortManager.prototype.allocatePort = originalAllocatePort;
  resetOpenAIClientForTests();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  for (const tempDir of tempDirsToCleanup) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignora erros de limpeza
    }
  }
});

test('POST /api/pipeline/external executa o pipeline completo com mudança textual segura e preserva a integridade do repositório', async () => {
  const response = await fetch(`${baseUrl}/api/pipeline/external`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEST_API_KEY,
    },
    body: JSON.stringify({
      repositoryUrl: 'https://github.com/exemplo/pipeline-safe-change-fixture',
      requirement: 'Atualize apenas o texto principal da landing page para validar o pipeline completo sem alterar comportamento, estrutura ou endpoints do projeto.',
      autoCommit: false,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.status, 'completed');
  assert.equal(body.autoCommit.enabled, false);
  assert.equal(body.autoCommit.committed, false);
  assert.equal(body.autoCommit.pushed, false);
  assert.ok(['nodejs', 'nodejs-express'].includes(body.repository.type));

  const repoPath = clonedReposByExecution.get(body.executionId);
  assert.ok(repoPath, 'O teste precisa localizar o repositório preparado para a execução.');

  const htmlPath = path.join(repoPath, 'public', 'index.html');
  const pageConfigPath = path.join(repoPath, 'public', 'page-config.js');
  const generatedTestPath = path.join(repoPath, 'tests', 'pipeline-safe-change.test.js');
  const serverPath = path.join(repoPath, 'server.js');
  const writebackValidationPath = path.join(repoPath, 'pipeline-output', 'writeback-validation.json');
  const summaryPath = path.join(repoPath, 'pipeline-output', 'pipeline-summary.json');
  const qaStagePath = path.join(repoPath, 'pipeline-output', 'qa.json');

  assert.match(fs.readFileSync(htmlPath, 'utf8'), /Casarcom Pipeline Smoke Validado/);
  assert.match(fs.readFileSync(pageConfigPath, 'utf8'), /Casarcom Pipeline Smoke Validado/);
  assert.ok(fs.existsSync(generatedTestPath), 'O teste de regressão gerado deve ser persistido no repositório alvo.');
  assert.match(fs.readFileSync(serverPath, 'utf8'), /express\.static/);

  assert.ok(fs.existsSync(writebackValidationPath), 'A validação estrutural de writeback deve ser persistida.');
  assert.ok(fs.existsSync(summaryPath), 'O resumo do pipeline deve ser persistido.');
  assert.ok(fs.existsSync(qaStagePath), 'A evidência estruturada do estágio de QA deve ser persistida.');

  const writebackValidation = JSON.parse(fs.readFileSync(writebackValidationPath, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const qaStage = JSON.parse(fs.readFileSync(qaStagePath, 'utf8'));

  assert.equal(writebackValidation.compatible, true);
  assert.ok(writebackValidation.validatedPaths.includes('public/index.html'));
  assert.ok(writebackValidation.validatedPaths.includes('public/page-config.js'));

  assert.equal(summary.status, 'completed');
  assert.ok(summary.completedAt, 'Execuções completas devem registrar completedAt.');
  assert.deepEqual(
    [...summary.stages.map((stage) => stage.name)].sort(),
    ['specification', 'analysis', 'ux_design', 'development', 'code_review', 'security', 'qa', 'writeback_validation', 'deployment'].sort()
  );

  assert.equal(qaStage.gatewayStatus, 'approved');
  assert.equal(qaStage.result.approved, true);
  assert.ok(qaStage.result.coverage_percentage >= 80);
  assert.ok(qaStage.result.test_execution?.success === true || qaStage.result.evidence_real === true);

  const docsDir = path.join(path.dirname(repoPath), '..', '..', 'docs', body.pipelineId);
  assert.ok(fs.existsSync(docsDir), 'A documentação de cada estágio deve ser gerada para o pipeline executado.');
  assert.ok(fs.existsSync(path.join(docsDir, '00-especificacao.md')));
  assert.ok(fs.existsSync(path.join(docsDir, '07-devops.md')));
});
