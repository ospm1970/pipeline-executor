import { analystAgent, developerAgent, qaAgent, devopsAgent } from './agents.js';
import { codeReviewAgent, buildReviewInput } from './agents-code-review.js';
import { securityAgent } from './agents-security.js';
import { UIUXAgentWithSkill } from './agents-ux.js';
import { SpecAgentWithSkill } from './agents-spec.js';
import DocumenterAgentWithSkill from './agents-documenter.js';
import { RepositoryAnalyzer } from './repository-analyzer.js';
import QARunner from './qa-runner.js';
import logger from './logger.js';
import { CodePersister } from './code-persister.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTIONS_DIR = path.join(__dirname, 'data', 'executions');
const STAGE_INDEX = {
  specification: 0,
  analysis: 1,
  ux_design: 2,
  development: 3,
  code_review: 4,
  security: 5,
  qa: 6,
  deployment: 7,
};

// Store pipeline executions in memory
const pipelineExecutions = new Map();

// Active pipeline emitters — used by SSE endpoint
export const pipelineEmitters = new Map();

export function getExecutionDir(pipelineId) {
  return path.join(EXECUTIONS_DIR, pipelineId);
}

export function getCheckpointDir(pipelineId) {
  return path.join(getExecutionDir(pipelineId), 'checkpoints');
}

function getDerivedDir(pipelineId) {
  return path.join(getExecutionDir(pipelineId), 'derived');
}

function getFailuresDir(pipelineId) {
  return path.join(getExecutionDir(pipelineId), 'failures');
}

function getStageIndex(stage) {
  return STAGE_INDEX[stage] ?? Number.MAX_SAFE_INTEGER;
}

function shouldRunStage(resumeFromStage, stage) {
  if (!resumeFromStage) return true;
  return getStageIndex(stage) >= getStageIndex(resumeFromStage);
}

export function listStageNames() {
  return Object.keys(STAGE_INDEX).sort((left, right) => getStageIndex(left) - getStageIndex(right));
}

export function normalizeStageName(stage) {
  if (stage === null || stage === undefined || stage === '') return null;
  const normalized = String(stage).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return Object.prototype.hasOwnProperty.call(STAGE_INDEX, normalized) ? normalized : null;
}

function getPreviousStage(stage) {
  const names = listStageNames();
  const index = names.indexOf(stage);
  if (index <= 0) return null;
  return names[index - 1];
}

function hasStageResult(execution, stage) {
  const stageState = execution?.stages?.[stage];
  if (!stageState) return false;
  if (stageState.status === 'completed') return true;
  return Boolean(stageState.result || stageState.output);
}

export function getLatestCheckpointForStage(pipelineId, stage) {
  const normalizedStage = normalizeStageName(stage);
  if (!normalizedStage) return null;
  const checkpoints = getExecutionCheckpoints(pipelineId)
    .filter(checkpoint => checkpoint.stage === normalizedStage)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return checkpoints[0] || null;
}

export function getCheckpointCatalog(pipelineId, options = {}) {
  const normalizedStage = normalizeStageName(options.stage || null);
  const normalizedStatus = options.status ? String(options.status).trim().toLowerCase() : null;
  const limit = Number(options.limit || 0);

  let checkpoints = getExecutionCheckpoints(pipelineId);
  if (normalizedStage) {
    checkpoints = checkpoints.filter(checkpoint => checkpoint.stage === normalizedStage);
  }
  if (normalizedStatus) {
    checkpoints = checkpoints.filter(checkpoint => String(checkpoint.status).toLowerCase() === normalizedStatus);
  }

  checkpoints = checkpoints.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  if (Number.isFinite(limit) && limit > 0) {
    checkpoints = checkpoints.slice(0, limit);
  }

  return {
    pipelineId,
    stage: normalizedStage,
    status: normalizedStatus,
    count: checkpoints.length,
    checkpoints,
  };
}

function assertStageResumePrerequisites(execution, stage, force = false) {
  if (force) return;
  const previousStage = getPreviousStage(stage);
  if (!previousStage) return;

  if (!hasStageResult(execution, previousStage)) {
    throw new Error(`Execução ${execution.id} não possui contexto suficiente para retomar a partir de ${stage}. Estágio pré-requisito ausente: ${previousStage}`);
  }

  if (stage === 'code_review' && !execution?.stages?.development?.result) {
    throw new Error(`Execução ${execution.id} não possui artefato de desenvolvimento para retomar code_review`);
  }

  if ((stage === 'security' || stage === 'qa') && !(execution?.finalArtifact || execution?.stages?.code_review?.output || execution?.stages?.development?.result)) {
    throw new Error(`Execução ${execution.id} não possui artefato revisado para retomar ${stage}`);
  }

  if (stage === 'deployment') {
    const qaStatus = execution?.stages?.qa?.gatewayStatus || execution?.stages?.qa?.status || null;
    if (!hasStageResult(execution, 'qa') || (qaStatus && !['approved', 'completed'].includes(qaStatus))) {
      throw new Error(`Execução ${execution.id} não possui aprovação de QA suficiente para retomar deployment`);
    }
  }
}

export function validateResumeRequest(execution, options = {}) {
  if (!execution) {
    throw new Error('Execução não encontrada para retomada');
  }

  const requestedStage = normalizeStageName(options.retryStage || options.stage || execution.resume?.resumeFromStage || execution.resume?.failedStage || execution.currentStage || 'development');
  if (!requestedStage) {
    throw new Error(`Estágio de retomada inválido: ${options.retryStage || options.stage}`);
  }

  if (!execution.resume?.resumeEligible && options.force !== true) {
    throw new Error(`Execução ${execution.id} não está elegível para retomada`);
  }

  if (!execution.repositoryPath || !fs.existsSync(execution.repositoryPath)) {
    throw new Error(`Workspace da execução ${execution.id} não está disponível para retomada`);
  }

  assertStageResumePrerequisites(execution, requestedStage, options.force === true);

  return {
    requestedStage,
    operation: options.retryStage ? 'retry-stage' : 'resume',
    previousStatus: execution.status,
    lastSuccessfulStage: execution.resume?.lastSuccessfulStage || null,
    failedStage: execution.resume?.failedStage || execution.currentStage || null,
    force: options.force === true,
    notes: options.notes || null,
  };
}

export function prepareExecutionForResume(execution, validation) {
  if (!execution || !validation?.requestedStage) {
    throw new Error('Execução inválida para preparação de retomada');
  }

  const requestedStage = validation.requestedStage;
  const requestedIndex = getStageIndex(requestedStage);

  for (const stageName of listStageNames()) {
    if (getStageIndex(stageName) >= requestedIndex) {
      delete execution.stages[stageName];
    }
  }

  if (requestedIndex <= getStageIndex('code_review')) {
    execution.finalArtifact = null;
  }

  if (requestedIndex <= getStageIndex('development')) {
    execution.pendingDevelopmentSpec = null;
    execution.iterations.qaRetryCount = 0;
    execution.iterations.codeReviewRetryCount = 0;
  }

  if (requestedIndex <= getStageIndex('specification')) {
    execution.repositoryAnalysis = null;
    execution.requirementWithContext = null;
  }

  execution.status = 'resuming';
  execution.mode = validation.operation;
  execution.completedAt = null;
  execution.currentStage = requestedStage;
  execution.resume.resumeInProgress = true;
  execution.resume.resumeEligible = false;
  execution.resume.failedStage = requestedStage;
  execution.resume.resumeFromStage = requestedStage;
  execution.resume.requiresManualIntervention = false;
  execution.resume.manualInterventionReason = null;
  execution.resume.resumeAttempts = Number(execution.resume.resumeAttempts || 0) + 1;
  execution.resume.lastResumeRequest = {
    requestedStage,
    operation: validation.operation,
    previousStatus: validation.previousStatus,
    notes: validation.notes || null,
    requestedAt: new Date().toISOString(),
  };

  return execution;
}

function buildExecutionArtifacts(pipelineId) {
  return {
    executionDir: getExecutionDir(pipelineId),
    checkpointDir: getCheckpointDir(pipelineId),
    derivedDir: getDerivedDir(pipelineId),
    failuresDir: getFailuresDir(pipelineId),
  };
}

function appendExecutionTimelineEvent(execution, event) {
  execution.timeline = Array.isArray(execution.timeline) ? execution.timeline : [];
  execution.timeline.push(event);
  if (execution.timeline.length > 200) {
    execution.timeline = execution.timeline.slice(-200);
  }
  return execution.timeline;
}

function buildTimelineEntryFromCheckpoint(checkpoint, extra = {}) {
  return {
    id: checkpoint.checkpointId,
    type: 'checkpoint',
    stage: checkpoint.stage,
    status: checkpoint.status,
    transition: checkpoint.transition,
    createdAt: checkpoint.createdAt,
    attempt: checkpoint.attempt || null,
    qaDevIteration: checkpoint.qaDevIteration || null,
    resumeEligible: checkpoint.resumeEligible === true,
    ...extra,
  };
}

function summarizeExecutionStages(execution) {
  const summary = {};
  for (const stageName of listStageNames()) {
    const stageState = execution?.stages?.[stageName] || null;
    summary[stageName] = stageState ? {
      status: stageState.status || null,
      checkpointRef: stageState.checkpointRef || null,
      lastTransition: stageState.lastTransition || null,
    } : null;
  }
  return summary;
}

export function getExecutionTimeline(pipelineId, options = {}) {
  const execution = pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId);
  if (!execution) return [];

  const timeline = Array.isArray(execution.timeline) && execution.timeline.length > 0
    ? execution.timeline
    : getExecutionCheckpoints(pipelineId).map(checkpoint => buildTimelineEntryFromCheckpoint(checkpoint));

  const limit = Number(options.limit || 50);
  if (!Number.isFinite(limit) || limit <= 0) {
    return timeline;
  }
  return timeline.slice(-limit);
}

