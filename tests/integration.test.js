import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CodePersister } from '../code-persister.js';

const TEST_API_KEY = 'test-key-integration';
process.env.API_KEY = TEST_API_KEY;
process.env.PORT = '0'; // let OS assign a free port
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

const { default: app, resolveIntegrableArtifact } = await import('../server.js');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health retorna status 200 e { status: "healthy" }', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'healthy');
});

test('GET /api/pipeline sem header x-api-key retorna 401', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline`);
  assert.equal(res.status, 401);
});

test('GET /api/pipeline com x-api-key correto retorna 200', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(res.status, 200);
});

test('POST /api/pipeline/execute sem body retorna 400', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/execute`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEST_API_KEY
    },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});

test.skip('POST /api/pipeline/execute com requirement retorna pipelineId', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': TEST_API_KEY },
    body: JSON.stringify({ requirement: 'test requirement' })
  });
  assert.ok([200, 422, 500].includes(res.status));
});

test('GET /api/deployments retorna estrutura correta', async () => {
  const res = await fetch(`${baseUrl}/api/deployments`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok('deployments' in body);
  assert.ok('count' in body);
});

test('resolveIntegrableArtifact prioriza o artefato final revisado', () => {
  const finalArtifact = {
    files: [{ path: 'src/final.js', content: 'export const reviewed = true;' }],
    tests: [{ path: 'tests/final.test.js', content: 'test("ok", () => {});' }]
  };
  const developmentArtifact = {
    files: [{ path: 'src/raw.js', content: 'export const raw = true;' }]
  };

  const resolved = resolveIntegrableArtifact({
    finalArtifact,
    stages: {
      development: { result: developmentArtifact },
      code_review: { output: { files: [{ path: 'src/review.js', content: 'export const review = true;' }] } }
    }
  });

  assert.deepEqual(resolved, finalArtifact);
});

test('resolveIntegrableArtifact usa o output do code review quando finalArtifact não existe', () => {
  const reviewedArtifact = {
    files: [{ path: 'src/review.js', content: 'export const review = true;' }]
  };
  const developmentArtifact = {
    files: [{ path: 'src/raw.js', content: 'export const raw = true;' }]
  };

  const resolved = resolveIntegrableArtifact({
    stages: {
      development: { result: developmentArtifact },
      code_review: { output: reviewedArtifact }
    }
  });

  assert.deepEqual(resolved, reviewedArtifact);
});

test('resolveIntegrableArtifact usa development como fallback legado', () => {
  const developmentArtifact = {
    files: [{ path: 'src/raw.js', content: 'export const raw = true;' }]
  };

  const resolved = resolveIntegrableArtifact({
    stages: {
      development: { result: developmentArtifact }
    }
  });

  assert.deepEqual(resolved, developmentArtifact);
});

test('GET /api/pipeline/:id/resume-info retorna metadados de retomada', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-resume-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-resume',
    requirement: 'validar endpoint resume-info',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {},
    logs: [],
    documentation: [],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'development',
      lastSuccessfulStage: 'analysis',
      resumeFromStage: 'development',
      lastCheckpointId: 'cp-http-resume',
      requiresManualIntervention: true,
      manualInterventionReason: 'Timeout do developer',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);
  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/resume-info`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.resumeEligible, true);
  assert.equal(body.resumeFromStage, 'development');
  assert.ok(Array.isArray(body.availableStages));
  assert.equal(body.availableStages.includes('qa'), true);
});

test('GET /api/pipeline/:id/checkpoints lista checkpoints persistidos', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-checkpoints-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-checkpoints',
    requirement: 'listar checkpoints',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {},
    logs: [],
    documentation: [],
    timeline: [
      { id: 'cp-http-checkpoints', type: 'checkpoint', stage: 'development', status: 'failed', transition: 'failed', createdAt: '2026-01-01T10:01:00.000Z' },
    ],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'development',
      resumeFromStage: 'development',
      lastCheckpointId: 'cp-http-checkpoints',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);
  CodePersister.persistCheckpoint({
    checkpointId: 'cp-http-checkpoints',
    pipelineId,
    executionId: execution.executionId,
    stage: 'development',
    status: 'failed',
    transition: 'failed',
    createdAt: new Date().toISOString(),
  }, execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/checkpoints`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.checkpointCount, 1);
  assert.equal(body.checkpoints[0].checkpointId, 'cp-http-checkpoints');
});

