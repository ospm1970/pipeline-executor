import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

import { executePipeline } from '../orchestrator.js';
import QARunner from '../qa-runner.js';
import DocumenterAgentWithSkill from '../agents-documenter.js';
import { getOpenAIClient, resetOpenAIClientForTests } from '../openai-client.js';

const originalQARunnerRun = QARunner.run;
const originalGenerateAndSaveDocumentation = DocumenterAgentWithSkill.prototype.generateAndSaveDocumentation;
const originalGenerateIndexDocument = DocumenterAgentWithSkill.prototype.generateIndexDocument;
const tempDirsToCleanup = new Set();

function buildChatCompletion(content) {
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
          content,
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
}

function installMockOpenAISequence(sequence, capturedPayloads) {
  resetOpenAIClientForTests();
  const client = getOpenAIClient('Teste integração loop QA-Developer');
  client.chat = {
    completions: {
      create: async (payload) => {
        capturedPayloads.push(payload);
        assert.ok(sequence.length > 0, 'O mock do modelo foi consumido antes do término do pipeline.');
        return buildChatCompletion(sequence.shift());
      },
    },
  };
}

function createFixtureRepository() {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-qa-loop-'));
  tempDirsToCleanup.add(repoPath);

  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({
    name: 'pipeline-qa-loop-fixture',
    version: '1.0.0',
    type: 'module',
    scripts: {
      test: 'node --test'
    }
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(repoPath, 'server.js'), `import express from 'express';
const app = express();
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
export default app;
`, 'utf8');

  fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'src', 'message.js'), 'export function getMessage() { return "original"; }\n', 'utf8');

  fs.mkdirSync(path.join(repoPath, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'tests', 'existing.test.js'), `import test from 'node:test';
import assert from 'node:assert/strict';

test('sanity', () => {
  assert.equal(1, 1);
});
`, 'utf8');

  return repoPath;
}