export function getResumeRecommendations(pipelineId, options = {}) {
  const execution = pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId);
  if (!execution) return null;

  const failedStage = normalizeStageName(execution.resume?.failedStage || execution.currentStage || null);
  const resumeFromStage = normalizeStageName(execution.resume?.resumeFromStage || null);
  const lastSuccessfulStage = normalizeStageName(execution.resume?.lastSuccessfulStage || null);
  const recommendations = [];

  if (failedStage) {
    recommendations.push({
      type: 'retry-failed-stage',
      stage: failedStage,
      operation: 'retry-stage',
      reason: `O último estágio com falha ou bloqueio foi ${failedStage}`,
      eligible: execution.resume?.resumeEligible === true,
    });
  }

  if (resumeFromStage && resumeFromStage !== failedStage) {
    recommendations.push({
      type: 'resume-from-stage',
      stage: resumeFromStage,
      operation: 'resume',
      reason: `A execução registrou ${resumeFromStage} como ponto preferencial de retomada`,
      eligible: execution.resume?.resumeEligible === true,
    });
  }

  if (lastSuccessfulStage) {
    const nextStage = listStageNames()[getStageIndex(lastSuccessfulStage) + 1] || lastSuccessfulStage;
    recommendations.push({
      type: 'continue-after-last-success',
      stage: nextStage,
      operation: nextStage === failedStage ? 'retry-stage' : 'resume',
      reason: `O último estágio concluído com sucesso foi ${lastSuccessfulStage}`,
      eligible: execution.resume?.resumeEligible === true,
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const recommendation of recommendations) {
    const key = `${recommendation.operation}:${recommendation.stage}`;
    if (recommendation.stage && !seen.has(key)) {
      deduped.push(recommendation);
      seen.add(key);
    }
  }

  return {
    pipelineId,
    resumeEligible: execution.resume?.resumeEligible === true,
    requiresManualIntervention: execution.resume?.requiresManualIntervention === true,
    manualInterventionReason: execution.resume?.manualInterventionReason || null,
    recommendations: deduped,
  };
}

export function getExecutionInspection(pipelineId, options = {}) {
  const execution = pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId);
  if (!execution) return null;

  const checkpointIndex = CodePersister.readCheckpointIndex(pipelineId, EXECUTIONS_DIR);
  const latestFailure = CodePersister.readLatestFailureSnapshot(pipelineId, EXECUTIONS_DIR);
  const checkpointCatalog = getCheckpointCatalog(pipelineId, {
    stage: options.stage || null,
    status: options.status || null,
    limit: options.checkpointLimit || options.limit || 50,
  });

  return {
    pipelineId: execution.id,
    executionId: execution.executionId || null,
    status: execution.status,
    currentStage: execution.currentStage || null,
    triggerType: execution.triggerType || 'feature',
    mode: execution.mode || 'default',
    repositoryPath: execution.repositoryPath || null,
    stageSummary: summarizeExecutionStages(execution),
    resume: execution.resume || null,
    checkpointIndex,
    checkpointCatalog,
    latestFailure,
    recommendations: getResumeRecommendations(pipelineId, options)?.recommendations || [],
    timeline: getExecutionTimeline(pipelineId, { limit: options.limit || 50 }),
  };
}

function getStageDisplayLabel(stageName) {
  const labels = {
    specification: 'Especificação',
    analysis: 'Análise',
    ux_design: 'UX/UI',
    development: 'Desenvolvimento',
    code_review: 'Code Review',
    security: 'Segurança',
    qa: 'QA',
    deployment: 'Deploy',
  };
  return labels[stageName] || stageName;
}

function buildGuideActions(execution, stageName, recommendations = []) {
  const actions = [];
  const resumeEligible = execution.resume?.resumeEligible === true;
  const failedStage = normalizeStageName(execution.resume?.failedStage || execution.currentStage || null);
  const resumeFromStage = normalizeStageName(execution.resume?.resumeFromStage || null);

  if (resumeEligible && failedStage === stageName) {
    actions.push({
      type: 'retry-stage',
      stage: stageName,
      label: `Reexecutar ${getStageDisplayLabel(stageName)}`,
      operation: 'retry-stage',
      recommended: true,
    });
  }

  if (resumeEligible && resumeFromStage === stageName) {
    actions.push({
      type: 'resume',
      stage: stageName,
      label: `Retomar a partir de ${getStageDisplayLabel(stageName)}`,
      operation: 'resume',
      recommended: failedStage !== stageName,
    });
  }

  for (const recommendation of recommendations) {
    if (recommendation.stage !== stageName) continue;
    actions.push({
      type: recommendation.operation,
      stage: stageName,
      label: recommendation.operation === 'retry-stage'
        ? `Reexecutar ${getStageDisplayLabel(stageName)}`
        : `Retomar a partir de ${getStageDisplayLabel(stageName)}`,
      operation: recommendation.operation,
      recommended: recommendation.eligible === true,
      reason: recommendation.reason,
    });
  }

  const unique = [];
  const seen = new Set();
  for (const action of actions) {
    const key = `${action.operation}:${action.stage}`;
    if (!seen.has(key)) {
      unique.push(action);
      seen.add(key);
    }
  }
  return unique;
}

export function getExecutionGuide(pipelineId, options = {}) {
  const execution = pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId);
  if (!execution) return null;

  const stageSummary = summarizeExecutionStages(execution);
  const recommendationsPayload = getResumeRecommendations(pipelineId, options) || { recommendations: [] };
  const checkpointCatalog = getCheckpointCatalog(pipelineId, {
    stage: options.stage || null,
    status: options.status || null,
    limit: options.checkpointLimit || options.limit || 20,
  });

  const steps = listStageNames().map((stageName, index) => {
    const stageState = stageSummary[stageName] || { status: 'pending', hasResult: false };
    const lastCheckpoint = getLatestCheckpointForStage(pipelineId, stageName);
    const actions = buildGuideActions(execution, stageName, recommendationsPayload.recommendations || []);

    return {
      stage: stageName,
      label: getStageDisplayLabel(stageName),
      order: index + 1,
      status: stageState.status || 'pending',
      transition: stageState.lastTransition || null,
      hasResult: stageState.hasResult === true,
      isCurrent: execution.currentStage === stageName,
      isFailed: normalizeStageName(execution.resume?.failedStage || execution.currentStage || null) === stageName,
      lastCheckpoint: lastCheckpoint ? {
        checkpointId: lastCheckpoint.checkpointId,
        status: lastCheckpoint.status,
        transition: lastCheckpoint.transition || null,
        createdAt: lastCheckpoint.createdAt,
      } : null,
      actions,
    };
  });

  return {
    pipelineId: execution.id,
    executionId: execution.executionId || null,
    status: execution.status,
    currentStage: execution.currentStage || null,
    resume: execution.resume || null,
    recommendedAction: recommendationsPayload.recommendations?.[0] || null,
    recommendations: recommendationsPayload.recommendations || [],
    selectedCheckpointFilters: {
      stage: checkpointCatalog.stage,
      status: checkpointCatalog.status,
    },
    checkpointCatalog,
    steps,
    recentTimeline: getExecutionTimeline(pipelineId, { limit: options.limit || 10 }),
  };
}

function initializeExecutionRecord({ pipelineId, requirement, executionId, repositoryPath, triggerType = 'feature', mode = 'default' }) {
  return {
    id: pipelineId,
    executionId: executionId || null,
    requirement,
    triggerType,
    mode,
    status: 'running',
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    currentStage: null,
    repositoryPath: repositoryPath || null,
    artifacts: buildExecutionArtifacts(pipelineId),
    resume: {
      enabled: true,
      resumeEligible: false,
      lastSuccessfulStage: null,
      failedStage: null,
      resumeFromStage: null,
      lastCheckpointId: null,
      requiresManualIntervention: false,
      manualInterventionReason: null,
      resumeInProgress: false,
      resumeAttempts: 0,
      lastResumeRequest: null,
    },
    iterations: {
      qaDevIteration: 1,
      qaRetryCount: 0,
      codeReviewRetryCount: 0,
    },
    stages: {},
    logs: [],
    documentation: [],
    timeline: [],
  };
}

function updateExecutionTracking(execution, patch = {}) {
  if (!execution || typeof execution !== 'object') return execution;
  Object.assign(execution, patch);
  execution.updatedAt = new Date();
  if (execution.id) {
    execution.artifacts = execution.artifacts || buildExecutionArtifacts(execution.id);
  }
  execution.resume = {
    enabled: true,
    resumeEligible: false,
    lastSuccessfulStage: null,
    failedStage: null,
    resumeFromStage: null,
    lastCheckpointId: null,
    requiresManualIntervention: false,
    manualInterventionReason: null,
    resumeInProgress: false,
    resumeAttempts: 0,
    lastResumeRequest: null,
    ...(execution.resume || {}),
  };
  execution.iterations = {
    qaDevIteration: 1,
    qaRetryCount: 0,
    codeReviewRetryCount: 0,
    ...(execution.iterations || {}),
  };
  execution.stages = execution.stages || {};
  execution.logs = Array.isArray(execution.logs) ? execution.logs : [];
  execution.documentation = Array.isArray(execution.documentation) ? execution.documentation : [];
  execution.timeline = Array.isArray(execution.timeline) ? execution.timeline : [];
  return execution;
}

function loadExecutionFromDiskRecord(pipelineId) {
  const rootFilePath = path.join(EXECUTIONS_DIR, `${pipelineId}.json`);
  const manifestPath = path.join(getExecutionDir(pipelineId), 'manifest.json');
  const candidatePaths = [rootFilePath, manifestPath];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      const raw = fs.readFileSync(candidatePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      logger.warn('Could not load execution manifest', { pipelineId, file: candidatePath, error: error.message });
    }
  }

  return null;
}

function saveExecutionToDisk(execution) {
  try {
    fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
    updateExecutionTracking(execution);
    CodePersister.persistExecutionManifest(execution, EXECUTIONS_DIR);
  } catch (err) {
    logger.warn('Failed to save execution to disk', { error: err.message, pipelineId: execution?.id });
  }
}

function buildCheckpointPayload({ execution, stage, status, transition, input = null, output = null, error = null, metadata = {} }) {
  const checkpointTimestamp = new Date();
  const checkpointId = `${checkpointTimestamp.toISOString().replace(/[.:]/g, '-')}-${stage}-${transition}`;
  return {
    checkpointId,
    pipelineId: execution.id,
    executionId: execution.executionId || null,
    stage,
    stageOrder: getStageIndex(stage),
    status,
    transition,
    createdAt: checkpointTimestamp.toISOString(),
    attempt: metadata.attempt || null,
    qaDevIteration: metadata.qaDevIteration || execution.iterations?.qaDevIteration || 1,
    triggerType: execution.triggerType || 'feature',
    resumeEligible: metadata.resumeEligible === true,
    input,
    output,
    error: error ? { message: error.message || String(error), stack: error.stack || null } : null,
    metadata,
  };
}

