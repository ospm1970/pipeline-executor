import { analystAgent, developerAgent, qaAgent, devopsAgent } from './agents.js';
import { UIUXAgentWithSkill } from './agents-ux.js';
import { SpecAgentWithSkill } from './agents-spec.js';
import DocumenterAgentWithSkill from './agents-documenter.js';
import { RepositoryAnalyzer } from './repository-analyzer.js';
import logger from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTIONS_DIR = path.join(__dirname, 'data', 'executions');

// Store pipeline executions in memory
const pipelineExecutions = new Map();

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

export async function executePipeline(requirement, executionId = null, repositoryPath = null) {
  const pipelineId = `pipeline-${Date.now()}`;
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
    // Stage 0: Specification (Spec-Driven Development)
    log.info('STAGE 0: SPECIFICATION');
    execution.logs.push({ timestamp: new Date(), message: 'Starting specification stage (Spec-Driven Development)...', level: 'info' });
    
    // Analyze repository if provided
    let repositoryAnalysis = null;
    let requirementWithContext = requirement;
    
    if (repositoryPath && fs.existsSync(repositoryPath)) {
      log.info('Analisando repositório para extrair contexto');
      execution.logs.push({ timestamp: new Date(), message: 'Analyzing repository structure...', level: 'info' });

      try {
        repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(repositoryPath);
        const analysisSummary = RepositoryAnalyzer.generateSummary(repositoryAnalysis);

        // Include repository context in the requirement
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

    execution.stages.specification = {
      status: 'completed',
      result: specification,
      duration: `${Date.now() - specStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'Specification created', level: 'success' });
    log.info('Specification completed');

    // Generate documentation for this stage
    try {
      const docResult = await documenter.generateAndSaveDocumentation({
        pipelineId,
        stage: 'specification',
        requirement,
        input: { requirement },
        output: specification
      });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for specification', { error: docError.message });
    }

    // Stage 1: Analysis
    log.info('STAGE 1: ANALYSIS');
    execution.logs.push({ timestamp: new Date(), message: 'Starting analysis stage...', level: 'info' });
    
    // Pass the specification to the analyst instead of just the raw requirement
    const specString = JSON.stringify(specification);
    const analysisStart = Date.now();
    const analysis = await analystAgent(`Based on this specification, generate user stories and technical requirements:\n${specString}`);
    execution.stages.analysis = {
      status: 'completed',
      result: analysis,
      duration: `${Date.now() - analysisStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'Analysis completed', level: 'success' });
    log.info('Analysis completed');

    // Generate documentation for this stage
    try {
      const docResult = await documenter.generateAndSaveDocumentation({
        pipelineId,
        stage: 'analysis',
        requirement,
        input: specification,
        output: analysis
      });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for analysis', { error: docError.message });
    }

    // Stage 2: UI/UX Design
    log.info('STAGE 2: UI/UX DESIGN');
    execution.logs.push({ timestamp: new Date(), message: 'Starting UI/UX design stage...', level: 'info' });
    
    const uiuxAgent = new UIUXAgentWithSkill();
    const userStories = analysis.user_stories || [];
    const requirements = analysis.technical_requirements || [];
    const uxStart = Date.now();
    const designSpecs = await uiuxAgent.applySkillToDesign(userStories, requirements);
    execution.stages.ux_design = {
      status: 'completed',
      result: designSpecs,
      duration: `${Date.now() - uxStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'Design specifications created', level: 'success' });
    log.info('UI/UX Design completed');

    // Generate documentation for this stage
    try {
      const docResult = await documenter.generateAndSaveDocumentation({
        pipelineId,
        stage: 'ux_design',
        requirement,
        input: analysis,
        output: designSpecs
      });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for UI/UX design', { error: docError.message });
    }

    // Stage 3: Development
    log.info('STAGE 3: DEVELOPMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting development stage...', level: 'info' });
    
    const devSpecString = JSON.stringify(analysis);
    const devStart = Date.now();
    const code = await developerAgent(devSpecString);
    execution.stages.development = {
      status: 'completed',
      result: code,
      duration: `${Date.now() - devStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'Code generated', level: 'success' });
    log.info('Code generated');

    // Generate documentation for this stage
    try {
      const docResult = await documenter.generateAndSaveDocumentation({
        pipelineId,
        stage: 'development',
        requirement,
        input: analysis,
        output: code
      });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for development', { error: docError.message });
    }

    // Stage 4: QA
    log.info('STAGE 4: QA/TESTING');
    execution.logs.push({ timestamp: new Date(), message: 'Starting QA stage...', level: 'info' });
    
    const codeString = JSON.stringify(code);
    const qaStart = Date.now();
    const qaResult = await qaAgent(codeString);
    execution.stages.qa = {
      status: 'completed',
      result: qaResult,
      duration: `${Date.now() - qaStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'QA tests completed', level: 'success' });
    log.info('QA completed');

    // Generate documentation for this stage
    try {
      const docResult = await documenter.generateAndSaveDocumentation({
        pipelineId,
        stage: 'qa',
        requirement,
        input: code,
        output: qaResult
      });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for QA', { error: docError.message });
    }

    // QA Gateway — bloqueia avanço se reprovado
    const qaApproved = qaResult.approved === true;
    const qaCoverage = qaResult.coverage_percentage || 0;
    const coverageOk = qaCoverage >= 80;
    const hasCriticalIssues = (qaResult.issues_found || []).some(issue =>
      issue.toLowerCase().includes('critical') || issue.toLowerCase().includes('crítico')
    );

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
      saveExecutionToDisk(execution);
      return execution;
    }

    execution.stages.qa.gatewayStatus = 'approved';
    log.info('QA Gateway approved', { coverage: qaCoverage });

    // Stage 5: DevOps/Deployment
    log.info('STAGE 5: DEVOPS/DEPLOYMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting deployment stage...', level: 'info' });
    
    const deployStart = Date.now();
    const deployment = await devopsAgent(codeString);
    execution.stages.deployment = {
      status: 'completed',
      result: deployment,
      duration: `${Date.now() - deployStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'Deployment plan created', level: 'success' });
    log.info('Deployment completed');

    // Generate documentation for this stage
    try {
      const docResult = await documenter.generateAndSaveDocumentation({
        pipelineId,
        stage: 'deployment',
        requirement,
        input: code,
        output: deployment
      });
      execution.documentation.push(docResult);
      execution.logs.push({ timestamp: new Date(), message: `Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      log.warn('Documentation generation failed for deployment', { error: docError.message });
    }

    // Generate index document
    try {
      const stages = ['specification', 'analysis', 'ux_design', 'development', 'qa', 'deployment'];
      await documenter.generateIndexDocument(pipelineId, stages);
      execution.logs.push({ timestamp: new Date(), message: 'Documentation index created', level: 'info' });
    } catch (docError) {
      log.warn('Index document generation failed', { error: docError.message });
    }

    // Final status
    execution.status = 'completed';
    execution.completedAt = new Date();
    execution.logs.push({
      timestamp: new Date(),
      message: 'Pipeline execution completed successfully!',
      level: 'success'
    });

    log.info('PIPELINE EXECUTION COMPLETED', { durationSeconds: (new Date() - execution.createdAt) / 1000 });

    saveExecutionToDisk(execution);
    return execution;
  } catch (error) {
    execution.status = 'failed';
    execution.error = error.message;
    execution.logs.push({
      timestamp: new Date(),
      message: `Error: ${error.message}`,
      level: 'error'
    });
    log.error('Pipeline execution failed', { error: error.message });
    saveExecutionToDisk(execution);
    throw error;
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
  getPipelineExecution,
  getAllPipelineExecutions
};
