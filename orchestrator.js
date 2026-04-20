import { analystAgent, developerAgent, qaAgent, devopsAgent } from './agents.js';
import { codeReviewAgent, buildReviewInput } from './agents-code-review.js';
import { securityAgent } from './agents-security.js';
import { UIUXAgentWithSkill } from './agents-ux.js';
import { SpecAgentWithSkill } from './agents-spec.js';
import DocumenterAgentWithSkill from './agents-documenter.js';
import { RepositoryAnalyzer } from './repository-analyzer.js';
import QARunner from './qa-runner.js';
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
async function runPipeline(pipelineId, requirement, executionId, repositoryPath, emitter, triggerType = 'feature') {
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

    let repoModuleType = 'commonjs';
    if (repositoryPath) {
      try {
        const pkgPath = path.join(repositoryPath, 'package.json');
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
        moduleType: repoModuleType,
        existingDependencies: repositoryAnalysis.dependencies?.runtime || [],
        mainFiles: (repositoryAnalysis.mainFiles || []).map(f => f.relativePath || f.path),
        endpoints: (repositoryAnalysis.endpoints || []).slice(0, 20),
      } : null,
    };
    const code = await developerAgent(JSON.stringify(devInput));
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

    // ── Stage 4: Code Review ────────────────────────────────────────────────
    log.info('STAGE 4: CODE REVIEW');
    execution.logs.push({ timestamp: new Date(), message: 'Starting code review stage...', level: 'info' });

    const CODE_REVIEW_MAX_RETRIES = 2;
    let reviewedCode = code;
    let reviewResult = null;

    for (let attempt = 1; attempt <= CODE_REVIEW_MAX_RETRIES; attempt++) {
      const reviewStart = Date.now();
      reviewResult = await codeReviewAgent(reviewedCode, triggerType);
      const reviewDuration = `${Date.now() - reviewStart}ms`;

      log.info('Code review completed', { attempt, approved: reviewResult.approved, score: reviewResult.quality_score, duration: reviewDuration });
      execution.logs.push({ timestamp: new Date(), message: `Code review (attempt ${attempt}): ${reviewResult.approved ? 'aprovado' : 'reprovado'} — score ${reviewResult.quality_score ?? 'N/A'}`, level: reviewResult.approved ? 'success' : 'warn' });

      if (reviewResult.approved) {
        // Aplica correções menores feitas pelo próprio code review agent
        if (reviewResult.corrected_files?.length > 0) {
          const correctedPaths = new Set(reviewResult.corrected_files.map(f => f.path));
          const originalFiles = (reviewedCode.files || []).filter(f => !correctedPaths.has(f.path));
          reviewedCode = { ...reviewedCode, files: [...originalFiles, ...reviewResult.corrected_files] };
          execution.logs.push({ timestamp: new Date(), message: `Code review aplicou ${reviewResult.corrected_files.length} correção(ões) menor(es)`, level: 'info' });
        }
        break;
      }

      if (attempt < CODE_REVIEW_MAX_RETRIES) {
        // Envia blocking_issues de volta ao developer para correção
        log.warn('Code review blocked — re-sending to developer agent', { attempt, issues: reviewResult.blocking_issues });
        execution.logs.push({ timestamp: new Date(), message: `Re-enviando ao developer (tentativa ${attempt + 1}): ${reviewResult.blocking_issues.join('; ')}`, level: 'warn' });
        emitter?.emit('progress', { stage: 'code_review', stageIndex: 4, status: 'retry', attempt });

        const correctionSpec = JSON.stringify({
          original_specification: JSON.parse(reviewedCode._specInput || '{}'),
          blocking_issues: reviewResult.blocking_issues,
          warnings: reviewResult.warnings,
          previous_files: reviewedCode.files,
        });
        reviewedCode = await developerAgent(correctionSpec, triggerType);
      }
    }

    execution.stages.code_review = { status: 'completed', result: reviewResult, approved: reviewResult.approved };
    emitter?.emit('progress', { stage: 'code_review', stageIndex: 4, status: 'completed', approved: reviewResult.approved });

    if (!reviewResult.approved) {
      execution.status = 'blocked_by_review';
      execution.error = `Code Review bloqueou após ${CODE_REVIEW_MAX_RETRIES} tentativas: ${reviewResult.blocking_issues.join('; ')}`;
      execution.logs.push({ timestamp: new Date(), message: execution.error, level: 'error' });
      log.error('Code Review blocked pipeline', { issues: reviewResult.blocking_issues });
      emitter?.emit('error', { message: execution.error, pipelineId });
      saveExecutionToDisk(execution);
      return execution;
    }

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'code_review', requirement, input: code, output: reviewResult });
      execution.documentation.push(docResult);
    } catch (docError) {
      log.warn('Documentation generation failed for code review', { error: docError.message });
    }

    // ── Stage 5: Security ───────────────────────────────────────────────────
    log.info('STAGE 5: SECURITY');
    execution.logs.push({ timestamp: new Date(), message: 'Starting security stage...', level: 'info' });

    const securityStart = Date.now();
    const securityResult = await securityAgent(reviewedCode, triggerType);
    const securityDuration = `${Date.now() - securityStart}ms`;

    execution.stages.security = { status: 'completed', result: securityResult, duration: securityDuration };
    execution.logs.push({ timestamp: new Date(), message: `Security check: ${securityResult.security_status}`, level: securityResult.approved ? 'success' : 'warn' });
    log.info('Security check completed', { status: securityResult.security_status, duration: securityDuration });
    emitter?.emit('progress', { stage: 'security', stageIndex: 5, status: 'completed', duration: securityDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'security', requirement, input: reviewedCode, output: securityResult });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for security', { error: docError.message });
    }

    // ── Security Gateway ────────────────────────────────────────────────────
    const securityBlocking = (securityResult.vulnerabilities || []).filter(v => {
      const sev = (v?.severity || '').toLowerCase();
      return sev === 'critical' || sev === 'crítico' || sev === 'high' || sev === 'alto';
    });
    const hasBlockingVulnerabilities = securityBlocking.length > 0;

    if (!securityResult.approved || hasBlockingVulnerabilities) {
      const reason = [
        !securityResult.approved ? (securityResult.block_reason || 'Reprovado pelo agente de segurança') : null,
        hasBlockingVulnerabilities ? `${securityBlocking.length} vulnerabilidade(s) crítica(s)/alta(s): ${securityBlocking.map(v => `[${v.severity}] ${v.category}`).join(', ')}` : null,
      ].filter(Boolean).join('; ');

      execution.stages.security.gatewayStatus = 'blocked';
      execution.stages.security.gatewayReason = reason;
      execution.status = 'blocked_by_security';
      execution.logs.push({ timestamp: new Date(), message: `Security Gateway bloqueou: ${reason}`, level: 'warning' });
      log.warn('Security Gateway blocked pipeline', { reason, vulnerabilities: securityBlocking.length });
      emitter?.emit('blocked_by_security', { reason, vulnerabilities: securityBlocking, pipelineId });
      saveExecutionToDisk(execution);
      return execution;
    }

    execution.stages.security.gatewayStatus = 'approved';
    log.info('Security Gateway approved');

    // ── Stage 6: QA ─────────────────────────────────────────────────────────
    log.info('STAGE 6: QA/TESTING');
    execution.logs.push({ timestamp: new Date(), message: 'Starting QA stage...', level: 'info' });

    const qaStart = Date.now();

    // Coletar evidências reais de execução antes de chamar o LLM
    let runnerResults = null;
    if (repositoryPath) {
      execution.logs.push({ timestamp: new Date(), message: 'Running real tests and collecting coverage...', level: 'info' });
      try {
        runnerResults = await QARunner.run(repositoryPath, reviewedCode);
        const coverageMsg = runnerResults.coverage
          ? `coverage: ${runnerResults.coverage.overall}%`
          : (runnerResults.errors?.length > 0 ? runnerResults.errors[0] : 'coverage não disponível');
        execution.logs.push({ timestamp: new Date(), message: `QA Runner: ${runnerResults.ran ? 'executado' : 'não executado'} — ${coverageMsg}`, level: 'info' });
        log.info('QA Runner completed', { ran: runnerResults.ran, coverage: runnerResults.coverage?.overall, framework: runnerResults.framework });
      } catch (runnerError) {
        log.warn('QA Runner failed — proceeding with LLM-only QA', { error: runnerError.message });
        execution.logs.push({ timestamp: new Date(), message: `QA Runner falhou: ${runnerError.message} — usando QA apenas via LLM`, level: 'warning' });
      }
    }

    let qaInput;
    if (reviewedCode.files?.length > 0) {
      const implSection = `## Arquivos de implementação\n\n${reviewedCode.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`;
      const testsSection = reviewedCode.tests?.length > 0
        ? `\n\n## Arquivos de teste\n\n${reviewedCode.tests.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`
        : '\n\n## Arquivos de teste\n\n(nenhum arquivo de teste gerado pelo developer agent)';
      qaInput = { code: implSection + testsSection, runnerResults };
    } else if (reviewedCode.code) {
      qaInput = { code: `Linguagem: ${reviewedCode.language || 'desconhecida'}\n\nCódigo:\n${reviewedCode.code}`, runnerResults };
    } else {
      qaInput = { code: JSON.stringify(reviewedCode), runnerResults };
    }

    const qaResult = await qaAgent(qaInput);
    const qaDuration = `${Date.now() - qaStart}ms`;

    execution.stages.qa = { status: 'completed', result: qaResult, duration: qaDuration };
    execution.logs.push({ timestamp: new Date(), message: 'QA tests completed', level: 'success' });
    log.info('QA completed', { duration: qaDuration });
    emitter?.emit('progress', { stage: 'qa', stageIndex: 6, status: 'completed', duration: qaDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'qa', requirement, input: code, output: qaResult });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for QA', { error: docError.message });
    }

    // ── QA Gateway ──────────────────────────────────────────────────────────
    const qaApproved = qaResult.approved === true;
    // Cobertura real tem precedência sobre estimativa LLM
    const qaCoverage = qaResult.coverage_percentage || 0;
    const coverageTarget = 80;
    const coverageOk = qaCoverage >= coverageTarget;
    const coverageRegression = qaResult.coverage_regression === true;

    const hasCriticalIssues = (qaResult.issues_found || []).some(issue => {
      if (typeof issue === 'string') {
        return issue.toLowerCase().includes('critical') || issue.toLowerCase().includes('crítico');
      }
      const severity = (issue?.severity || issue?.level || issue?.type || '').toLowerCase();
      return severity.includes('critical') || severity.includes('crítico');
    });

    if (!qaApproved || !coverageOk || hasCriticalIssues || coverageRegression) {
      const reason = [
        !qaApproved ? 'QA não aprovado pelo agente' : null,
        !coverageOk ? `Cobertura insuficiente: ${qaCoverage}% (mínimo ${coverageTarget}%)` : null,
        coverageRegression ? `Regressão de cobertura: ${qaResult.coverage_delta}% abaixo do baseline` : null,
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

    // ── Stage 7: DevOps/Deployment ──────────────────────────────────────────
    log.info('STAGE 7: DEVOPS/DEPLOYMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting deployment stage...', level: 'info' });

    const deployStart = Date.now();
    const deployment = await devopsAgent(JSON.stringify(reviewedCode));
    const deployDuration = `${Date.now() - deployStart}ms`;

    execution.stages.deployment = { status: 'completed', result: deployment, duration: deployDuration };
    execution.logs.push({ timestamp: new Date(), message: 'Deployment plan created', level: 'success' });
    log.info('Deployment completed', { duration: deployDuration });
    emitter?.emit('progress', { stage: 'deployment', stageIndex: 7, status: 'completed', duration: deployDuration });

    try {
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'deployment', requirement, input: code, output: deployment });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for deployment', { error: docError.message });
    }

    // ── Index document ──────────────────────────────────────────────────────
    try {
      await documenter.generateIndexDocument(pipelineId, ['specification', 'analysis', 'ux_design', 'development', 'code_review', 'security', 'qa', 'deployment']);
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