function persistDerivedExecutionState(execution, name, payload) {
  return CodePersister.persistDerivedState(execution, name, payload, EXECUTIONS_DIR);
}

function persistExecutionCheckpoint(execution, stage, status, transition, payload = {}) {
  const checkpoint = buildCheckpointPayload({
    execution,
    stage,
    status,
    transition,
    input: payload.input || null,
    output: payload.output || null,
    error: payload.error || null,
    metadata: payload.metadata || {},
  });

  const persisted = CodePersister.persistCheckpoint(checkpoint, execution, EXECUTIONS_DIR);
  execution.resume.lastCheckpointId = checkpoint.checkpointId;
  execution.currentStage = stage;
  execution.stages[stage] = {
    ...(execution.stages[stage] || {}),
    checkpointRef: persisted.filePath,
    lastTransition: transition,
    status,
  };
  appendExecutionTimelineEvent(execution, buildTimelineEntryFromCheckpoint({ ...checkpoint, filePath: persisted.filePath }));
  saveExecutionToDisk(execution);
  return { ...checkpoint, filePath: persisted.filePath };
}

function markStageRunning(execution, stage, payload = {}) {
  execution.currentStage = stage;
  execution.stages[stage] = {
    ...(execution.stages[stage] || {}),
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  return persistExecutionCheckpoint(execution, stage, 'running', 'entered', payload);
}

function markStageCompleted(execution, stage, output = {}, payload = {}) {
  execution.stages[stage] = {
    ...(execution.stages[stage] || {}),
    status: 'completed',
    completedAt: new Date().toISOString(),
    ...payload.stagePatch,
  };
  execution.resume.lastSuccessfulStage = stage;
  execution.resume.failedStage = null;
  execution.resume.resumeFromStage = null;
  execution.resume.resumeEligible = false;
  execution.resume.requiresManualIntervention = false;
  execution.resume.manualInterventionReason = null;
  return persistExecutionCheckpoint(execution, stage, 'completed', 'completed', {
    ...payload,
    output,
  });
}

function markStageFailed(execution, stage, error, payload = {}) {
  execution.stages[stage] = {
    ...(execution.stages[stage] || {}),
    status: 'failed',
    failedAt: new Date().toISOString(),
    lastError: error?.message || String(error),
    ...payload.stagePatch,
  };
  execution.resume.failedStage = stage;
  execution.resume.resumeFromStage = payload.resumeFromStage || stage;
  execution.resume.resumeEligible = payload.resumeEligible !== false;
  execution.resume.requiresManualIntervention = payload.requiresManualIntervention !== false;
  execution.resume.manualInterventionReason = payload.manualInterventionReason || error?.message || String(error);
  const checkpoint = persistExecutionCheckpoint(execution, stage, 'failed', 'failed', {
    ...payload,
    error,
    metadata: {
      ...(payload.metadata || {}),
      resumeEligible: execution.resume.resumeEligible,
    },
  });
  CodePersister.persistFailureSnapshot(execution, {
    pipelineId: execution.id,
    stage,
    error: {
      message: error?.message || String(error),
      stack: error?.stack || null,
    },
    resume: execution.resume,
    checkpointId: checkpoint.checkpointId,
  }, EXECUTIONS_DIR);
  return checkpoint;
}

function markStageBlocked(execution, stage, reason, payload = {}) {
  execution.stages[stage] = {
    ...(execution.stages[stage] || {}),
    status: 'blocked',
    blockedAt: new Date().toISOString(),
    gatewayReason: reason,
    ...payload.stagePatch,
  };
  execution.resume.failedStage = stage;
  execution.resume.resumeFromStage = payload.resumeFromStage || stage;
  execution.resume.resumeEligible = payload.resumeEligible !== false;
  execution.resume.requiresManualIntervention = payload.requiresManualIntervention !== false;
  execution.resume.manualInterventionReason = payload.manualInterventionReason || reason;
  return persistExecutionCheckpoint(execution, stage, 'blocked', 'blocked', {
    ...payload,
    output: payload.output || { reason },
    metadata: {
      ...(payload.metadata || {}),
      resumeEligible: execution.resume.resumeEligible,
    },
  });
}

export function getExecutionCheckpoints(pipelineId) {
  return CodePersister.listExecutionCheckpoints(pipelineId, EXECUTIONS_DIR);
}

export function getResumeInfo(pipelineId) {
  const execution = pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId);
  if (!execution) return null;

  const checkpoints = getExecutionCheckpoints(pipelineId);
  const lastCheckpoint = checkpoints.at(-1) || null;

  return {
    pipelineId: execution.id,
    executionId: execution.executionId || null,
    status: execution.status,
    currentStage: execution.currentStage || null,
    resumeEligible: execution.resume?.resumeEligible === true,
    failedStage: execution.resume?.failedStage || null,
    lastSuccessfulStage: execution.resume?.lastSuccessfulStage || null,
    resumeFromStage: execution.resume?.resumeFromStage || null,
    lastCheckpointId: execution.resume?.lastCheckpointId || null,
    requiresManualIntervention: execution.resume?.requiresManualIntervention === true,
    manualInterventionReason: execution.resume?.manualInterventionReason || null,
    repositoryPath: execution.repositoryPath || null,
    availableStages: listStageNames(),
    resumeAttempts: Number(execution.resume?.resumeAttempts || 0),
    lastResumeRequest: execution.resume?.lastResumeRequest || null,
    stageSummary: summarizeExecutionStages(execution),
    recommendations: getResumeRecommendations(pipelineId)?.recommendations || [],
    guidePreview: getExecutionGuide(pipelineId, { limit: 5 }),
    recentTimeline: getExecutionTimeline(pipelineId, { limit: 10 }),
    lastCheckpoint: lastCheckpoint ? {
      checkpointId: lastCheckpoint.checkpointId,
      stage: lastCheckpoint.stage,
      status: lastCheckpoint.status,
      transition: lastCheckpoint.transition,
      createdAt: lastCheckpoint.createdAt,
    } : null,
  };
}

export async function resumePipeline(pipelineId, options = {}) {
  const execution = updateExecutionTracking(
    pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId),
    {}
  );

  if (!execution) {
    throw new Error(`Execução ${pipelineId} não encontrada`);
  }

  const validation = validateResumeRequest(execution, options);
  const resumeFromStage = validation.requestedStage;
  const emitter = pipelineEmitters.get(pipelineId) || new EventEmitter();
  emitter.on('error', () => {});
  pipelineEmitters.set(pipelineId, emitter);

  prepareExecutionForResume(execution, validation);
  persistDerivedExecutionState(execution, `resume-request-${Date.now()}`, validation);
  persistExecutionCheckpoint(execution, resumeFromStage, 'queued', 'resume_requested', {
    metadata: {
      operation: validation.operation,
      previousStatus: validation.previousStatus,
      resumeEligible: false,
    },
    output: {
      notes: validation.notes || null,
    },
  });
  saveExecutionToDisk(execution);
  emitter.emit('resuming', {
    pipelineId,
    resumeFromStage,
    previousStatus: validation.previousStatus,
    operation: validation.operation,
  });

  try {
    return await runPipeline(
      pipelineId,
      execution.requirement,
      execution.executionId || null,
      execution.repositoryPath,
      emitter,
      execution.triggerType || 'feature',
      {
        existingExecution: execution,
        resumeFromStage,
        mode: validation.operation,
        notes: validation.notes || null,
      }
    );
  } finally {
    setTimeout(() => pipelineEmitters.delete(pipelineId), 30_000);
  }
}

export async function retryPipelineStage(pipelineId, stage, options = {}) {
  return resumePipeline(pipelineId, {
    ...options,
    retryStage: stage,
  });
}

export function loadExecutionsFromDisk() {
  try {
    if (!fs.existsSync(EXECUTIONS_DIR)) return;
    const files = fs.readdirSync(EXECUTIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(EXECUTIONS_DIR, file), 'utf8');
        const execution = JSON.parse(raw);
        pipelineExecutions.set(execution.id, execution);
      } catch (parseErr) {
        logger.warn('Could not load execution file', { file, error: parseErr.message });
      }
    }
    logger.info('Loaded executions from disk', { count: files.length });
  } catch (err) {
    logger.warn('Failed to load executions from disk', { error: err.message });
  }
}

export function assessStackAdherence(repositoryAnalysis, generatedCode, triggerType = 'feature') {
  if (!repositoryAnalysis || !generatedCode || triggerType === 'migration') {
    return { compatible: true, issues: [], detectedPatterns: [], offendingFiles: [], expectedStackProfile: null };
  }

  const pathEntries = [
    ...(generatedCode.files || []).map(file => file?.path || ''),
    ...(generatedCode.tests || []).map(file => file?.path || ''),
  ].map(originalPath => ({
    originalPath: String(originalPath || ''),
    normalizedPath: String(originalPath || '').replace(/\\/g, '/').toLowerCase(),
  }));

  const detectedPatterns = [];
  const issues = [];
  const offendingFiles = [];
  const projectType = repositoryAnalysis.type;
  const stackProfile = repositoryAnalysis.stackProfile || {};
  const backendFramework = stackProfile.backendFramework || 'none';
  const frontendFramework = stackProfile.frontendFramework || 'none';
  const frontendType = stackProfile.frontendType || 'none';
  const repoShape = stackProfile.repoShape || 'single-app';

  const nestEntries = pathEntries.filter(({ normalizedPath }) =>
    normalizedPath.endsWith('.module.ts')
    || normalizedPath.endsWith('.controller.ts')
    || normalizedPath.endsWith('.service.ts')
    || normalizedPath.includes('/dto/')
    || normalizedPath.includes('/entities/')
  );
  const frontendEntries = pathEntries.filter(({ normalizedPath }) =>
    normalizedPath.endsWith('.tsx')
    || normalizedPath.endsWith('.jsx')
    || normalizedPath.includes('/frontend/')
    || normalizedPath.includes('/components/')
    || normalizedPath.startsWith('app/')
    || normalizedPath.startsWith('pages/')
  );
  const nextEntries = pathEntries.filter(({ normalizedPath }) =>
    normalizedPath.startsWith('app/')
    || normalizedPath.startsWith('pages/')
    || normalizedPath.startsWith('src/app/')
    || normalizedPath.startsWith('src/pages/')
  );

  const hasNestStructure = nestEntries.length > 0;
  const hasFrontendStructure = frontendEntries.length > 0;
  const hasNextStructure = nextEntries.length > 0;

  if (hasNestStructure) {
    detectedPatterns.push('nestjs');
    offendingFiles.push(...nestEntries.map(({ originalPath }) => originalPath));
  }
  if (hasFrontendStructure) {
    detectedPatterns.push('frontend-react');
    offendingFiles.push(...frontendEntries.map(({ originalPath }) => originalPath));
  }
  if (hasNextStructure) {
    detectedPatterns.push('nextjs');
  }

  const backendExpectsNest = backendFramework === 'nestjs';
  if (!backendExpectsNest && hasNestStructure) {
    issues.push(`A stack detectada no repositório usa backend ${backendFramework === 'none' ? 'sem framework backend dedicado' : backendFramework}, mas o código gerado introduz estrutura típica de NestJS sem justificativa explícita.`);
  }

  const frontendAllowsReactiveUi = frontendFramework === 'react' || frontendFramework === 'nextjs' || frontendType === 'spa' || frontendType === 'ssr-web';
  if (!frontendAllowsReactiveUi && hasFrontendStructure) {
    if (frontendType === 'static-web') {
      issues.push('A stack detectada no repositório possui frontend estático, mas o código gerado introduz React/TSX ou estrutura SPA/SSR sem justificativa explícita.');
    } else {
      issues.push(`A stack detectada no repositório (${projectType}) não possui frontend reativo compatível, mas o código gerado inclui React/TSX ou páginas de frontend fora de um fluxo de migração ou expansão explicitamente justificado.`);
    }
  }

  if (frontendFramework !== 'nextjs' && hasNextStructure) {
    issues.push('A stack detectada no repositório não usa Next.js, mas o código gerado introduz estrutura de app/pages típica do framework sem justificativa explícita.');
  }

  return {
    compatible: issues.length === 0,
    expectedProjectType: projectType,
    expectedStackProfile: { backendFramework, frontendFramework, frontendType, repoShape },
    detectedPatterns,
    offendingFiles: [...new Set(offendingFiles.filter(Boolean))],
    issues,
  };
}

