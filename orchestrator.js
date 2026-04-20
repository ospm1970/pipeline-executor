import { analystAgent, developerAgent, qaAgent, devopsAgent } from './agents.js';
import { UIUXAgentWithSkill } from './agents-ux.js';
import { SpecAgentWithSkill } from './agents-spec.js';
import DocumenterAgentWithSkill from './agents-documenter.js';
import { RepositoryAnalyzer } from './repository-analyzer.js';
import logger from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTIONS_DIR = path.join(__dirname, 'data', 'executions');

// Store pipeline executions in memory
const pipelineExecutions = new Map();

// Active pipeline emitters — used by SSE endpoint
export const pipelineEmitters = new Map();

function saveExecutionToDisk(execution) {
  try {
    fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
    const filePath = path.join(EXECUTIONS_DIR, `${execution.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(execution, null, 2), 'utf8');
  } catch (err) {
    logger.warn('Failed to save execution to disk', { error: err.message });
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Internal pipeline runner — shared by both exported entry points
// ─────────────────────────────────────────────────────────────────────────────
async function runPipeline(pipelineId, requirement, executionId, repositoryPath, emitter) {
  const execution = {
    id: pipelineId,
    requirement,
    status: 'running',
    stages: {},
    createdAt: new Date(),
    logs: [],
    documentation: []
  };

  pipelineExecutions.set(pipelineId, execution);
  const log = logger.child({ pipelineId, executionId: executionId || 'local' });
  const documenter = new DocumenterAgentWithSkill();

  try {
    // ── Stage 0: Specification ──────────────────────────────────────────────
    log.info('STAGE 0: SPECIFICATION');
    execution.logs.push({ timestamp: new Date(), message: 'Starting specification stage (Spec-Driven Development)...', level: 'info' });

    let repositoryAnalysis = null;
    let requirementWithContext = requirement;

    if (repositoryPath && fs.existsSync(repositoryPath)) {
      log.info('Analisando repositório para extrair contexto');
      execution.logs.push({ timestamp: new Date(), message: 'Analyzing repository structure...', level: 'info' });
      try {
        repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(repositoryPath);
        const analysisSummary = RepositoryAnalyzer.generateSummary(repositoryAnalysis);
        requirementWithContext = `${requirement}\n\n## Contexto do Repositório\n${analysisSummary}`;
        execution.logs.push({ timestamp: new Date(), message: `Repository analysis completed: ${repositoryAnalysis.endpoints.length} endpoints, ${repositoryAnalysis.functions.length} functions`, level: 'info' });
        log.info('Repository analysis completed', { endpoints: repositoryAnalysis.endpoints.length, functions: repositoryAnalysis.functions.length });
      } catch (analysisError) {
        log.warn('Repository analysis failed', { error: analysisError.message });
        execution.logs.push({ timestamp: new Date(), message: `Repository analysis failed: ${analysisError.message}`, level: 'warning' });
      }
    }

    const specAgent = new SpecAgentWithSkill();
    const specStart = Date.now();
    const specification = await specAgent.generateSpecification(requirementWithContext);
    const specDuration = `${Date.now() - specStart}ms`;

    execution.stages.specification = { status: 'completed', result: specification, duration: specDuration };
    execution.logs.push({ timestamp: new Date(), message: 'Specification created', level: 'success' });
    log.info('Specification completed', { duration: specDuration });
    emitter?.emit('progress', { stage: 'specification', stageIndex: 0, status: 'completed', duration: specDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'specification', requirement, input: { requirement }, output: specification });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for specification', { error: docError.message });
    }

    // ── Stage 1: Analysis ───────────────────────────────────────────────────
    log.info('STAGE 1: ANALYSIS');
    execution.logs.push({ timestamp: new Date(), message: 'Starting analysis stage...', level: 'info' });

    const analysisStart = Date.now();
    const analysis = await analystAgent(`Based on this specification, generate user stories and technical requirements:\n${JSON.stringify(specification)}`);
    const analysisDuration = `${Date.now() - analysisStart}ms`;

    execution.stages.analysis = { status: 'completed', result: analysis, duration: analysisDuration };
    execution.logs.push({ timestamp: new Date(), message: 'Analysis completed', level: 'success' });
    log.info('Analysis completed', { duration: analysisDuration });
    emitter?.emit('progress', { stage: 'analysis', stageIndex: 1, status: 'completed', duration: analysisDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'analysis', requirement, input: specification, output: analysis });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for analysis', { error: docError.message });
    }

    // ── Stage 2: UI/UX Design ───────────────────────────────────────────────
    log.info('STAGE 2: UI/UX DESIGN');
    execution.logs.push({ timestamp: new Date(), message: 'Starting UI/UX design stage...', level: 'info' });

    const uiuxAgent = new UIUXAgentWithSkill();
    const uxStart = Date.now();
    const designSpecs = await uiuxAgent.applySkillToDesign(analysis.user_stories || [], analysis.technical_requirements || []);
    const uxDuration = `${Date.now() - uxStart}ms`;

    execution.stages.ux_design = { status: 'completed', result: designSpecs, duration: uxDuration };
    execution.logs.push({ timestamp: new Date(), message: 'Design specifications created', level: 'success' });
    log.info('UI/UX Design completed', { duration: uxDuration });
    emitter?.emit('progress', { stage: 'ux_design', stageIndex: 2, status: 'completed', duration: uxDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'ux_design', requirement, input: analysis, output: designSpecs });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for UI/UX design', { error: docError.message });
    }

    // ── Stage 3: Development ────────────────────────────────────────────────
    log.info('STAGE 3: DEVELOPMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting development stage...', level: 'info' });

    const devStart = Date.now();
    const code = await developerAgent(JSON.stringify(analysis));
    const devDuration = `${Date.now() - devStart}ms`;

    execution.stages.development = { status: 'completed', result: code, duration: devDuration };
    execution.logs.push({ timestamp: new Date(), message: 'Code generated', level: 'success' });
    log.info('Code generated', { duration: devDuration });
    emitter?.emit('progress', { stage: 'development', stageIndex: 3, status: 'completed', duration: devDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'development', requirement, input: analysis, output: code });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for development', { error: docError.message });
    }

    // ── Stage 4: QA ─────────────────────────────────────────────────────────
    log.info('STAGE 4: QA/TESTING');
    execution.logs.push({ timestamp: new Date(), message: 'Starting QA stage...', level: 'info' });

    const qaStart = Date.now();
    let qaInput;
    if (code.files && Array.isArray(code.files) && code.files.length > 0) {
      const implSection = `## Arquivos de implementação\n\n${code.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`;
      const testsSection = code.tests && Array.isArray(code.tests) && code.tests.length > 0
        ? `\n\n## Arquivos de teste\n\n${code.tests.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`
        : '\n\n## Arquivos de teste\n\n(nenhum arquivo de teste gerado pelo developer agent)';
      qaInput = implSection + testsSection;
    } else if (code.code) {
      qaInput = `Linguagem: ${code.language || 'desconhecida'}\n\nCódigo:\n${code.code}`;
    } else {
      qaInput = JSON.stringify(code);
    }
    const qaResult = await qaAgent(qaInput);
    const qaDuration = `${Date.now() - qaStart}ms`;

    execution.stages.qa = { status: 'completed', result: qaResult, duration: qaDuration };
    execution.logs.push({ timestamp: new Date(), message: 'QA tests completed', level: 'success' });
    log.info('QA completed', { duration: qaDuration });
    emitter?.emit('progress', { stage: 'qa', stageIndex: 4, status: 'completed', duration: qaDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'qa', requirement, input: code, output: qaResult });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for QA', { error: docError.message });
    }

    // ── QA Gateway ──────────────────────────────────────────────────────────
    const qaApproved = qaResult.approved === true;
    const qaCoverage = qaResult.coverage_percentage || 0;
    const coverageOk = qaCoverage >= 80;
    const hasCriticalIssues = (qaResult.issues_found || []).some(issue => {
      if (typeof issue === 'string') {
        return issue.toLowerCase().includes('critical') || issue.toLowerCase().includes('crítico');
      }
      // Para objetos, verifica apenas o campo de severidade — evita falso positivo por descrições
      const severity = (issue?.severity || issue?.level || issue?.type || '').toLowerCase();
      return severity.includes('critical') || severity.includes('crítico');
    });

    if (!qaApproved || !coverageOk || hasCriticalIssues) {
      const reason = [
        !qaApproved ? 'QA não aprovado pelo agente' : null,
        !coverageOk ? `Cobertura insuficiente: ${qaCoverage}% (mínimo 80%)` : null,
        hasCriticalIssues ? 'Issues críticas encontradas pelo QA' : null,
      ].filter(Boolean).join('; ');

      execution.stages.qa.gatewayStatus = 'blocked';
      execution.stages.qa.gatewayReason = reason;
      execution.status = 'blocked_by_qa';
      execution.logs.push({ timestamp: new Date(), message: `QA Gateway bloqueou: ${reason}`, level: 'warning' });
      log.warn('QA Gateway blocked pipeline', { reason, coverage: qaCoverage, approved: qaApproved });
      emitter?.emit('blocked_by_qa', { reason, coverage: qaCoverage, pipelineId });
      saveExecutionToDisk(execution);
      return execution;
    }

    execution.stages.qa.gatewayStatus = 'approved';
    log.info('QA Gateway approved', { coverage: qaCoverage });

    // ── Stage 5: DevOps/Deployment ──────────────────────────────────────────
    log.info('STAGE 5: DEVOPS/DEPLOYMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting deployment stage...', level: 'info' });

    const deployStart = Date.now();
    const deployment = await devopsAgent(JSON.stringify(code));
    const deployDuration = `${Date.now() - deployStart}ms`;

    execution.stages.deployment = { status: 'completed', result: deployment, duration: deployDuration };
    execution.logs.push({ timestamp: new Date(), message: 'Deployment plan created', level: 'success' });
    log.info('Deployment completed', { duration: deployDuration });
    emitter?.emit('progress', { stage: 'deployment', stageIndex: 5, status: 'completed', duration: deployDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'deployment', requirement, input: code, output: deployment });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for deployment', { error: docError.message });
    }

    // ── Index document ──────────────────────────────────────────────────────
    try {
      await documenter.generateIndexDocument(pipelineId, ['specification', 'analysis', 'ux_design', 'development', 'qa', 'deployment']);
      execution.logs.push({ timestamp: new Date(), message: 'Documentation index created', level: 'info' });
    } catch (docError) {
      log.warn('Index document generation failed', { error: docError.message });
    }

    // ── Done ────────────────────────────────────────────────────────────────
    execution.status = 'completed';
    execution.completedAt = new Date();
    const totalSeconds = ((execution.completedAt - execution.createdAt) / 1000).toFixed(1);
    execution.logs.push({ timestamp: new Date(), message: 'Pipeline execution completed successfully!', level: 'success' });
    log.info('PIPELINE EXECUTION COMPLETED', { durationSeconds: totalSeconds });

    emitter?.emit('done', { pipelineId, status: 'completed', durationSeconds: totalSeconds });
    saveExecutionToDisk(execution);
    return execution;

  } catch (error) {
    execution.status = 'failed';
    execution.error = error.message;
    execution.logs.push({ timestamp: new Date(), message: `Error: ${error.message}`, level: 'error' });
    log.error('Pipeline execution failed', { error: error.message });
    emitter?.emit('error', { message: error.message, pipelineId });
    saveExecutionToDisk(execution);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// startPipeline — non-blocking, returns pipelineId immediately.
// Used by POST /api/pipeline/execute so the response comes back right away
// and the frontend connects to the SSE stream.
// ─────────────────────────────────────────────────────────────────────────────
export function startPipeline(requirement, executionId = null, repositoryPath = null) {
  const pipelineId = `pipeline-${Date.now()}`;
  const emitter = new EventEmitter();
  emitter.on('error', () => {});
  pipelineEmitters.set(pipelineId, emitter);

  runPipeline(pipelineId, requirement, executionId, repositoryPath, emitter)
    .catch(err => logger.error('Background pipeline error', { pipelineId, error: err.message }))
    .finally(() => setTimeout(() => pipelineEmitters.delete(pipelineId), 30_000));

  return pipelineId;
}

// ─────────────────────────────────────────────────────────────────────────────
// executePipeline — blocking await, kept for the external-repo endpoint
// which needs the result before sending the HTTP response.
// ─────────────────────────────────────────────────────────────────────────────
export async function executePipeline(requirement, executionId = null, repositoryPath = null) {
  const pipelineId = `pipeline-${Date.now()}`;
  const emitter = new EventEmitter();
  emitter.on('error', () => {});
  pipelineEmitters.set(pipelineId, emitter);
  try {
    return await runPipeline(pipelineId, requirement, executionId, repositoryPath, emitter);
  } finally {
    setTimeout(() => pipelineEmitters.delete(pipelineId), 30_000);
  }
}

export function getPipelineExecution(pipelineId) {
  return pipelineExecutions.get(pipelineId);
}

export function getAllPipelineExecutions() {
  return Array.from(pipelineExecutions.values());
}

export default {
  executePipeline,
  startPipeline,
  getPipelineExecution,
  getAllPipelineExecutions
};
