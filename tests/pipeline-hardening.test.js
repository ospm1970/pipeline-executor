import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { sanitizeGitUrl } from '../repository-manager.js';
import { CodePersister } from '../code-persister.js';
import QARunner from '../qa-runner.js';
import RepositoryAnalyzer from '../repository-analyzer.js';
import { assessStackAdherence, normalizeCodeReviewResult, deriveSecurityGatewayOutcome, applyDeterministicReviewGuards, deriveQAGatewayDecision, finalizeExecutionTerminalState } from '../orchestrator.js';
import { buildDeveloperPrompt, buildQAStackGuidance } from '../agents.js';
import { buildReviewInput, buildReviewGuidance } from '../agents-code-review.js';
import { normalizeSecurityAgentResult } from '../agents-security.js';
import { validateWriteback } from '../writeback-validator.js';
import { CodeIntegrator } from '../code-integrator.js';

test('sanitizeGitUrl mascara tokens em URLs autenticadas', () => {
  const sanitized = sanitizeGitUrl('https://ghp_secret123@github.com/org/repo');
  assert.equal(sanitized, 'https://***@github.com/org/repo');
});

test('agentes críticos usam getOpenAIClient centralizado com identificação explícita do agente', () => {
  const criticalAgents = [
    '../agents.js',
    '../agents-code-review.js',
    '../agents-security.js',
    '../agents-spec.js',
    '../agents-documenter.js',
    '../agents-ux.js',
  ];

  for (const relativeModulePath of criticalAgents) {
    const source = fs.readFileSync(new URL(relativeModulePath, import.meta.url), 'utf8');

    assert.doesNotMatch(source, /[^\w]openai\.chat\.completions\.create\(/, `${relativeModulePath} ainda usa referência solta a openai.chat.completions.create`);
    assert.match(source, /getOpenAIClient\('\s*[^']+\s*'\)\.chat\.completions\.create\(/, `${relativeModulePath} deve chamar getOpenAIClient com o nome do agente`);
  }

  const openAIClientSource = fs.readFileSync(new URL('../openai-client.js', import.meta.url), 'utf8');
  assert.match(openAIClientSource, /export function getOpenAIClient\(/);
});

test('módulos de agentes importam o utilitário compartilhado e não declaram clientes OpenAI locais', () => {
  const agentModules = [
    '../agents.js',
    '../agents-code-review.js',
    '../agents-security.js',
    '../agents-spec.js',
    '../agents-documenter.js',
    '../agents-ux.js',
  ];

  for (const relativeModulePath of agentModules) {
    const source = fs.readFileSync(new URL(relativeModulePath, import.meta.url), 'utf8');

    assert.match(source, /from '\.\/openai-client\.js'/, `${relativeModulePath} deve importar o utilitário compartilhado`);
    assert.doesNotMatch(source, /new\s+OpenAI\s*\(/, `${relativeModulePath} não deve instanciar OpenAI localmente`);
    assert.doesNotMatch(source, /function\s+getOpenAIClient\s*\(/, `${relativeModulePath} não deve redeclarar getOpenAIClient localmente`);
  }

  const declarations = [
    '../openai-client.js',
    ...agentModules,
  ].map((relativeModulePath) => ({
    relativeModulePath,
    source: fs.readFileSync(new URL(relativeModulePath, import.meta.url), 'utf8'),
  }));

  const modulesWithLocalFactory = declarations
    .filter(({ source }) => /function\s+getOpenAIClient\s*\(/.test(source))
    .map(({ relativeModulePath }) => relativeModulePath);

  assert.deepEqual(modulesWithLocalFactory, ['../openai-client.js']);
});

test('assessStackAdherence bloqueia NestJS e frontend React quando o repositório detectado é Express', () => {
  const result = assessStackAdherence(
    {
      type: 'nodejs-express',
      stackProfile: { backendFramework: 'express', frontendFramework: 'none', frontendType: 'none', repoShape: 'single-app' },
    },
    {
      files: [
        { path: 'src/avaliacoes/avaliacoes.module.ts', content: 'export class AvaliacoesModule {}' },
        { path: 'src/frontend/components/AvaliacaoNota.tsx', content: 'export function AvaliacaoNota() { return null; }' },
      ],
    },
    'feature'
  );

  assert.equal(result.compatible, false);
  assert.ok(result.detectedPatterns.includes('nestjs'));
  assert.ok(result.detectedPatterns.includes('frontend-react'));
  assert.ok(result.issues.length >= 2);
  assert.ok(result.offendingFiles.includes('src/avaliacoes/avaliacoes.module.ts'));
  assert.ok(result.offendingFiles.includes('src/frontend/components/AvaliacaoNota.tsx'));
});

test('buildDeveloperPrompt força aderência à stack Express e mudança mínima compatível', () => {
  const prompt = buildDeveloperPrompt(JSON.stringify({
    analysis: { user_stories: ['avaliar frases'], technical_requirements: ['criar endpoint incremental'] },
    repositoryContext: {
      projectType: 'nodejs-express',
      fileCount: 6,
      stackConstraints: {
        preserveDetectedStack: true,
        allowCrossStackGenerationOnlyForMigration: true,
      },
    },
  }), 'feature');

  assert.match(prompt, /nodejs-express/);
  assert.match(prompt, /Use apenas padrões compatíveis com Express/);
  assert.match(prompt, /Não gere módulos, decorators, pipes, guards, exceptions, DTOs ou estrutura típica de NestJS/);
  assert.match(prompt, /Não gere arquivos \.tsx\/.jsx, pastas frontend\/components nem qualquer camada React/);
  assert.match(prompt, /mudança incremental compatível/);
  assert.match(prompt, /Justificativa arquitetural:/);
});

test('normalizeCodeReviewResult rebaixa review aprovado quando existem blocking_issues', () => {
  const normalized = normalizeCodeReviewResult({
    approved: true,
    quality_score: 92,
    blocking_issues: [
      'A stack detectada no repositório é nodejs-express, mas o código gerado inclui frontend React/TSX fora de um fluxo de migração ou expansão explicitamente justificado.',
      '  ',
    ],
    warnings: ['ajuste recomendado'],
  });

  assert.equal(normalized.approved, false);
  assert.equal(normalized.review_status, 'blocked');
  assert.deepEqual(normalized.blocking_issues, [
    'A stack detectada no repositório é nodejs-express, mas o código gerado inclui frontend React/TSX fora de um fluxo de migração ou expansão explicitamente justificado.',
  ]);
});

test('applyDeterministicReviewGuards rebaixa review aprovado quando a validação determinística de stack encontra incompatibilidade', () => {
  const guarded = applyDeterministicReviewGuards(
    {
      approved: true,
      quality_score: 93,
      blocking_issues: [],
      warnings: [],
    },
    { type: 'nodejs-express' },
    {
      files: [
        { path: 'src/frontend/App.tsx', content: 'export default function App() { return null; }' },
      ],
    },
    'feature'
  );

  assert.equal(guarded.reviewResult.approved, false);
  assert.equal(guarded.reviewResult.review_status, 'blocked');
  assert.ok(guarded.reviewResult.blocking_issues.some(issue => issue.includes('nodejs-express')));
  assert.ok(guarded.stackAssessment.offendingFiles.includes('src/frontend/App.tsx'));
});

test('normalizeCodeReviewResult preserva aprovação quando não existem blocking_issues', () => {
  const normalized = normalizeCodeReviewResult({
    approved: true,
    quality_score: 92,
    blocking_issues: [],
    warnings: ['ajuste recomendado'],
  });

  assert.equal(normalized.approved, true);
  assert.equal(normalized.review_status, 'approved');
  assert.deepEqual(normalized.blocking_issues, []);
});

test('assessStackAdherence bloqueia frontend React em repositório com frontend estático', () => {
  const result = assessStackAdherence(
    {
      type: 'nodejs-express',
      stackProfile: { backendFramework: 'express', frontendFramework: 'none', frontendType: 'static-web', repoShape: 'single-app' },
    },
    {
      files: [
        { path: 'src/components/App.tsx', content: 'export function App() { return null; }' },
      ],
    },
    'feature'
  );

  assert.equal(result.compatible, false);
  assert.ok(result.issues.some(issue => issue.includes('frontend estático')));
  assert.ok(result.offendingFiles.includes('src/components/App.tsx'));
});

test('buildReviewGuidance usa stackProfile para orientar monorepo Next.js/NestJS sem critérios de stack incorreta', () => {
  const guidance = buildReviewGuidance(
    {
      projectType: 'nestjs',
      fileCount: 18,
      stackProfile: {
        backendFramework: 'nestjs',
        frontendFramework: 'nextjs',
        frontendType: 'ssr-web',
        repoShape: 'monorepo',
      },
    },
    'feature'
  );

  assert.match(guidance, /backend detectado usa NestJS/);
  assert.match(guidance, /Next\.js\/SSR/);
  assert.match(guidance, /monorepo/);
});

test('buildReviewInput orienta o Code Review a usar critérios compatíveis com Express', () => {
  const input = buildReviewInput(
    {
      implementation_summary: 'Implementação incremental do endpoint.',
      files: [{ path: 'src/routes/ratings.js', content: 'export default function handler() {}' }],
    },
    {
      projectType: 'nodejs-express',
      fileCount: 4,
      stackProfile: { backendFramework: 'express', frontendFramework: 'none', frontendType: 'static-web', repoShape: 'single-app' },
      changePolicy: { mode: 'minimal-compatible' },
    },
    'feature'
  );

  assert.match(input, /Não exija decorators, modules, pipes, guards, DTOs, HttpException ou filtros de exceção NestJS/);
  assert.match(input, /critérios compatíveis com Express/);
  assert.match(input, /frontend detectado é estático/);
  assert.match(input, /mudança incremental compatível/);
  assert.match(input, /Justificativa arquitetural:/);
});

test('buildQAStackGuidance adapta critérios mínimos para backend Express com frontend estático', () => {
  const guidance = buildQAStackGuidance({
    projectType: 'nodejs-express',
    stackProfile: {
      backendFramework: 'express',
      frontendFramework: 'none',
      frontendType: 'static-web',
      repoShape: 'single-app',
    },
  }, 'feature');

  assert.match(guidance, /backend Express\/API/);
  assert.match(guidance, /frontend detectado é estático/);
  assert.match(guidance, /não bloqueie por ausência de testes de componente SPA/);
  assert.match(guidance, /baseline de cobertura existente/);
});

test('buildQAStackGuidance adapta critérios mínimos para monorepo Next.js', () => {
  const guidance = buildQAStackGuidance({
    projectType: 'nextjs',
    stackProfile: {
      backendFramework: 'none',
      frontendFramework: 'nextjs',
      frontendType: 'ssr-web',
      repoShape: 'monorepo',
    },
  }, 'feature');

  assert.match(guidance, /Next\.js\/SSR/);
  assert.match(guidance, /monorepo/);
  assert.doesNotMatch(guidance, /backend Express\/API/);
});

test('deriveQAGatewayDecision aprova por evidência determinística quando o runner passou com cobertura suficiente e sem issues bloqueantes', () => {
  const decision = deriveQAGatewayDecision(
    {
      approved: false,
      coverage_percentage: 98.03,
      coverage_regression: false,
      issues_found: ['Recomendação de ampliar testes de borda não crítica'],
    },
    {
      ran: true,
      coverage: { overall: 98.03 },
      testResults: { total: 41, passed: 41, failed: 0 },
    },
    80
  );

  assert.equal(decision.qaApproved, true);
  assert.equal(decision.llmApproved, false);
  assert.equal(decision.deterministicPass, true);
  assert.equal(decision.hasBlockingIssues, false);
});

test('deriveQAGatewayDecision bloqueia quando existem issues altas mesmo com cobertura suficiente', () => {
  const decision = deriveQAGatewayDecision(
    {
      approved: false,
      coverage_percentage: 98.03,
      coverage_regression: false,
      issues_found: [{ severity: 'high', description: 'Fluxo crítico sem teste de integração' }],
    },
    {
      ran: true,
      coverage: { overall: 98.03 },
      testResults: { total: 41, passed: 41, failed: 0 },
    },
    80
  );

  assert.equal(decision.qaApproved, false);
  assert.equal(decision.hasHighIssues, true);
  assert.equal(decision.hasBlockingIssues, true);
  assert.match(decision.reason, /Issues altas ou críticas/);
});

test('normalizeSecurityAgentResult documenta vulnerabilidades sem reprovar o estágio', () => {
  const normalized = normalizeSecurityAgentResult({
    approved: false,
    security_status: 'blocked',
    block_reason: '1 vulnerabilidade alta encontrada',
    vulnerabilities: [
      { severity: 'high', category: 'authentication', description: 'Token sem rotação' },
      { severity: 'medium', category: 'logging', description: 'Log com contexto excessivo' },
    ],
    recommendations: [
      { priority: 'Alta', recommendation: 'Habilitar rotação de token' },
    ],
  });

  assert.equal(normalized.approved, true);
  assert.equal(normalized.security_status, 'approved_with_warnings');
  assert.equal(normalized.block_reason, null);
  assert.equal(normalized.documentation_required, true);
  assert.equal(normalized.vulnerabilities.length, 2);
});

test('deriveSecurityGatewayOutcome registra achados sem bloquear o pipeline', () => {
  const outcome = deriveSecurityGatewayOutcome({
    approved: false,
    security_status: 'blocked',
    vulnerabilities: [
      { severity: 'high', category: 'authentication', description: 'Token sem rotação' },
    ],
  });

  assert.equal(outcome.approved, true);
  assert.equal(outcome.gatewayStatus, 'approved_with_warnings');
  assert.equal(outcome.gatewayReason, null);
  assert.equal(outcome.hasWarnings, true);
  assert.match(outcome.summary, /documentados sem bloqueio automático/);
  assert.equal(outcome.highlightedFindings.length, 1);
  assert.equal(outcome.documented_findings.length, 1);
});

test('finalizeExecutionTerminalState marca execução bloqueada como encerrada', () => {
  const execution = {
    status: 'running',
    createdAt: new Date('2026-04-21T11:00:00.000Z'),
    completedAt: null,
  };

  const finalized = finalizeExecutionTerminalState(execution, 'blocked_by_qa', 'Cobertura insuficiente');

  assert.equal(finalized.status, 'blocked_by_qa');
  assert.equal(finalized.error, 'Cobertura insuficiente');
  assert.ok(finalized.completedAt instanceof Date);
});

test('finalizeExecutionTerminalState preserva completedAt existente', () => {
  const completedAt = new Date('2026-04-21T11:05:00.000Z');
  const execution = {
    status: 'running',
    createdAt: new Date('2026-04-21T11:00:00.000Z'),
    completedAt,
  };

  const finalized = finalizeExecutionTerminalState(execution, 'completed');

  assert.equal(finalized.status, 'completed');
  assert.equal(finalized.completedAt, completedAt);
});

test('QARunner.compactCommandOutput preserva o rodapé com resumo e cobertura', () => {
  const longOutput = `${'A'.repeat(7000)}\nℹ tests 41\nℹ pass 41\nℹ fail 0\nℹ start of coverage report\nℹ all files                               |  98.46 |    96.65 |   98.82 |\nℹ end of coverage report`;
  const compacted = QARunner.compactCommandOutput(longOutput, 6000);

  assert.match(compacted, /ℹ tests 41/);
  assert.match(compacted, /all files\s+\|\s+98\.46/);
  assert.match(compacted, /end of coverage report/);
});

test('QARunner detecta npm como package manager quando o projeto possui package-lock.json', () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-qa-package-manager-'));
  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({ name: 'pkg-manager-test', version: '1.0.0' }, null, 2));
  fs.writeFileSync(path.join(repoPath, 'package-lock.json'), JSON.stringify({ name: 'pkg-manager-test', lockfileVersion: 3 }, null, 2));

  assert.equal(QARunner.detectPackageManager(repoPath), 'npm');
  assert.equal(QARunner.buildInstallCommand('npm'), 'npm ci');
});

test('QARunner identifica quando precisa instalar dependências no ambiente temporário', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-qa-install-needed-temp-'));

  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'install-needed', version: '1.0.0' }, null, 2));
  fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify({ name: 'install-needed', lockfileVersion: 3 }, null, 2));

  assert.equal(QARunner.shouldInstallDependencies(tempDir), true);
  fs.mkdirSync(path.join(tempDir, 'node_modules'), { recursive: true });
  assert.equal(QARunner.shouldInstallDependencies(tempDir), false);
});