export function normalizeCodeReviewResult(reviewResult = {}) {
  const blockingIssues = [...new Set((reviewResult.blocking_issues || [])
    .map(issue => String(issue || '').trim())
    .filter(Boolean))];
  const warnings = [...new Set((reviewResult.warnings || [])
    .map(issue => String(issue || '').trim())
    .filter(Boolean))];
  const correctedFiles = Array.isArray(reviewResult.corrected_files) ? reviewResult.corrected_files : [];
  const approvedFlag = reviewResult.approved === true;
  const approved = approvedFlag && blockingIssues.length === 0;

  return {
    ...reviewResult,
    approved,
    blocking_issues: blockingIssues,
    warnings,
    corrected_files: correctedFiles,
    review_status: approved ? 'approved' : 'blocked',
  };
}

function normalizeIssueSeverity(issue) {
  if (typeof issue === 'string') {
    const lowered = issue.toLowerCase();
    if (lowered.includes('critical') || lowered.includes('crítico')) return 'critical';
    if (lowered.includes('high') || lowered.includes('alta') || lowered.includes('alto')) return 'high';
    if (lowered.includes('medium') || lowered.includes('média') || lowered.includes('medio') || lowered.includes('médio')) return 'medium';
    return 'unknown';
  }

  const severity = String(issue?.severity || issue?.level || issue?.type || '').toLowerCase();
  if (severity.includes('critical') || severity.includes('crítico')) return 'critical';
  if (severity.includes('high') || severity.includes('alta') || severity.includes('alto')) return 'high';
  if (severity.includes('medium') || severity.includes('média') || severity.includes('medio') || severity.includes('médio')) return 'medium';
  return severity || 'unknown';
}

function normalizeIssueDescription(issue) {
  if (typeof issue === 'string') {
    return issue.trim();
  }

  return String(issue?.description || issue?.title || issue?.summary || issue?.message || 'Issue sem descrição detalhada').trim();
}

export function deriveSecurityGatewayOutcome(securityResult = {}) {
  const vulnerabilities = Array.isArray(securityResult.vulnerabilities)
    ? securityResult.vulnerabilities
    : [];

  const documentedFindings = vulnerabilities
    .map(vulnerability => ({
      severity: vulnerability?.severity || 'unknown',
      category: vulnerability?.category || 'unspecified',
      description: vulnerability?.description || 'Finding sem descrição detalhada',
    }));

  const highlightedFindings = documentedFindings.filter(vulnerability => {
    const severity = String(vulnerability.severity || '').toLowerCase();
    return severity === 'critical' || severity === 'crítico' || severity === 'high' || severity === 'alto';
  });

  const hasFindings = documentedFindings.length > 0;
  const normalizedStatus = hasFindings
    ? 'approved_with_warnings'
    : (securityResult.security_status || 'approved');
  const gatewayStatus = hasFindings ? 'approved_with_warnings' : 'approved';
  const summary = hasFindings
    ? `Achados de segurança documentados sem bloqueio automático: ${documentedFindings.map(v => `[${v.severity}] ${v.category}`).join(', ')}`
    : 'Nenhum achado de segurança bloqueante documentado.';

  return {
    ...securityResult,
    approved: true,
    security_status: normalizedStatus,
    vulnerabilities,
    documented_findings: documentedFindings,
    gatewayStatus,
    gatewayReason: null,
    summary,
    hasWarnings: hasFindings,
    highlightedFindings,
  };
}

export function applyDeterministicReviewGuards(reviewResult, repositoryAnalysis, reviewedCode, triggerType = 'feature') {
  const normalizedReview = normalizeCodeReviewResult(reviewResult || {});
  const stackAssessment = assessStackAdherence(repositoryAnalysis, reviewedCode, triggerType);

  if (normalizedReview.approved && !stackAssessment.compatible) {
    return {
      reviewResult: normalizeCodeReviewResult({
        ...normalizedReview,
        approved: false,
        blocking_issues: [...new Set([...(normalizedReview.blocking_issues || []), ...stackAssessment.issues])],
        review_summary: `${normalizedReview.review_summary || ''} Validação determinística de stack reprovou a entrega.`.trim(),
      }),
      stackAssessment,
    };
  }

  return {
    reviewResult: normalizedReview,
    stackAssessment,
  };
}

export function deriveQAGatewayDecision(qaResult = {}, runnerResults = {}, coverageTarget = 80, options = {}) {
  const qaIteration = Number(options?.qaIteration || 1);
  const regressionTolerancePoints = Number(options?.regressionTolerancePoints ?? 2);
  const testsRan = runnerResults?.ran === true;
  const hasStructuredTestResults = !!runnerResults?.testResults;
  const hasStructuredCoverage = !!runnerResults?.coverage;
  const coverageSource = runnerResults?.coverageSource || runnerResults?.coverage?.source || null;
  const runnerActuallyRan = testsRan && hasStructuredTestResults && hasStructuredCoverage;
  const coverageMissingAfterExecution = testsRan && !hasStructuredCoverage;
  const testResultsMissingAfterExecution = testsRan && !hasStructuredTestResults;
  const qaCoverage = Number(qaResult.coverage_percentage || 0);
  const coverageOk = runnerActuallyRan && qaCoverage >= coverageTarget;
  const rawCoverageRegression = runnerActuallyRan && qaResult.coverage_regression === true;
  const coverageDelta = Number.isFinite(Number(qaResult?.coverage_delta)) ? Number(qaResult.coverage_delta) : null;
  const toleratedCoverageRegression = rawCoverageRegression && qaIteration > 1;
  const coverageRegressionPreventApproval = rawCoverageRegression && !toleratedCoverageRegression;
  const issues = Array.isArray(qaResult.issues_found) ? qaResult.issues_found : [];
  const issueSeverities = issues.map(normalizeIssueSeverity);
  const issueSummaries = issues.map((issue, index) => ({
    severity: issueSeverities[index] || 'unknown',
    description: normalizeIssueDescription(issue),
  }));
  const highlightedIssues = issueSummaries.filter(issue => issue.severity === 'critical' || issue.severity === 'high');
  const hasCriticalIssues = issueSeverities.includes('critical');
  const hasHighIssues = issueSeverities.includes('high');
  const hasBlockingIssues = hasCriticalIssues || hasHighIssues;
  const toleratedBlockingIssuesAfterRetry = hasBlockingIssues && qaIteration > 1;
  const blockingIssuesPreventApproval = hasBlockingIssues && !toleratedBlockingIssuesAfterRetry;
  const llmApproved = qaResult.approved === true;
  const deterministicPass = runnerActuallyRan && coverageOk && !coverageRegressionPreventApproval && !blockingIssuesPreventApproval;
  const qaApproved = llmApproved || deterministicPass;

  const warnings = [
    coverageSource ? `Cobertura estruturada coletada via ${coverageSource}` : null,
    toleratedCoverageRegression
      ? `Regressão de cobertura mantida apenas como warning após retry: ${coverageDelta !== null ? `${coverageDelta}% em relação ao baseline` : 'delta não informado'}${Number.isFinite(regressionTolerancePoints) ? ` (tolerância configurada anterior: -${regressionTolerancePoints}%)` : ''}`
      : null,
    toleratedBlockingIssuesAfterRetry
      ? `Issues altas/críticas mantidas como warning após retry: ${highlightedIssues.map(issue => `[${issue.severity}] ${issue.description}`).join('; ')}`
      : null,
  ].filter(Boolean);

  const reason = [
    !testsRan ? 'Sem evidência real de execução de testes' : null,
    coverageMissingAfterExecution ? 'Testes executados, mas sem cobertura estruturada coletada pelo QA Runner' : null,
    testResultsMissingAfterExecution ? 'Testes executados, mas sem resultados estruturados de testes coletados pelo QA Runner' : null,
    !qaApproved && !deterministicPass && !llmApproved ? 'QA não aprovado pelo agente' : null,
    runnerActuallyRan && !coverageOk ? `Cobertura insuficiente: ${qaCoverage}% (mínimo ${coverageTarget}%) — medição real via runner` : null,
    coverageRegressionPreventApproval ? `Regressão de cobertura: ${coverageDelta}% abaixo do baseline` : null,
    blockingIssuesPreventApproval ? 'Issues altas ou críticas encontradas pelo QA' : null,
  ].filter(Boolean).join('; ');

  return {
    qaApproved,
    qaCoverage,
    coverageTarget,
    testsRan,
    hasStructuredTestResults,
    hasStructuredCoverage,
    coverageSource,
    coverageMissingAfterExecution,
    testResultsMissingAfterExecution,
    runnerActuallyRan,
    coverageOk,
    rawCoverageRegression,
    coverageDelta,
    toleratedCoverageRegression,
    coverageRegressionPreventApproval,
    regressionTolerancePoints,
    qaIteration,
    issueSummaries,
    highlightedIssues,
    hasCriticalIssues,
    hasHighIssues,
    hasBlockingIssues,
    toleratedBlockingIssuesAfterRetry,
    blockingIssuesPreventApproval,
    llmApproved,
    deterministicPass,
    warnings,
    reason,
  };
}