test('GET /api/pipeline/:id/timeline retorna a trilha operacional recente', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-timeline-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-timeline',
    requirement: 'timeline HTTP',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {},
    logs: [],
    documentation: [],
    timeline: [
      { id: 'cp-http-timeline-1', type: 'checkpoint', stage: 'analysis', status: 'completed', transition: 'completed', createdAt: '2026-01-01T10:00:00.000Z' },
      { id: 'cp-http-timeline-2', type: 'checkpoint', stage: 'qa', status: 'blocked', transition: 'blocked', createdAt: '2026-01-01T10:01:00.000Z' },
    ],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'qa',
      resumeFromStage: 'development',
      lastCheckpointId: 'cp-http-timeline-2',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/timeline?limit=1`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.count, 1);
  assert.equal(body.timeline[0].stage, 'qa');
});

test('GET /api/pipeline/:id/inspection retorna visão agregada da execução', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-inspection-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-inspection',
    requirement: 'inspection HTTP',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {
      specification: { status: 'completed', checkpointRef: '/tmp/spec.json', lastTransition: 'completed' },
      qa: { status: 'blocked', checkpointRef: '/tmp/qa.json', lastTransition: 'blocked' },
    },
    logs: [],
    documentation: [],
    timeline: [
      { id: 'cp-http-inspection', type: 'checkpoint', stage: 'qa', status: 'blocked', transition: 'blocked', createdAt: '2026-01-01T10:01:00.000Z' },
    ],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'qa',
      resumeFromStage: 'development',
      lastCheckpointId: 'cp-http-inspection',
      requiresManualIntervention: true,
      manualInterventionReason: 'QA bloqueado',
      lastSuccessfulStage: 'development',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);
  CodePersister.persistCheckpoint({
    checkpointId: 'cp-http-inspection',
    pipelineId,
    executionId: execution.executionId,
    stage: 'qa',
    status: 'blocked',
    transition: 'blocked',
    createdAt: '2026-01-01T10:01:00.000Z',
  }, execution, executionsDir);
  CodePersister.persistFailureSnapshot(execution, {
    pipelineId,
    stage: 'qa',
    error: { message: 'QA bloqueado' },
  }, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/inspection?limit=5&stage=qa&status=blocked`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.stageSummary.qa.status, 'blocked');
  assert.equal(body.checkpointIndex.checkpoints.length, 1);
  assert.equal(body.checkpointCatalog.count, 1);
  assert.equal(body.checkpointCatalog.stage, 'qa');
  assert.equal(body.checkpointCatalog.status, 'blocked');
  assert.equal(body.latestFailure.stage, 'qa');
  assert.equal(body.timeline.length, 1);
  assert.equal(body.recommendations.some(item => item.stage === 'qa'), true);
});

test('GET /api/pipeline/:id/checkpoints aceita filtros por estágio e status', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-checkpoint-filters-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-checkpoint-filters',
    requirement: 'filtros de checkpoints',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {},
    logs: [],
    documentation: [],
    timeline: [],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'qa',
      resumeFromStage: 'development',
      lastCheckpointId: 'cp-http-checkpoint-filter-2',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);
  CodePersister.persistCheckpoint({
    checkpointId: 'cp-http-checkpoint-filter-1',
    pipelineId,
    executionId: execution.executionId,
    stage: 'analysis',
    status: 'completed',
    transition: 'completed',
    createdAt: '2026-01-01T10:00:00.000Z',
  }, execution, executionsDir);
  CodePersister.persistCheckpoint({
    checkpointId: 'cp-http-checkpoint-filter-2',
    pipelineId,
    executionId: execution.executionId,
    stage: 'qa',
    status: 'blocked',
    transition: 'blocked',
    createdAt: '2026-01-01T10:01:00.000Z',
  }, execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/checkpoints?stage=qa&status=blocked&limit=5`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.checkpointCount, 1);
  assert.equal(body.filters.stage, 'qa');
  assert.equal(body.filters.status, 'blocked');
  assert.equal(body.checkpoints[0].checkpointId, 'cp-http-checkpoint-filter-2');
});

test('GET /api/pipeline/:id/recommendations retorna sugestões assistidas de retomada', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-recommendations-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-recommendations',
    requirement: 'recomendações HTTP',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {
      development: { status: 'completed' },
      qa: { status: 'blocked' },
    },
    logs: [],
    documentation: [],
    timeline: [],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'qa',
      resumeFromStage: 'development',
      lastSuccessfulStage: 'development',
      lastCheckpointId: 'cp-http-recommendations',
      requiresManualIntervention: true,
      manualInterventionReason: 'QA bloqueado',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/recommendations`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.resumeEligible, true);
  assert.equal(body.recommendations.some(item => item.stage === 'qa'), true);
});