test('validateWriteback bloqueia entrypoint paralelo quando o runtime real está na raiz do repositório', { concurrency: false }, async () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-writeback-validator-block-'));
  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({
    name: 'gera-like',
    type: 'module',
    scripts: { start: 'node server.js' },
    dependencies: { express: '^5.0.0' },
  }, null, 2));
  fs.writeFileSync(path.join(repoPath, 'server.js'), "import express from 'express';\nconst app = express();\napp.listen(3000);\n");
  fs.mkdirSync(path.join(repoPath, 'public'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'public', 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(repoPath, 'public', 'app.js'), 'console.log("ok");');

  const repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(repoPath);

  const result = validateWriteback({
    repoPath,
    repositoryAnalysis,
    generatedCode: {
      files: [
        { path: 'src/server.js', content: 'export const detached = true;' },
        { path: 'src/public/phrases-rating.html', content: '<html></html>' },
      ],
      tests: [],
    },
    requirement: 'Adicionar avaliação de frases',
    triggerType: 'feature',
  });

  assert.equal(result.compatible, false);
  assert.equal(result.severity, 'blocked');
  assert.ok(result.pathMismatches.some(item => item.generatedPath === 'src/server.js'));
  assert.ok(result.missingConnections.some(item => item.type === 'ui-runtime'));
});