export function finalizeExecutionTerminalState(execution, status, error = null) {
  if (!execution || typeof execution !== 'object') {
    return execution;
  }

  updateExecutionTracking(execution, { status });
  if (!execution.completedAt) {
    execution.completedAt = new Date();
  }

  if (error) {
    execution.error = error;
  }

  if (status === 'completed') {
    execution.resume.resumeEligible = false;
    execution.resume.resumeInProgress = false;
    execution.resume.failedStage = null;
    execution.resume.resumeFromStage = null;
    execution.resume.requiresManualIntervention = false;
    execution.resume.manualInterventionReason = null;
  } else if (status === 'failed' || status === 'blocked_by_qa' || status === 'blocked_by_review') {
    execution.resume.resumeEligible = true;
    execution.resume.resumeInProgress = false;
    execution.resume.failedStage = execution.resume.failedStage || execution.currentStage || null;
    execution.resume.resumeFromStage = execution.resume.resumeFromStage || execution.resume.failedStage || execution.currentStage || null;
    execution.resume.requiresManualIntervention = true;
    execution.resume.manualInterventionReason = execution.resume.manualInterventionReason || error || execution.error || null;
  }

  return execution;
}

function buildDeveloperRetrySpec({
  analysis,
  repositoryContext,
  currentCode,
  triggerType,
  reviewResult = null,
  qaResult = null,
  qaGateway = null,
  runnerResults = null,
  stackAssessment = null,
  iteration = 1,
}) {
  const baselineCoverage = runnerResults?.baseline?.overall;
  const measuredCoverage = runnerResults?.coverage?.overall;
  const generatedFiles = [
    ...((currentCode?.files || []).map(file => typeof file === 'object'
      ? { path: file.path, issue: 'revisar implementação e cobertura associada' }
      : { path: file, issue: 'revisar implementação e cobertura associada' })),
    ...((currentCode?.tests || []).map(file => typeof file === 'object'
      ? { path: file.path, issue: 'expandir ou corrigir testes automatizados' }
      : { path: file, issue: 'expandir ou corrigir testes automatizados' })),
  ];

  return JSON.stringify({
    analysis,
    repositoryContext,
    triggerType,
    retry_context: {
      source_stage: 'qa',
      iteration,
      qa_gateway_reason: qaGateway?.reason || 'QA bloqueado sem razão detalhada',
      qa_approved: qaGateway?.qaApproved === true,
      llm_approved: qaGateway?.llmApproved === true,
      deterministic_runner_approved: qaGateway?.deterministicPass === true,
      measured_coverage: measuredCoverage ?? qaResult?.coverage_percentage ?? null,
      baseline_coverage: baselineCoverage ?? null,
      coverage_delta: qaResult?.coverage_delta ?? null,
      coverage_regression: qaResult?.coverage_regression === true,
      coverage_source: runnerResults?.coverageSource || runnerResults?.coverage?.source || null,
      runner_framework: runnerResults?.framework || null,
      runner_execution: qaResult?.runner_execution || null,
      runner_errors: runnerResults?.errors || [],
      failing_test_summary: runnerResults?.testResults || null,
      qa_issues_found: qaResult?.issues_found || [],
      qa_test_cases: qaResult?.test_cases || [],
      qa_recommendations: qaResult?.recommendations || [],
      review_blocking_issues: reviewResult?.blocking_issues || [],
      review_warnings: reviewResult?.warnings || [],
      stack_assessment: stackAssessment || null,
    },
    previous_files: generatedFiles,
    instruction: 'O QA gateway bloqueou a entrega. Corrija a implementação e crie ou ajuste os testes automatizados necessários para eliminar issues altas/críticas, recuperar no mínimo a cobertura baseline do repositório quando houver baseline real e manter a stack detectada. Gere novamente o código completo com conteúdo real em cada arquivo, preservando mudança mínima compatível e incluindo testes suficientes para aprovação do QA.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal pipeline runner — shared by both exported entry points
// ─────────────────────────────────────────────────────────────────────────────
async function runPipeline(pipelineId, requirement, executionId, repositoryPath, emitter, triggerType = 'feature', options = {}) {
  const existingExecution = options?.existingExecution || null;
  const resumeFromStage = options?.resumeFromStage || null;
  const execution = existingExecution
    ? updateExecutionTracking(existingExecution, {
        requirement: existingExecution.requirement || requirement,
        executionId: existingExecution.executionId || executionId || null,
        repositoryPath: existingExecution.repositoryPath || repositoryPath || null,
        triggerType: existingExecution.triggerType || triggerType,
        mode: options.mode || existingExecution.mode || 'resume',
        status: 'running',
        completedAt: null,
      })
    : initializeExecutionRecord({
        pipelineId,
        requirement,
        executionId,
        repositoryPath,
        triggerType,
        mode: options.mode || 'default',
      });

  execution.repositoryPath = execution.repositoryPath || repositoryPath || null;
  execution.triggerType = execution.triggerType || triggerType;
  execution.requirement = execution.requirement || requirement;
  execution.executionId = execution.executionId || executionId || null;
  execution.artifacts = buildExecutionArtifacts(pipelineId);

  if (resumeFromStage) {
    execution.resume.resumeInProgress = true;
    execution.resume.resumeFromStage = resumeFromStage;
    execution.logs.push({
      timestamp: new Date(),
      message: `Resuming pipeline from stage ${resumeFromStage}...`,
      level: 'warn',
    });
  }

  pipelineExecutions.set(pipelineId, execution);
  const log = logger.child({ pipelineId, executionId: execution.executionId || executionId || 'local' });
  const documenter = new DocumenterAgentWithSkill();
  saveExecutionToDisk(execution);

  try {
    let repositoryAnalysis = execution.repositoryAnalysis || null;
    let requirementWithContext = execution.requirementWithContext || requirement;
    let specification = execution.stages.specification?.result || null;
    let analysis = execution.stages.analysis?.result || null;
    let designSpecs = execution.stages.ux_design?.result || null;

    if (shouldRunStage(resumeFromStage, 'specification') || !specification) {
      log.info('STAGE 0: SPECIFICATION');
      execution.logs.push({ timestamp: new Date(), message: 'Starting specification stage (Spec-Driven Development)...', level: 'info' });
      markStageRunning(execution, 'specification', { input: { requirement, repositoryPath: execution.repositoryPath } });

      requirementWithContext = requirement;
      if (execution.repositoryPath && fs.existsSync(execution.repositoryPath)) {
        log.info('Analisando repositório para extrair contexto');
        execution.logs.push({ timestamp: new Date(), message: 'Analyzing repository structure...', level: 'info' });
        try {
          repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(execution.repositoryPath);
          const analysisSummary = RepositoryAnalyzer.generateSummary(repositoryAnalysis);
          requirementWithContext = `${requirement}

## Contexto do Repositório
${analysisSummary}`;
          execution.repositoryAnalysis = repositoryAnalysis;
          execution.requirementWithContext = requirementWithContext;
          persistDerivedExecutionState(execution, 'repository-analysis', repositoryAnalysis);
          persistDerivedExecutionState(execution, 'requirement-with-context', { requirementWithContext });
          execution.logs.push({ timestamp: new Date(), message: `Repository analysis completed: ${repositoryAnalysis.endpoints.length} endpoints, ${repositoryAnalysis.functions.length} functions`, level: 'info' });
          log.info('Repository analysis completed', { endpoints: repositoryAnalysis.endpoints.length, functions: repositoryAnalysis.functions.length });
        } catch (analysisError) {
          log.warn('Repository analysis failed', { error: analysisError.message });
          execution.logs.push({ timestamp: new Date(), message: `Repository analysis failed: ${analysisError.message}`, level: 'warning' });
        }
      }

      const specAgent = new SpecAgentWithSkill();
      const specStart = Date.now();
      specification = await specAgent.generateSpecification(requirementWithContext);
      const specDuration = `${Date.now() - specStart}ms`;

      execution.stages.specification = { status: 'completed', result: specification, duration: specDuration };
      persistDerivedExecutionState(execution, 'specification', specification);
      markStageCompleted(execution, 'specification', specification, {
        input: { requirement: requirementWithContext },
        metadata: { duration: specDuration },
        stagePatch: { result: specification, duration: specDuration },
      });
      execution.logs.push({ timestamp: new Date(), message: 'Specification created', level: 'success' });
      log.info('Specification completed', { duration: specDuration });
      emitter?.emit('progress', { stage: 'specification', stageIndex: 0, status: 'completed', duration: specDuration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'specification', status: 'completed' });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'specification', requirement, input: { requirement }, output: specification });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for specification', { error: docError.message });
      }
    } else {
      execution.logs.push({ timestamp: new Date(), message: 'Skipping specification stage due to resume checkpoint.', level: 'info' });
    }

    if (shouldRunStage(resumeFromStage, 'analysis') || !analysis) {
      log.info('STAGE 1: ANALYSIS');
      execution.logs.push({ timestamp: new Date(), message: 'Starting analysis stage...', level: 'info' });
      markStageRunning(execution, 'analysis', { input: specification });

      const analysisStart = Date.now();
      analysis = await analystAgent(`Based on this specification, generate user stories and technical requirements:
${JSON.stringify(specification)}`);
      const analysisDuration = `${Date.now() - analysisStart}ms`;

      execution.stages.analysis = { status: 'completed', result: analysis, duration: analysisDuration };
      persistDerivedExecutionState(execution, 'analysis', analysis);
      markStageCompleted(execution, 'analysis', analysis, {
        input: specification,
        metadata: { duration: analysisDuration },
        stagePatch: { result: analysis, duration: analysisDuration },
      });
      execution.logs.push({ timestamp: new Date(), message: 'Analysis completed', level: 'success' });
      log.info('Analysis completed', { duration: analysisDuration });
      emitter?.emit('progress', { stage: 'analysis', stageIndex: 1, status: 'completed', duration: analysisDuration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'analysis', status: 'completed' });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'analysis', requirement, input: specification, output: analysis });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for analysis', { error: docError.message });
      }
    } else {
      execution.logs.push({ timestamp: new Date(), message: 'Skipping analysis stage due to resume checkpoint.', level: 'info' });
    }

    if (shouldRunStage(resumeFromStage, 'ux_design') || !designSpecs) {
      log.info('STAGE 2: UI/UX DESIGN');
      execution.logs.push({ timestamp: new Date(), message: 'Starting UI/UX design stage...', level: 'info' });
      markStageRunning(execution, 'ux_design', { input: analysis });

      const uiuxAgent = new UIUXAgentWithSkill();
      const uxStart = Date.now();
      designSpecs = await uiuxAgent.applySkillToDesign(analysis.user_stories || [], analysis.technical_requirements || []);
      const uxDuration = `${Date.now() - uxStart}ms`;

      execution.stages.ux_design = { status: 'completed', result: designSpecs, duration: uxDuration };
      persistDerivedExecutionState(execution, 'ux-design', designSpecs);
      markStageCompleted(execution, 'ux_design', designSpecs, {
        input: analysis,
        metadata: { duration: uxDuration },
        stagePatch: { result: designSpecs, duration: uxDuration },
      });
      execution.logs.push({ timestamp: new Date(), message: 'Design specifications created', level: 'success' });
      log.info('UI/UX Design completed', { duration: uxDuration });
      emitter?.emit('progress', { stage: 'ux_design', stageIndex: 2, status: 'completed', duration: uxDuration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'ux_design', status: 'completed' });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'ux_design', requirement, input: analysis, output: designSpecs });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for UI/UX design', { error: docError.message });
      }
    } else {
      execution.logs.push({ timestamp: new Date(), message: 'Skipping UI/UX stage due to resume checkpoint.', level: 'info' });
    }

    let repoModuleType = 'commonjs';
    if (execution.repositoryPath) {
      try {
        const pkgPath = path.join(execution.repositoryPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.type === 'module') repoModuleType = 'esm';
        }
      } catch (_) { /* ignore */ }
    }

    const devInput = {
      analysis,
      repositoryContext: repositoryAnalysis ? {
        projectType: repositoryAnalysis.type,
        stackProfile: repositoryAnalysis.stackProfile || null,
        moduleType: repoModuleType,
        fileCount: repositoryAnalysis.fileCount || repositoryAnalysis.files?.length || 0,
        existingDependencies: repositoryAnalysis.dependencies?.runtime || [],
        mainFiles: (repositoryAnalysis.mainFiles || []).map(f => f.relativePath || f.path),
        endpoints: (repositoryAnalysis.endpoints || []).slice(0, 20),
        stackConstraints: {
          preserveDetectedStack: true,
          allowCrossStackGenerationOnlyForMigration: true,
          expectedProjectType: repositoryAnalysis.type,
          expectedBackendFramework: repositoryAnalysis.stackProfile?.backendFramework || 'none',
          expectedFrontendFramework: repositoryAnalysis.stackProfile?.frontendFramework || 'none',
          expectedRepoShape: repositoryAnalysis.stackProfile?.repoShape || 'single-app',
        },
        changePolicy: {
          mode: ['feature', 'bugfix', 'refactor'].includes(triggerType) ? 'minimal-compatible' : 'standard',
          repositorySize: (repositoryAnalysis.fileCount || repositoryAnalysis.files?.length || 0) <= 20 ? 'small' : 'normal',
          requireArchitectureJustificationForExpansion: true,
        },
      } : null,
    };

    const CODE_REVIEW_MAX_RETRIES = 2;
    const QA_DEVELOPER_MAX_RETRIES = 2;
    let currentDevSpec = execution.pendingDevelopmentSpec || JSON.stringify(devInput);
    let reviewedCode = execution.finalArtifact || execution.stages.code_review?.output || execution.stages.development?.result || null;
    let reviewResult = execution.stages.code_review?.result || null;
    let qaResult = execution.stages.qa?.result || null;
    let qaGateway = execution.stages.qa?.gatewayDecision || null;
    let runnerResults = execution.stages.qa?.runnerResults || null;
    let latestStackAssessment = execution.stages.development?.stackAssessment || null;

    let qaDevIterationStart = 1;
    if (resumeFromStage === 'development' && execution.stages.qa?.gatewayStatus === 'blocked') {
      qaDevIterationStart = Math.min((Number(execution.iterations?.qaDevIteration || 1) + 1), QA_DEVELOPER_MAX_RETRIES);
    } else if (resumeFromStage === 'development' && execution.iterations?.qaDevIteration) {
      qaDevIterationStart = Number(execution.iterations.qaDevIteration);
    }

    for (let qaDevIteration = qaDevIterationStart; qaDevIteration <= QA_DEVELOPER_MAX_RETRIES; qaDevIteration++) {
      const isRetryIteration = qaDevIteration > 1;
      execution.iterations.qaDevIteration = qaDevIteration;
      saveExecutionToDisk(execution);

      log.info('STAGE 3: DEVELOPMENT');
      execution.logs.push({
        timestamp: new Date(),
        message: isRetryIteration
          ? `Restarting development stage after QA feedback (iteration ${qaDevIteration}/${QA_DEVELOPER_MAX_RETRIES})...`
          : 'Starting development stage...',
        level: isRetryIteration ? 'warn' : 'info'
      });
      markStageRunning(execution, 'development', {
        input: { currentDevSpec, triggerType, iteration: qaDevIteration },
        metadata: { qaDevIteration },
      });
      persistDerivedExecutionState(execution, 'pending-development-spec', { currentDevSpec, qaDevIteration });

      const devStart = Date.now();
      const generatedCode = await developerAgent(currentDevSpec, triggerType);
      const devDuration = `${Date.now() - devStart}ms`;
      const initialStackAssessment = assessStackAdherence(repositoryAnalysis, generatedCode, triggerType);

      execution.stages.development = {
        status: 'completed',
        result: generatedCode,
        duration: devDuration,
        stackAssessment: initialStackAssessment,
        iteration: qaDevIteration,
      };
      execution.pendingDevelopmentSpec = null;
      execution.logs.push({ timestamp: new Date(), message: `Code generated${isRetryIteration ? ` após feedback de QA (iteração ${qaDevIteration})` : ''}`, level: 'success' });
      log.info('Code generated', { duration: devDuration, iteration: qaDevIteration });
      persistDerivedExecutionState(execution, 'development-latest', generatedCode);
      markStageCompleted(execution, 'development', generatedCode, {
        input: { currentDevSpec, triggerType, iteration: qaDevIteration },
        metadata: { duration: devDuration, qaDevIteration },
        stagePatch: {
          result: generatedCode,
          duration: devDuration,
          stackAssessment: initialStackAssessment,
          iteration: qaDevIteration,
        },
      });
      emitter?.emit('progress', { stage: 'development', stageIndex: 3, status: 'completed', duration: devDuration, iteration: qaDevIteration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'development', status: 'completed', iteration: qaDevIteration });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'development', requirement, input: analysis, output: generatedCode });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for development', { error: docError.message });
      }

      log.info('STAGE 4: CODE REVIEW');
      execution.logs.push({ timestamp: new Date(), message: 'Starting code review stage...', level: 'info' });
      markStageRunning(execution, 'code_review', {
        input: { iteration: qaDevIteration },
        metadata: { qaDevIteration },
      });

      reviewedCode = generatedCode;
      reviewResult = null;

      for (let attempt = 1; attempt <= CODE_REVIEW_MAX_RETRIES; attempt++) {
        const reviewStart = Date.now();
        const rawReviewResult = await codeReviewAgent(reviewedCode, triggerType, devInput.repositoryContext || {});

        if (rawReviewResult?.corrected_files?.length > 0) {
          const correctedPaths = new Set(rawReviewResult.corrected_files.map(f => f.path));
          const originalFiles = (reviewedCode.files || []).filter(f => !correctedPaths.has(f.path));
          reviewedCode = { ...reviewedCode, files: [...originalFiles, ...rawReviewResult.corrected_files] };
        }

        const reviewGuarded = applyDeterministicReviewGuards(rawReviewResult, repositoryAnalysis, reviewedCode, triggerType);
        reviewResult = reviewGuarded.reviewResult;
        latestStackAssessment = reviewGuarded.stackAssessment;
        const reviewDuration = `${Date.now() - reviewStart}ms`;

        log.info('Code review completed', {
          attempt,
          qaDevIteration,
          approved: reviewResult.approved,
          status: reviewResult.review_status,
          blockingIssues: reviewResult.blocking_issues.length,
          score: reviewResult.quality_score,
          duration: reviewDuration,
          detectedPatterns: latestStackAssessment.detectedPatterns,
        });
        execution.logs.push({
          timestamp: new Date(),
          message: `Code review (attempt ${attempt}, iteration ${qaDevIteration}): ${reviewResult.approved ? 'aprovado' : 'bloqueado'} — score ${reviewResult.quality_score ?? 'N/A'}${reviewResult.blocking_issues.length > 0 ? ` — issues bloqueantes: ${reviewResult.blocking_issues.length}` : ''}`,
          level: reviewResult.approved ? 'success' : 'warn'
        });

        if (rawReviewResult?.corrected_files?.length > 0) {
          execution.logs.push({ timestamp: new Date(), message: `Code review aplicou ${rawReviewResult.corrected_files.length} correção(ões) menor(es)`, level: 'info' });
        }

        if (!latestStackAssessment.compatible) {
          execution.logs.push({ timestamp: new Date(), message: `Validação de stack bloqueou a entrega: ${latestStackAssessment.issues.join('; ')}${latestStackAssessment.offendingFiles?.length ? ` | arquivos: ${latestStackAssessment.offendingFiles.join(', ')}` : ''}`, level: 'warn' });
        }

        if (reviewResult.approved) {
          break;
        }

        if (attempt < CODE_REVIEW_MAX_RETRIES) {
          execution.iterations.codeReviewRetryCount = attempt;
          log.warn('Code review blocked — re-sending to developer agent', { attempt, iteration: qaDevIteration, issues: reviewResult.blocking_issues });
          execution.logs.push({ timestamp: new Date(), message: `Re-enviando ao developer (tentativa ${attempt + 1}): ${reviewResult.blocking_issues.join('; ')}`, level: 'warn' });
          emitter?.emit('progress', { stage: 'code_review', stageIndex: 4, status: 'retry', attempt, iteration: qaDevIteration });

          const correctionSpec = JSON.stringify({
            analysis: devInput.analysis,
            repositoryContext: devInput.repositoryContext,
            blocking_issues: reviewResult.blocking_issues,
            warnings: reviewResult.warnings,
            previous_files: (reviewedCode.files || []).map(f =>
              typeof f === 'object' ? { path: f.path, issue: 'revisar conteúdo' } : f
            ),
            stack_guard: {
              expected_project_type: devInput.repositoryContext?.projectType || repositoryAnalysis?.type || 'unknown',
              forbidden_patterns_for_current_stack: ['*.tsx', '*.jsx', '**/frontend/**', '**/components/**', '*.module.ts', '*.controller.ts', '*.service.ts', '**/dto/**', '**/entities/**'],
              offending_files: assessStackAdherence(repositoryAnalysis, reviewedCode, triggerType).offendingFiles || [],
            },
            instruction: 'Corrija os blocking_issues listados e gere novamente o código completo com conteúdo real em cada arquivo, preservando estritamente a stack detectada. Remova da resposta qualquer arquivo incompatível com a stack atual, minimize mudanças e justifique explicitamente qualquer expansão arquitetural inevitável.',
          });
          reviewedCode = await developerAgent(correctionSpec, triggerType);
        }
      }

      execution.stages.code_review = {
        status: 'completed',
        result: reviewResult,
        approved: reviewResult.approved,
        output: reviewedCode,
        iteration: qaDevIteration,
      };
      execution.finalArtifact = reviewedCode;
      markStageCompleted(execution, 'code_review', reviewResult, {
        input: { iteration: qaDevIteration },
        output: { reviewResult, reviewedCode },
        metadata: { qaDevIteration },
        stagePatch: {
          result: reviewResult,
          approved: reviewResult.approved,
          output: reviewedCode,
          iteration: qaDevIteration,
        },
      });
      emitter?.emit('progress', { stage: 'code_review', stageIndex: 4, status: 'completed', approved: reviewResult.approved, iteration: qaDevIteration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'code_review', status: reviewResult.approved ? 'completed' : 'blocked', iteration: qaDevIteration });

      if (!reviewResult.approved) {
        const blockingError = `Code Review bloqueou após ${CODE_REVIEW_MAX_RETRIES} tentativas: ${reviewResult.blocking_issues.join('; ')}`;
        markStageBlocked(execution, 'code_review', blockingError, {
          resumeFromStage: 'development',
          output: { reviewResult, reviewedCode },
          metadata: { qaDevIteration },
          stagePatch: {
            result: reviewResult,
            approved: false,
            output: reviewedCode,
            iteration: qaDevIteration,
          },
        });
        finalizeExecutionTerminalState(execution, 'blocked_by_review', blockingError);
        execution.logs.push({ timestamp: new Date(), message: execution.error, level: 'error' });
        log.error('Code Review blocked pipeline', { issues: reviewResult.blocking_issues, iteration: qaDevIteration });
        emitter?.emit('error', { message: execution.error, pipelineId });
        saveExecutionToDisk(execution);
        return execution;
      }

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'code_review', requirement, input: generatedCode, output: reviewResult });
        execution.documentation.push(docResult);
      } catch (docError) {
        log.warn('Documentation generation failed for code review', { error: docError.message });
      }

      log.info('STAGE 5: SECURITY');
      execution.logs.push({ timestamp: new Date(), message: 'Starting security stage...', level: 'info' });
      markStageRunning(execution, 'security', { input: reviewedCode, metadata: { qaDevIteration } });

      const securityStart = Date.now();
      const rawSecurityResult = await securityAgent(reviewedCode, triggerType);
      const securityResult = deriveSecurityGatewayOutcome(rawSecurityResult);
      const securityDuration = `${Date.now() - securityStart}ms`;

      execution.stages.security = { status: 'completed', result: securityResult, duration: securityDuration, iteration: qaDevIteration };
      markStageCompleted(execution, 'security', securityResult, {
        input: reviewedCode,
        metadata: { duration: securityDuration, qaDevIteration },
        stagePatch: { result: securityResult, duration: securityDuration, iteration: qaDevIteration },
      });
      execution.logs.push({ timestamp: new Date(), message: `Security check: ${securityResult.security_status}`, level: securityResult.hasWarnings ? 'warn' : 'success' });
      log.info('Security check completed', {
        status: securityResult.security_status,
        duration: securityDuration,
        vulnerabilities: securityResult.vulnerabilities.length,
        gatewayStatus: securityResult.gatewayStatus,
        iteration: qaDevIteration,
      });
      emitter?.emit('progress', { stage: 'security', stageIndex: 5, status: 'completed', duration: securityDuration, warnings: securityResult.vulnerabilities.length, iteration: qaDevIteration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'security', status: 'completed', iteration: qaDevIteration });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'security', requirement, input: reviewedCode, output: securityResult });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for security', { error: docError.message });
      }

      execution.stages.security.gatewayStatus = securityResult.gatewayStatus;
      execution.stages.security.gatewayReason = securityResult.gatewayReason;
      execution.finalArtifact = reviewedCode;

      if (securityResult.hasWarnings) {
        execution.logs.push({ timestamp: new Date(), message: `Security Gateway registrou achados sem bloqueio: ${securityResult.summary}`, level: 'warning' });
        log.warn('Security Gateway recorded findings without blocking', {
          vulnerabilities: securityResult.vulnerabilities.length,
          highlightedFindings: securityResult.highlightedFindings.length,
          iteration: qaDevIteration,
        });
        emitter?.emit('security_warnings', {
          pipelineId,
          vulnerabilities: securityResult.vulnerabilities,
          summary: securityResult.summary,
        });
      } else {
        log.info('Security Gateway approved without findings');
      }

      log.info('STAGE 6: QA/TESTING');
      execution.logs.push({ timestamp: new Date(), message: 'Starting QA stage...', level: 'info' });
      markStageRunning(execution, 'qa', { input: reviewedCode, metadata: { qaDevIteration } });

      const qaStart = Date.now();
      runnerResults = null;
      if (execution.repositoryPath) {
        execution.logs.push({ timestamp: new Date(), message: 'Running real tests and collecting coverage...', level: 'info' });
        try {
          runnerResults = await QARunner.run(execution.repositoryPath, reviewedCode);
          const coverageMsg = runnerResults.coverage
            ? `coverage: ${runnerResults.coverage.overall}%${runnerResults.coverageSource ? ` via ${runnerResults.coverageSource}` : ''}`
            : (runnerResults.errors?.length > 0 ? runnerResults.errors[0] : 'coverage não disponível');
          execution.logs.push({ timestamp: new Date(), message: `QA Runner: ${runnerResults.ran ? 'executado' : 'não executado'} — ${coverageMsg}`, level: runnerResults.coverage ? 'info' : 'warning' });
          log.info('QA Runner completed', {
            ran: runnerResults.ran,
            coverage: runnerResults.coverage?.overall,
            coverageSource: runnerResults.coverageSource,
            framework: runnerResults.framework,
            iteration: qaDevIteration,
            hasStructuredCoverage: !!runnerResults.coverage,
            hasStructuredTestResults: !!runnerResults.testResults,
          });
          persistDerivedExecutionState(execution, 'qa-runner-latest', runnerResults);
        } catch (runnerError) {
          log.warn('QA Runner failed — proceeding with LLM-only QA', { error: runnerError.message, iteration: qaDevIteration });
          execution.logs.push({ timestamp: new Date(), message: `QA Runner falhou: ${runnerError.message} — usando QA apenas via LLM`, level: 'warning' });
        }
      }

      let qaInput;
      if (reviewedCode.files?.length > 0) {
        const implSection = `## Arquivos de implementação\n\n${reviewedCode.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`;
        const testsSection = reviewedCode.tests?.length > 0
          ? `\n\n## Arquivos de teste\n\n${reviewedCode.tests.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`
          : '\n\n## Arquivos de teste\n\n(nenhum arquivo de teste gerado pelo developer agent)';
        qaInput = { code: implSection + testsSection, runnerResults, repositoryContext: devInput.repositoryContext || null };
      } else if (reviewedCode.code) {
        qaInput = { code: `Linguagem: ${reviewedCode.language || 'desconhecida'}\n\nCódigo:\n${reviewedCode.code}`, runnerResults, repositoryContext: devInput.repositoryContext || null };
      } else {
        qaInput = { code: JSON.stringify(reviewedCode), runnerResults, repositoryContext: devInput.repositoryContext || null };
      }

      qaResult = await qaAgent(qaInput, triggerType);
      const qaDuration = `${Date.now() - qaStart}ms`;

      execution.stages.qa = { status: 'completed', result: qaResult, duration: qaDuration, iteration: qaDevIteration, runnerResults };
      execution.logs.push({ timestamp: new Date(), message: 'QA tests completed', level: 'success' });
      log.info('QA completed', { duration: qaDuration, iteration: qaDevIteration });
      emitter?.emit('progress', { stage: 'qa', stageIndex: 6, status: 'completed', duration: qaDuration, iteration: qaDevIteration });
      emitter?.emit('checkpoint', { pipelineId, stage: 'qa', status: 'completed', iteration: qaDevIteration });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'qa', requirement, input: generatedCode, output: qaResult });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for QA', { error: docError.message });
      }

      qaGateway = deriveQAGatewayDecision(qaResult, runnerResults, 80, {
        qaIteration: qaDevIteration,
        regressionTolerancePoints: 2,
      });

      execution.stages.qa.gatewayStatus = qaGateway.qaApproved ? 'approved' : 'blocked';
      execution.stages.qa.gatewayReason = qaGateway.qaApproved ? null : qaGateway.reason;
      execution.stages.qa.gatewayDecision = qaGateway;
      execution.stages.qa.result = {
        ...qaResult,
        approved: qaGateway.qaApproved,
        llm_approved: qaGateway.llmApproved,
        deterministic_runner_approved: qaGateway.deterministicPass,
        coverage_source: qaGateway.coverageSource || qaResult.coverage_source || runnerResults?.coverageSource || null,
        warning_issues_after_retry: qaGateway.toleratedBlockingIssuesAfterRetry === true,
        highlighted_issues: qaGateway.highlightedIssues,
        runner_evidence: {
          tests_ran: qaGateway.testsRan,
          has_structured_test_results: qaGateway.hasStructuredTestResults,
          has_structured_coverage: qaGateway.hasStructuredCoverage,
        },
      };
      markStageCompleted(execution, 'qa', execution.stages.qa.result, {
        input: { iteration: qaDevIteration },
        output: { qaResult: execution.stages.qa.result, runnerResults, qaGateway },
        metadata: { qaDevIteration, duration: qaDuration },
        stagePatch: {
          result: execution.stages.qa.result,
          duration: qaDuration,
          iteration: qaDevIteration,
          runnerResults,
          gatewayStatus: execution.stages.qa.gatewayStatus,
          gatewayReason: execution.stages.qa.gatewayReason,
          gatewayDecision: qaGateway,
        },
      });

      if (qaGateway.qaApproved) {
        if (!qaGateway.llmApproved && qaGateway.deterministicPass) {
          execution.logs.push({ timestamp: new Date(), message: 'QA Gateway aprovou por evidência determinística do runner apesar de reprovação não bloqueante do agente.', level: 'info' });
          log.info('QA Gateway approved by deterministic runner evidence', { coverage: qaGateway.qaCoverage, coverageTarget: qaGateway.coverageTarget, iteration: qaDevIteration });
        }

        if (qaGateway.warnings?.length) {
          for (const warningMessage of qaGateway.warnings) {
            execution.logs.push({ timestamp: new Date(), message: warningMessage, level: 'warning' });
          }
        }

        if (qaGateway.toleratedCoverageRegression) {
          log.warn('QA Gateway accepted tolerated coverage regression after retry', {
            coverage: qaGateway.qaCoverage,
            coverageDelta: qaGateway.coverageDelta,
            tolerance: qaGateway.regressionTolerancePoints,
            iteration: qaDevIteration,
          });
        }

        if (qaGateway.toleratedBlockingIssuesAfterRetry) {
          log.warn('QA Gateway kept high/critical QA issues as warnings after retry', {
            highlightedIssues: qaGateway.highlightedIssues,
            iteration: qaDevIteration,
          });
          execution.logs.push({
            timestamp: new Date(),
            message: `QA aprovou com warning após retry. Problemas identificados: ${qaGateway.highlightedIssues.map(issue => `[${issue.severity}] ${issue.description}`).join('; ')}`,
            level: 'warning'
          });
        }

        execution.finalArtifact = reviewedCode;
        execution.pendingDevelopmentSpec = null;
        execution.resume.resumeInProgress = false;
        log.info('QA Gateway approved', {
          coverage: qaGateway.qaCoverage,
          llmApproved: qaGateway.llmApproved,
          deterministicPass: qaGateway.deterministicPass,
          iteration: qaDevIteration,
          toleratedCoverageRegression: qaGateway.toleratedCoverageRegression === true,
        });
        break;
      }

      const canRetryAfterQABlock = qaDevIteration < QA_DEVELOPER_MAX_RETRIES;
      execution.logs.push({ timestamp: new Date(), message: `QA Gateway bloqueou: ${qaGateway.reason}`, level: 'warning' });
      log.warn('QA Gateway blocked pipeline', { reason: qaGateway.reason, coverage: qaGateway.qaCoverage, approved: qaGateway.qaApproved, iteration: qaDevIteration, canRetryAfterQABlock });

      const nextDeveloperSpec = buildDeveloperRetrySpec({
        analysis: devInput.analysis,
        repositoryContext: devInput.repositoryContext,
        currentCode: reviewedCode,
        triggerType,
        reviewResult,
        qaResult,
        qaGateway,
        runnerResults,
        stackAssessment: latestStackAssessment,
        iteration: qaDevIteration + 1,
      });
      execution.pendingDevelopmentSpec = nextDeveloperSpec;
      persistDerivedExecutionState(execution, `retry-context-development-${qaDevIteration + 1}`, {
        qaResult,
        qaGateway,
        runnerResults,
        nextDeveloperSpec,
      });

      if (!canRetryAfterQABlock) {
        markStageBlocked(execution, 'qa', qaGateway.reason, {
          resumeFromStage: 'development',
          output: { qaResult, qaGateway, runnerResults },
          metadata: { qaDevIteration },
          manualInterventionReason: qaGateway.reason,
          stagePatch: {
            result: execution.stages.qa.result,
            duration: qaDuration,
            iteration: qaDevIteration,
            runnerResults,
            gatewayStatus: 'blocked',
            gatewayReason: qaGateway.reason,
            gatewayDecision: qaGateway,
          },
        });
        finalizeExecutionTerminalState(execution, 'blocked_by_qa', qaGateway.reason);
        emitter?.emit('blocked_by_qa', { reason: qaGateway.reason, coverage: qaGateway.qaCoverage, pipelineId, resumeEligible: true, resumeFromStage: 'development' });
        saveExecutionToDisk(execution);
        return execution;
      }

      execution.iterations.qaRetryCount = qaDevIteration;
      emitter?.emit('progress', { stage: 'qa', stageIndex: 6, status: 'retry', iteration: qaDevIteration, reason: qaGateway.reason });
      execution.logs.push({ timestamp: new Date(), message: `Retornando automaticamente ao developer após bloqueio de QA (próxima iteração ${qaDevIteration + 1}/${QA_DEVELOPER_MAX_RETRIES}).`, level: 'warning' });
      currentDevSpec = nextDeveloperSpec;
    }

    log.info('STAGE 7: DEVOPS/DEPLOYMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting deployment stage...', level: 'info' });
    markStageRunning(execution, 'deployment', { input: reviewedCode });

    const deployStart = Date.now();
    const deployment = await devopsAgent(JSON.stringify(reviewedCode));
    const deployDuration = `${Date.now() - deployStart}ms`;

    execution.stages.deployment = { status: 'completed', result: deployment, duration: deployDuration };
    markStageCompleted(execution, 'deployment', deployment, {
      input: reviewedCode,
      metadata: { duration: deployDuration },
      stagePatch: { result: deployment, duration: deployDuration },
    });
    execution.logs.push({ timestamp: new Date(), message: 'Deployment plan created', level: 'success' });
    log.info('Deployment completed', { duration: deployDuration });
    emitter?.emit('progress', { stage: 'deployment', stageIndex: 7, status: 'completed', duration: deployDuration });
    emitter?.emit('checkpoint', { pipelineId, stage: 'deployment', status: 'completed' });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'deployment', requirement, input: reviewedCode, output: deployment });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for deployment', { error: docError.message });
    }

    try {
      await documenter.generateIndexDocument(pipelineId, ['specification', 'analysis', 'ux_design', 'development', 'code_review', 'security', 'qa', 'deployment']);
      execution.logs.push({ timestamp: new Date(), message: 'Documentation index created', level: 'info' });
    } catch (docError) {
      log.warn('Index document generation failed', { error: docError.message });
    }

    finalizeExecutionTerminalState(execution, 'completed');
    const totalSeconds = ((execution.completedAt - execution.createdAt) / 1000).toFixed(1);
    execution.logs.push({ timestamp: new Date(), message: 'Pipeline execution completed successfully!', level: 'success' });
    log.info('PIPELINE EXECUTION COMPLETED', { durationSeconds: totalSeconds });

    emitter?.emit('done', { pipelineId, status: 'completed', durationSeconds: totalSeconds });
    saveExecutionToDisk(execution);
    return execution;

  } catch (error) {
    const failedStage = execution.currentStage || execution.resume?.resumeFromStage || 'development';
    markStageFailed(execution, failedStage, error, {
      resumeFromStage: failedStage,
      metadata: { failedStage },
      manualInterventionReason: error.message,
    });
    finalizeExecutionTerminalState(execution, 'failed', error.message);
    execution.logs.push({ timestamp: new Date(), message: `Error: ${error.message}`, level: 'error' });
    log.error('Pipeline execution failed', { error: error.message, failedStage });
    emitter?.emit('error', { message: error.message, pipelineId, failedStage, resumeEligible: true, resumeFromStage: execution.resume?.resumeFromStage || failedStage });
    saveExecutionToDisk(execution);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// startPipeline — non-blocking, returns pipelineId immediately.

// Used by POST /api/pipeline/execute so the response comes back right away
// and the frontend connects to the SSE stream.
// ─────────────────────────────────────────────────────────────────────────────
export function startPipeline(requirement, executionId = null, repositoryPath = null, options = {}) {
  const pipelineId = options.pipelineId || `pipeline-${Date.now()}`;
  const emitter = new EventEmitter();
  emitter.on('error', () => {});
  pipelineEmitters.set(pipelineId, emitter);

  runPipeline(
    pipelineId,
    requirement,
    executionId,
    repositoryPath,
    emitter,
    options.triggerType || 'feature',
    options,
  )
    .catch(err => logger.error('Background pipeline error', { pipelineId, error: err.message }))
    .finally(() => setTimeout(() => pipelineEmitters.delete(pipelineId), 30_000));

  return pipelineId;
}

// ─────────────────────────────────────────────────────────────────────────────
// executePipeline — blocking await, kept for the external-repo endpoint
// which needs the result before sending the HTTP response.
// ─────────────────────────────────────────────────────────────────────────────
export async function executePipeline(requirement, executionId = null, repositoryPath = null, options = {}) {
  const pipelineId = options.pipelineId || `pipeline-${Date.now()}`;
  const emitter = options.emitter || new EventEmitter();
  emitter.on('error', () => {});
  pipelineEmitters.set(pipelineId, emitter);
  try {
    return await runPipeline(
      pipelineId,
      requirement,
      executionId,
      repositoryPath,
      emitter,
      options.triggerType || 'feature',
      options,
    );
  } finally {
    setTimeout(() => pipelineEmitters.delete(pipelineId), 30_000);
  }
}

export function getPipelineExecution(pipelineId) {
  return pipelineExecutions.get(pipelineId) || loadExecutionFromDiskRecord(pipelineId);
}

export function getAllPipelineExecutions() {
  return Array.from(pipelineExecutions.values());
}

export default {
  executePipeline,
  startPipeline,
  resumePipeline,
  retryPipelineStage,
  getPipelineExecution,
  getAllPipelineExecutions,
  getExecutionCheckpoints,
  getCheckpointCatalog,
  getExecutionTimeline,
  getExecutionInspection,
  getExecutionGuide,
  getLatestCheckpointForStage,
  getResumeRecommendations,
  getResumeInfo,
  listStageNames,
  normalizeStageName,
  validateResumeRequest,
  prepareExecutionForResume,
};
