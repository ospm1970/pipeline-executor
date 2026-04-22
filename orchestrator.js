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
  const runnerActuallyRan = runnerResults?.ran === true && !!runnerResults?.testResults && !!runnerResults?.coverage;
  const qaCoverage = Number(qaResult.coverage_percentage || 0);
  const coverageOk = runnerActuallyRan && qaCoverage >= coverageTarget;
  const rawCoverageRegression = runnerActuallyRan && qaResult.coverage_regression === true;
  const coverageDelta = Number.isFinite(Number(qaResult?.coverage_delta)) ? Number(qaResult.coverage_delta) : null;
  const toleratedCoverageRegression = rawCoverageRegression
    && qaIteration > 1
    && coverageDelta !== null
    && coverageDelta >= (-1 * regressionTolerancePoints);
  const coverageRegression = rawCoverageRegression && !toleratedCoverageRegression;
  const issues = Array.isArray(qaResult.issues_found) ? qaResult.issues_found : [];
  const issueSeverities = issues.map(normalizeIssueSeverity);
  const hasCriticalIssues = issueSeverities.includes('critical');
  const hasHighIssues = issueSeverities.includes('high');
  const hasBlockingIssues = hasCriticalIssues || hasHighIssues;
  const llmApproved = qaResult.approved === true;
  const deterministicPass = runnerActuallyRan && coverageOk && !coverageRegression && !hasBlockingIssues;
  const qaApproved = llmApproved || deterministicPass;

  const warnings = [
    toleratedCoverageRegression
      ? `Regressão de cobertura tolerada após retry: ${coverageDelta}% abaixo do baseline (tolerância: -${regressionTolerancePoints}%)`
      : null,
  ].filter(Boolean);

  const reason = [
    !runnerActuallyRan ? 'Sem evidência real de execução de testes e cobertura' : null,
    !qaApproved && !deterministicPass && !llmApproved ? 'QA não aprovado pelo agente' : null,
    runnerActuallyRan && !coverageOk ? `Cobertura insuficiente: ${qaCoverage}% (mínimo ${coverageTarget}%) — medição real via runner` : null,
    coverageRegression ? `Regressão de cobertura: ${coverageDelta}% abaixo do baseline` : null,
    hasBlockingIssues ? 'Issues altas ou críticas encontradas pelo QA' : null,
  ].filter(Boolean).join('; ');

  return {
    qaApproved,
    qaCoverage,
    coverageTarget,
    runnerActuallyRan,
    coverageOk,
    coverageRegression,
    rawCoverageRegression,
    toleratedCoverageRegression,
    coverageDelta,
    regressionTolerancePoints,
    qaIteration,
    hasCriticalIssues,
    hasHighIssues,
    hasBlockingIssues,
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

  execution.status = status;
  if (!execution.completedAt) {
    execution.completedAt = new Date();
  }

  if (error) {
    execution.error = error;
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
      runner_framework: runnerResults?.framework || null,
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

    // ── Stage 3–6: Development → Code Review → Security → QA ───────────────
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
    let currentDevSpec = JSON.stringify(devInput);
    let reviewedCode = null;
    let reviewResult = null;
    let qaResult = null;
    let qaGateway = null;
    let runnerResults = null;
    let latestStackAssessment = null;

    for (let qaDevIteration = 1; qaDevIteration <= QA_DEVELOPER_MAX_RETRIES; qaDevIteration++) {
      const isRetryIteration = qaDevIteration > 1;

      log.info('STAGE 3: DEVELOPMENT');
      execution.logs.push({
        timestamp: new Date(),
        message: isRetryIteration
          ? `Restarting development stage after QA feedback (iteration ${qaDevIteration}/${QA_DEVELOPER_MAX_RETRIES})...`
          : 'Starting development stage...',
        level: isRetryIteration ? 'warn' : 'info'
      });

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
      execution.logs.push({ timestamp: new Date(), message: `Code generated${isRetryIteration ? ` após feedback de QA (iteração ${qaDevIteration})` : ''}`, level: 'success' });
      log.info('Code generated', { duration: devDuration, iteration: qaDevIteration });
      emitter?.emit('progress', { stage: 'development', stageIndex: 3, status: 'completed', duration: devDuration, iteration: qaDevIteration });

      try {
        const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'development', requirement, input: analysis, output: generatedCode });
        execution.documentation.push(docResult);
        execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
      } catch (docError) {
        log.warn('Documentation generation failed for development', { error: docError.message });
      }

      log.info('STAGE 4: CODE REVIEW');
      execution.logs.push({ timestamp: new Date(), message: 'Starting code review stage...', level: 'info' });

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
      emitter?.emit('progress', { stage: 'code_review', stageIndex: 4, status: 'completed', approved: reviewResult.approved, iteration: qaDevIteration });

      if (!reviewResult.approved) {
        const blockingError = `Code Review bloqueou após ${CODE_REVIEW_MAX_RETRIES} tentativas: ${reviewResult.blocking_issues.join('; ')}`;
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

      const securityStart = Date.now();
      const rawSecurityResult = await securityAgent(reviewedCode, triggerType);
      const securityResult = deriveSecurityGatewayOutcome(rawSecurityResult);
      const securityDuration = `${Date.now() - securityStart}ms`;

      execution.stages.security = { status: 'completed', result: securityResult, duration: securityDuration, iteration: qaDevIteration };
      execution.logs.push({ timestamp: new Date(), message: `Security check: ${securityResult.security_status}`, level: securityResult.hasWarnings ? 'warn' : 'success' });
      log.info('Security check completed', {
        status: securityResult.security_status,
        duration: securityDuration,
        vulnerabilities: securityResult.vulnerabilities.length,
        gatewayStatus: securityResult.gatewayStatus,
        iteration: qaDevIteration,
      });
      emitter?.emit('progress', { stage: 'security', stageIndex: 5, status: 'completed', duration: securityDuration, warnings: securityResult.vulnerabilities.length, iteration: qaDevIteration });

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

      const qaStart = Date.now();
      runnerResults = null;
      if (repositoryPath) {
        execution.logs.push({ timestamp: new Date(), message: 'Running real tests and collecting coverage...', level: 'info' });
        try {
          runnerResults = await QARunner.run(repositoryPath, reviewedCode);
          const coverageMsg = runnerResults.coverage
            ? `coverage: ${runnerResults.coverage.overall}%`
            : (runnerResults.errors?.length > 0 ? runnerResults.errors[0] : 'coverage não disponível');
          execution.logs.push({ timestamp: new Date(), message: `QA Runner: ${runnerResults.ran ? 'executado' : 'não executado'} — ${coverageMsg}`, level: 'info' });
          log.info('QA Runner completed', { ran: runnerResults.ran, coverage: runnerResults.coverage?.overall, framework: runnerResults.framework, iteration: qaDevIteration });
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

      execution.stages.qa = { status: 'completed', result: qaResult, duration: qaDuration, iteration: qaDevIteration };
      execution.logs.push({ timestamp: new Date(), message: 'QA tests completed', level: 'success' });
      log.info('QA completed', { duration: qaDuration, iteration: qaDevIteration });
      emitter?.emit('progress', { stage: 'qa', stageIndex: 6, status: 'completed', duration: qaDuration, iteration: qaDevIteration });

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
      };

      if (qaGateway.qaApproved) {
        if (!qaGateway.llmApproved && qaGateway.deterministicPass) {
          execution.logs.push({ timestamp: new Date(), message: 'QA Gateway aprovou por evidência determinística do runner apesar de reprovação não bloqueante do agente.', level: 'info' });
          log.info('QA Gateway approved by deterministic runner evidence', { coverage: qaGateway.qaCoverage, coverageTarget: qaGateway.coverageTarget, iteration: qaDevIteration });
        }

        if (qaGateway.toleratedCoverageRegression) {
          const warningMessage = qaGateway.warnings?.[0] || `Regressão de cobertura tolerada após retry: ${qaGateway.coverageDelta}% abaixo do baseline`;
          execution.logs.push({ timestamp: new Date(), message: warningMessage, level: 'warning' });
          log.warn('QA Gateway accepted tolerated coverage regression after retry', {
            coverage: qaGateway.qaCoverage,
            coverageDelta: qaGateway.coverageDelta,
            tolerance: qaGateway.regressionTolerancePoints,
            iteration: qaDevIteration,
          });
        }

        execution.finalArtifact = reviewedCode;
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

      if (!canRetryAfterQABlock) {
        finalizeExecutionTerminalState(execution, 'blocked_by_qa', qaGateway.reason);
        emitter?.emit('blocked_by_qa', { reason: qaGateway.reason, coverage: qaGateway.qaCoverage, pipelineId });
        saveExecutionToDisk(execution);
        return execution;
      }

      emitter?.emit('progress', { stage: 'qa', stageIndex: 6, status: 'retry', iteration: qaDevIteration, reason: qaGateway.reason });
      execution.logs.push({ timestamp: new Date(), message: `Retornando automaticamente ao developer após bloqueio de QA (próxima iteração ${qaDevIteration + 1}/${QA_DEVELOPER_MAX_RETRIES}).`, level: 'warning' });
      currentDevSpec = buildDeveloperRetrySpec({
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
    }

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
      const docResult = await documenter.generateAndSaveDocumentation({ pipelineId, stage: 'deployment', requirement, input: reviewedCode, output: deployment });
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
    finalizeExecutionTerminalState(execution, 'completed');
    const totalSeconds = ((execution.completedAt - execution.createdAt) / 1000).toFixed(1);
    execution.logs.push({ timestamp: new Date(), message: 'Pipeline execution completed successfully!', level: 'success' });
    log.info('PIPELINE EXECUTION COMPLETED', { durationSeconds: totalSeconds });

    emitter?.emit('done', { pipelineId, status: 'completed', durationSeconds: totalSeconds });
    saveExecutionToDisk(execution);
    return execution;

  } catch (error) {
    finalizeExecutionTerminalState(execution, 'failed', error.message);
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