test('validateWriteback aprova mudança conectada aos entrypoints reais detectados', { concurrency: false }, async () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-writeback-validator-approve-'));
  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({
    name: 'gera-like-ok',
    type: 'module',
    scripts: { start: 'node server.js' },
    dependencies: { express: '^5.0.0' },
  }, null, 2));
  fs.writeFileSync(path.join(repoPath, 'server.js'), "import express from 'express';\nconst app = express();\napp.listen(3000);\n");
  fs.mkdirSync(path.join(repoPath, 'public'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'public', 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(repoPath, 'public', 'app.js'), 'console.log("ok");');

  const repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(repoPath);

  const result = validateWriteback({
    repoPath,
    repositoryAnalysis,
    generatedCode: {
      files: [
        { path: 'server.js', content: "import express from 'express';\nconst app = express();\napp.get('/ratings', () => {});\n" },
        { path: 'public/app.js', content: 'console.log("rating feature");' },
      ],
      tests: [
        { path: 'test/ratings.test.js', content: "import test from 'node:test';\n" },
      ],
    },
    requirement: 'Adicionar avaliação de frases',
    triggerType: 'feature',
  });

  assert.equal(result.compatible, true);
  assert.equal(result.severity, 'approved');
  assert.ok(result.entrypointConnections.some(item => item.path === 'server.js'));
  assert.ok(result.entrypointConnections.some(item => item.path === 'public/app.js'));
  assert.ok(result.validatedPaths.includes('test/ratings.test.js'));
});

