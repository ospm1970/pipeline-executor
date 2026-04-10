import { analystAgent, developerAgent, qaAgent, devopsAgent } from './agents.js';
import { UIUXAgentWithSkill } from './agents-ux.js';
import { SpecAgentWithSkill } from './agents-spec.js';
import DocumenterAgentWithSkill from './agents-documenter.js';
import { RepositoryAnalyzer } from './repository-analyzer.js';
import fs from 'fs';

// Store pipeline executions in memory
const pipelineExecutions = new Map();

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
  const documenter = new DocumenterAgentWithSkill();

  try {
    // Stage 0: Specification (Spec-Driven Development)
    console.log('\n📝 STAGE 0: SPECIFICATION');
    execution.logs.push({ timestamp: new Date(), message: 'Starting specification stage (Spec-Driven Development)...', level: 'info' });
    
    // Analyze repository if provided
    let repositoryAnalysis = null;
    let requirementWithContext = requirement;
    
    if (repositoryPath && fs.existsSync(repositoryPath)) {
      console.log('🔍 Analisando repositório para extrair contexto...');
      execution.logs.push({ timestamp: new Date(), message: 'Analyzing repository structure...', level: 'info' });
      
      try {
        repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(repositoryPath);
        const analysisSummary = RepositoryAnalyzer.generateSummary(repositoryAnalysis);
        
        // Include repository context in the requirement
        requirementWithContext = `${requirement}\n\n## Contexto do Repositório\n${analysisSummary}`;
        
        execution.logs.push({ timestamp: new Date(), message: `Repository analysis completed: ${repositoryAnalysis.endpoints.length} endpoints, ${repositoryAnalysis.functions.length} functions`, level: 'info' });
        console.log('✅ Repository analysis completed');
      } catch (analysisError) {
        console.warn(`⚠️ Repository analysis failed: ${analysisError.message}`);
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
    console.log('✅ Specification completed');
    
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
      execution.logs.push({ timestamp: new Date(), message: `📚 Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Documentation generation failed for specification:`, docError.message);
    }

    // Stage 1: Analysis
    console.log('\n📊 STAGE 1: ANALYSIS');
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
    console.log('✅ Analysis completed:', analysis);
    
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
      execution.logs.push({ timestamp: new Date(), message: `📚 Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Documentation generation failed for analysis:`, docError.message);
    }

    // Stage 2: UI/UX Design
    console.log('\n🎨 STAGE 2: UI/UX DESIGN');
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
    console.log('✅ UI/UX Design completed');
    
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
      execution.logs.push({ timestamp: new Date(), message: `📚 Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Documentation generation failed for UI/UX design:`, docError.message);
    }

    // Stage 3: Development
    console.log('\n💻 STAGE 3: DEVELOPMENT');
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
    console.log('✅ Code generated');
    
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
      execution.logs.push({ timestamp: new Date(), message: `📚 Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Documentation generation failed for development:`, docError.message);
    }

    // Stage 4: QA
    console.log('\n🧪 STAGE 4: QA/TESTING');
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
    console.log('✅ QA completed:', qaResult);
    
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
      execution.logs.push({ timestamp: new Date(), message: `📚 Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Documentation generation failed for QA:`, docError.message);
    }

    // Stage 5: DevOps/Deployment
    console.log('\n🚀 STAGE 5: DEVOPS/DEPLOYMENT');
    execution.logs.push({ timestamp: new Date(), message: 'Starting deployment stage...', level: 'info' });
    
    const deployStart = Date.now();
    const deployment = await devopsAgent(codeString);
    execution.stages.deployment = {
      status: 'completed',
      result: deployment,
      duration: `${Date.now() - deployStart}ms`
    };
    execution.logs.push({ timestamp: new Date(), message: 'Deployment plan created', level: 'success' });
    console.log('✅ Deployment completed:', deployment);
    
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
      execution.logs.push({ timestamp: new Date(), message: `📚 Documentation generated: ${docResult.relativePath}`, level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Documentation generation failed for deployment:`, docError.message);
    }

    // Generate index document
    try {
      const stages = ['specification', 'analysis', 'ux_design', 'development', 'qa', 'deployment'];
      await documenter.generateIndexDocument(pipelineId, stages);
      execution.logs.push({ timestamp: new Date(), message: '📚 Documentation index created', level: 'info' });
    } catch (docError) {
      console.warn(`⚠️ Index document generation failed:`, docError.message);
    }

    // Final status
    execution.status = 'completed';
    execution.completedAt = new Date();
    execution.logs.push({ 
      timestamp: new Date(), 
      message: 'Pipeline execution completed successfully!', 
      level: 'success' 
    });

    console.log('\n✅ PIPELINE EXECUTION COMPLETED');
    console.log(`Total time: ${(execution.completedAt - execution.createdAt) / 1000}s`);

    return execution;
  } catch (error) {
    execution.status = 'failed';
    execution.error = error.message;
    execution.logs.push({ 
      timestamp: new Date(), 
      message: `Error: ${error.message}`, 
      level: 'error' 
    });
    console.error('❌ Pipeline execution failed:', error.message);
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