function buildLLMSequence() {
  return [
    JSON.stringify({
      metadata: { generated_at: '2026-04-21T00:00:00.000Z' },
      specification: {
        title: 'Implementar loop QA para Developer',
        description: 'Adicionar retrabalho automático quando o QA bloquear a entrega.',
        objectives: ['Retentar desenvolvimento após bloqueio do QA'],
      },
      principles: ['Security by Design', 'Privacy by Design'],
      technical_plan: { retries: 2 },
      task_breakdown: ['Gerar código', 'Validar QA', 'Retornar ao desenvolvimento se necessário'],
      success_criteria: ['Pipeline aprova na segunda iteração após bloqueio inicial de QA'],
    }),
    JSON.stringify({
      user_stories: ['Como time de engenharia, quero que o pipeline retorne ao desenvolvimento quando o QA bloquear a entrega.'],
      technical_requirements: ['Executar loop QA → Developer com limite de iterações.'],
      estimated_effort_hours: 4,
      risks: ['Loop infinito caso não exista limite de iterações.'],
      acceptance_criteria: ['Quando QA bloquear, o developer deve ser chamado novamente.'],
    }),
    JSON.stringify({
      user_journey: { personas: ['engenharia'], key_flows: ['ajuste após QA'], friction_points: [] },
      information_architecture: { hierarchy: 'simples', navigation: ['pipeline'], categorization: ['qa', 'developer'] },
      layout_structure: { type: 'single-column', components: ['timeline'], responsive: { mobile: 'ok', tablet: 'ok', desktop: 'ok' } },
      design_system: { typography: 'system', colors: 'neutral', spacing: '8px', components: ['badge'] },
      accessibility: { wcag_level: 'AA', keyboard_nav: 'suportado', screen_reader: 'suportado', contrast_ratio: '4.5:1' },
      interactions: { states: ['default', 'error', 'success'], animations: 'mínimas', loading_state: 'skeleton', empty_state: 'mensagem' },
    }),
    JSON.stringify({
      implementation_summary: 'Primeira implementação sem testes suficientes para manter a cobertura.',
      files: [
        { path: 'src/message.js', content: 'export function getMessage() { return "primeira-iteracao"; }\n' },
      ],
      tests: [
        { path: 'tests/message.test.js', content: 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("mensagem inicial", () => { assert.equal(true, true); });\n' },
      ],
      code_quality_score: 81,
      dependencies: [],
    }),
    JSON.stringify({
      approved: true,
      blocking_issues: [],
      warnings: ['Cobertura pode ser insuficiente para o baseline.'],
      corrected_files: [],
      review_summary: 'Mudança pequena e compatível com a stack Express.',
      quality_score: 93,
    }),
    JSON.stringify({
      security_status: 'approved',
      privacy_by_design: ['Nenhum dado sensível alterado.'],
      security_by_design: ['Sem expansão de superfície de ataque.'],
      vulnerabilities: [],
      lgpd_compliance: ['Sem impacto em tratamento de dados pessoais.'],
      approved: true,
      recommendations: ['Manter logs estruturados na execução do pipeline.'],
    }),
    JSON.stringify({
      test_cases: ['Executar o pipeline completo', 'Verificar bloqueio por regressão de cobertura'],
      issues_found: [],
      coverage_percentage: 78,
      approved: false,
      recommendations: ['Adicionar testes para recuperar a cobertura baseline.'],
    }),
    JSON.stringify({
      implementation_summary: 'Segunda implementação com testes adicionais após feedback do QA.',
      files: [
        { path: 'src/message.js', content: 'export function getMessage() { return "segunda-iteracao"; }\n' },
      ],
      tests: [
        { path: 'tests/message.test.js', content: 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { getMessage } from "../src/message.js";\ntest("mensagem atualizada", () => { assert.equal(getMessage(), "segunda-iteracao"); });\n' },
        { path: 'tests/message-extra.test.js', content: 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("cobertura adicional", () => { assert.ok(true); });\n' },
      ],
      code_quality_score: 92,
      dependencies: [],
    }),
    JSON.stringify({
      approved: true,
      blocking_issues: [],
      warnings: [],
      corrected_files: [],
      review_summary: 'Segunda iteração aprovada após reforço de testes.',
      quality_score: 96,
    }),
    JSON.stringify({
      security_status: 'approved',
      privacy_by_design: ['Sem alteração em privacidade.'],
      security_by_design: ['Sem novos riscos detectados.'],
      vulnerabilities: [],
      lgpd_compliance: ['Conforme.'],
      approved: true,
      recommendations: ['Prosseguir com o fluxo.'],
    }),
    JSON.stringify({
      test_cases: ['Executar pipeline após retorno do QA', 'Validar recuperação da cobertura'],
      issues_found: [],
      coverage_percentage: 86,
      approved: true,
      recommendations: ['Manter o cenário como regressão automatizada.'],
    }),
    JSON.stringify({
      deployment_steps: ['Executar pipeline validado em staging.'],
      environment: 'staging',
      health_checks: ['Verificar health endpoint.'],
      rollback_plan: ['Reverter para a versão estável anterior.'],
      estimated_deployment_time_minutes: 5,
      deployment_approved: true,
    }),
  ];
}

after(() => {
  QARunner.run = originalQARunnerRun;
  DocumenterAgentWithSkill.prototype.generateAndSaveDocumentation = originalGenerateAndSaveDocumentation;
  DocumenterAgentWithSkill.prototype.generateIndexDocument = originalGenerateIndexDocument;
  resetOpenAIClientForTests();

  for (const tempDir of tempDirsToCleanup) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignora erros de limpeza
    }
  }
});

test('executePipeline retorna ao developer após bloqueio de QA e aprova a segunda iteração', async () => {
  const repositoryPath = createFixtureRepository();
  const modelPayloads = [];
  const qaRunnerOutputs = [
    {
      ran: true,
      framework: 'node-test',
      testResults: { success: true, passed: 4, failed: 0, pending: 0, total: 4, suites: 1 },
      coverage: { overall: 78, lines: 78, functions: 80, branches: 75, statements: 78 },
      baseline: { overall: 85 },
      coverageRegression: true,
      coverageDelta: -7,
      errors: [],
    },
    {
      ran: true,
      framework: 'node-test',
      testResults: { success: true, passed: 6, failed: 0, pending: 0, total: 6, suites: 2 },
      coverage: { overall: 86, lines: 86, functions: 88, branches: 84, statements: 86 },
      baseline: { overall: 85 },
      coverageRegression: false,
      coverageDelta: 1,
      errors: [],
    },
  ];
  let qaRunnerCallCount = 0;

  installMockOpenAISequence(buildLLMSequence(), modelPayloads);

  DocumenterAgentWithSkill.prototype.generateAndSaveDocumentation = async function generateAndSaveDocumentationStub({ pipelineId, stage }) {
    return {
      documentation: `# ${stage}`,
      saved: true,
      path: path.join(repositoryPath, 'docs', pipelineId, `${stage}.md`),
      relativePath: `docs/${pipelineId}/${stage}.md`,
    };
  };
  DocumenterAgentWithSkill.prototype.generateIndexDocument = async function generateIndexDocumentStub() {
    return { success: true };
  };
  QARunner.run = async () => {
    const next = qaRunnerOutputs[qaRunnerCallCount];
    qaRunnerCallCount += 1;
    assert.ok(next, 'QARunner.run foi chamado mais vezes do que o esperado.');
    return next;
  };

  const execution = await executePipeline(
    'Adicionar loop automático de retrabalho quando o QA bloquear por cobertura.',
    'exec-test-qa-loop',
    repositoryPath,
  );

  const developerCalls = modelPayloads.filter((payload) =>
    payload?.messages?.[1]?.content?.includes('Gere código para a especificação abaixo.')
  );
  const retryDeveloperPrompt = developerCalls[1]?.messages?.[1]?.content || '';

  assert.equal(execution.status, 'completed');
  assert.equal(qaRunnerCallCount, 2);
  assert.equal(developerCalls.length, 2);
  assert.match(retryDeveloperPrompt, /Contexto obrigatório de retrabalho QA → Developer/);
  assert.match(retryDeveloperPrompt, /Motivo do bloqueio do QA: QA não aprovado pelo agente; Cobertura insuficiente: 78% \(mínimo 80%\) — medição real via runner; Regressão de cobertura: -7% abaixo do baseline/);
  assert.match(retryDeveloperPrompt, /Cobertura medida: 78%/);
  assert.match(retryDeveloperPrompt, /Cobertura baseline: 85%/);
  assert.match(retryDeveloperPrompt, /Issues do QA: nenhuma informada/);
  assert.match(retryDeveloperPrompt, /Recomendações do QA: \["Adicionar testes para recuperar a cobertura baseline\."\]/);
  assert.match(retryDeveloperPrompt, /"source_stage": "qa"/);
  assert.match(retryDeveloperPrompt, /"qa_issues_found": \[\]/);
  assert.match(retryDeveloperPrompt, /"coverage_regression": true/);
  assert.equal(execution.stages.development.iteration, 2);
  assert.equal(execution.stages.code_review.iteration, 2);
  assert.equal(execution.stages.security.iteration, 2);
  assert.equal(execution.stages.qa.iteration, 2);
  assert.equal(execution.stages.qa.gatewayStatus, 'approved');
  assert.equal(execution.stages.qa.gatewayDecision.coverageRegression, false);
  assert.equal(execution.stages.qa.gatewayDecision.qaCoverage, 86);
  assert.match(execution.logs.map((entry) => entry.message).join('\n'), /QA Gateway bloqueou:/);
  assert.match(execution.logs.map((entry) => entry.message).join('\n'), /Retornando automaticamente ao developer após bloqueio de QA/);
  assert.equal(execution.finalArtifact.files[0].path, 'src/message.js');
  assert.match(execution.finalArtifact.files[0].content, /segunda-iteracao/);
});