test('CodeIntegrator integra apenas caminhos validados pelo gateway estrutural', { concurrency: false }, async () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-writeback-integrator-'));
  fs.writeFileSync(path.join(repoPath, 'server.js'), 'console.log("root");\n');
  fs.mkdirSync(path.join(repoPath, 'public'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'public', 'app.js'), 'console.log("ui");\n');

  const integration = await CodeIntegrator.integrateIntoRepository(
    repoPath,
    {
      files: [
        { path: 'server.js', content: 'console.log("changed");\n' },
        { path: 'src/server.js', content: 'console.log("detached");\n' },
      ],
      tests: [],
    },
    'javascript',
    { validatedPaths: ['server.js'] }
  );

  assert.equal(integration.success, true);
  assert.equal(integration.filesModified, 1);
  assert.ok(fs.existsSync(path.join(repoPath, 'server.js')));
  assert.equal(fs.existsSync(path.join(repoPath, 'src', 'server.js')), false);
  assert.equal(integration.integrationDecision, 'validated_paths_only');
});

test('persistPipelineOutput grava também code_review e security', async () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-persister-'));
  const execution = {
    requirement: 'test',
    status: 'completed',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    stages: {
      specification: { status: 'completed', duration: '1ms' },
      analysis: { status: 'completed', duration: '1ms' },
      ux_design: { status: 'completed', duration: '1ms' },
      development: { status: 'completed', duration: '1ms' },
      code_review: { status: 'completed', duration: '1ms' },
      security: { status: 'completed', duration: '1ms' },
      qa: { status: 'completed', duration: '1ms' },
      deployment: { status: 'completed', duration: '1ms' },
    },
  };

  const result = await CodePersister.persistPipelineOutput(repoPath, execution);

  assert.equal(result.success, true);
  assert.ok(fs.existsSync(path.join(repoPath, 'pipeline-output', 'code_review.json')));
  assert.ok(fs.existsSync(path.join(repoPath, 'pipeline-output', 'security.json')));
});