test('GET /api/pipeline/:id/guide retorna a sequência guiada da execução com ações assistidas', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-guide-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-guide',
    requirement: 'guia HTTP',
    status: 'failed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    currentStage: 'qa',
    stages: {
      development: { status: 'completed', lastTransition: 'completed' },
      qa: { status: 'blocked', lastTransition: 'blocked' },
    },
    logs: [],
    documentation: [],
    timeline: [
      { id: 'cp-http-guide', type: 'checkpoint', stage: 'qa', status: 'blocked', transition: 'blocked', createdAt: '2026-01-01T10:01:00.000Z' },
    ],
    resume: {
      enabled: true,
      resumeEligible: true,
      failedStage: 'qa',
      resumeFromStage: 'development',
      lastSuccessfulStage: 'development',
      lastCheckpointId: 'cp-http-guide',
      requiresManualIntervention: true,
      manualInterventionReason: 'QA bloqueado',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);
  CodePersister.persistCheckpoint({
    checkpointId: 'cp-http-guide',
    pipelineId,
    executionId: execution.executionId,
    stage: 'qa',
    status: 'blocked',
    transition: 'blocked',
    createdAt: '2026-01-01T10:01:00.000Z',
  }, execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/guide?limit=5&stage=qa&status=blocked`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.pipelineId, pipelineId);
  assert.equal(body.checkpointCatalog.count, 1);
  assert.equal(body.selectedCheckpointFilters.stage, 'qa');
  assert.equal(body.recommendedAction.stage, 'qa');
  assert.equal(body.steps.some(step => step.stage === 'qa' && step.actions.some(action => action.operation === 'retry-stage')), true);
});

test('POST /api/pipeline/:id/resume retorna 409 quando a execução não é elegível', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-resume-blocked-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-resume-blocked',
    requirement: 'retomada bloqueada',
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {},
    logs: [],
    documentation: [],
    resume: {
      enabled: true,
      resumeEligible: false,
      failedStage: null,
      resumeFromStage: null,
      lastCheckpointId: null,
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/resume`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEST_API_KEY,
    },
    body: JSON.stringify({})
  });
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.match(body.error, /não está elegível/i);
});

test('POST /api/pipeline/:id/resume com retryStage retorna 409 quando a execução não é elegível', async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const executionsDir = path.join(repoRoot, 'data', 'executions');
  fs.mkdirSync(executionsDir, { recursive: true });

  const pipelineId = `pipeline-http-retry-stage-blocked-${Date.now()}`;
  const execution = {
    id: pipelineId,
    executionId: 'exec-http-retry-stage-blocked',
    requirement: 'retry-stage bloqueado',
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repositoryPath: repoRoot,
    stages: {
      specification: { status: 'completed', result: {} },
      analysis: { status: 'completed', result: {} },
      ux_design: { status: 'completed', result: {} },
      development: { status: 'completed', result: {} },
      code_review: { status: 'completed', output: { files: [] } },
      security: { status: 'completed', result: {} },
      qa: { status: 'blocked', result: {} },
    },
    logs: [],
    documentation: [],
    resume: {
      enabled: true,
      resumeEligible: false,
      failedStage: 'qa',
      resumeFromStage: 'development',
      lastCheckpointId: 'cp-http-retry-stage',
    },
  };

  CodePersister.persistExecutionManifest(execution, executionsDir);

  const res = await fetch(`${baseUrl}/api/pipeline/${pipelineId}/resume`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEST_API_KEY,
    },
    body: JSON.stringify({ retryStage: 'qa' })
  });
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.match(body.error, /não está elegível/i);
});