test('QARunner detecta node-test, considera testes existentes e novos e coleta cobertura real', async () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-qa-node-test-'));

  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({
    name: 'qa-runner-node-test',
    version: '1.0.0',
    type: 'module',
    scripts: {
      test: 'node --test',
    },
  }, null, 2));

  fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repoPath, 'src', 'math.js'),
    'export function multiply(a, b) { return a * b; }\n',
    'utf-8'
  );
  fs.writeFileSync(
    path.join(repoPath, 'src', 'math.test.js'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { multiply } from './math.js';\n\ntest('multiply existing', () => {\n  assert.equal(multiply(2, 3), 6);\n});\n",
    'utf-8'
  );

  const generatedCode = {
    files: [
      {
        path: 'src/sum.js',
        content: 'export function sum(a, b) { return a + b; }\n',
      },
      {
        path: 'src/sum.test.js',
        content: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.js';\n\ntest('sum generated', () => {\n  assert.equal(sum(1, 2), 3);\n});\n",
      },
    ],
    tests: [],
  };

  const framework = QARunner.detectTestFramework(repoPath);
  const existingTestFiles = QARunner.findTestFiles(repoPath)
    .map(file => path.relative(repoPath, file).replace(/\\/g, '/'));
  const tempDir = QARunner.prepareEnvironment(repoPath, generatedCode);

  try {
    const run = QARunner.executeTests(tempDir, framework);
    const parsedTests = QARunner.parseTestResults(tempDir, framework, run.output);
    const parsedCoverage = QARunner.parseCoverageSummary(tempDir, framework, run.output);

    assert.equal(framework, 'node-test');
    assert.ok(existingTestFiles.includes('src/math.test.js'));
    assert.ok(generatedCode.files.some(file => file.path === 'src/sum.test.js'));
    assert.equal(run.success, true);
    assert.ok(parsedTests);
    assert.equal(parsedTests.success, true);
  } finally {
    QARunner.cleanup(tempDir);
  }
});
