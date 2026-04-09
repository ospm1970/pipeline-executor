import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RepositoryManager } from './repository-manager.js';
import { PortManager } from './port-manager.js';
import { executePipeline } from './orchestrator.js';
import { CodePersister } from './code-persister.js';
import { CodeIntegrator } from './code-integrator.js';
import { RepositoryAnalyzer } from './repository-analyzer.js';
import dashboardMonitor from './dashboard-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const repositoryManager = new RepositoryManager('./workspaces');
const portManager = new PortManager();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Execute pipeline on requirement
app.post('/api/pipeline/execute', async (req, res) => {
  try {
    const { requirement } = req.body;
    
    if (!requirement) {
      return res.status(400).json({ error: 'Requirement is required' });
    }

    const pipelineExecution = await executePipeline(requirement);
    
    res.json({
      pipelineId: pipelineExecution.id,
      status: pipelineExecution.status,
      requirement,
      createdAt: pipelineExecution.createdAt
    });
  } catch (error) {
    console.error('Pipeline execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pipeline execution
app.get('/api/pipeline/:pipelineId', (req, res) => {
  try {
    const { pipelineId } = req.params;
    const docsPath = path.join(__dirname, 'docs', pipelineId);
    
    if (!fs.existsSync(docsPath)) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }
    
    const files = fs.readdirSync(docsPath);
    const documentation = files.map(file => ({
      filename: file,
      path: `/docs/${pipelineId}/${file}`
    }));
    
    res.json({
      pipelineId,
      documentation,
      status: 'completed'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all pipelines
app.get('/api/pipeline', (req, res) => {
  try {
    const docsPath = path.join(__dirname, 'docs');
    
    if (!fs.existsSync(docsPath)) {
      res.json({ count: 0, pipelines: [] });
    }
    
    const pipelines = fs.readdirSync(docsPath)
      .filter(file => fs.statSync(path.join(docsPath, file)).isDirectory())
      .map(pipelineId => {
        const pipelineDir = path.join(docsPath, pipelineId);
        const files = fs.readdirSync(pipelineDir);
        const stats = fs.statSync(pipelineDir);
        return {
          pipelineId,
          fileCount: files.length,
          files,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({ count: pipelines.length, pipelines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute pipeline on external repository
app.post('/api/pipeline/external', async (req, res) => {
  try {
    const { repositoryUrl, requirement, githubToken, autoCommit = true } = req.body;
    
    if (!repositoryUrl || !requirement) {
      return res.status(400).json({ error: 'Repository URL and requirement are required' });
    }

    const executionId = repositoryManager.generateExecutionId();
    console.log(`🚀 Iniciando execução: ${executionId}`);
    
    // Clone repository
    const repoPath = await repositoryManager.cloneRepository(repositoryUrl, executionId, githubToken);
    const repoInfo = repositoryManager.getRepositoryInfo(repoPath);
    
    // Allocate port
    const port = await portManager.allocatePort(executionId);
    
    // Analyze repository to provide context
    console.log('🔍 Analisando repositório para extrair contexto...');
    const repositoryAnalysis = await RepositoryAnalyzer.analyzeRepository(repoPath);
    const analysisSummary = RepositoryAnalyzer.generateSummary(repositoryAnalysis);
    console.log(analysisSummary);
    
    // Execute pipeline with repository context
    const requirementWithContext = `${requirement}

## Contexto do Repositório
${analysisSummary}`;
    const pipelineExecution = await executePipeline(requirementWithContext, executionId);
    
    // Integrate generated code into repository files
    try {
      console.log('📝 Integrando código gerado nos arquivos do repositório...');
      
      // Integrar código gerado nos arquivos originais
      if (pipelineExecution.stages.development && pipelineExecution.stages.development.result) {
        const generatedCode = pipelineExecution.stages.development.result;
        const language = generatedCode.language || 'javascript';
        
        // Criar backup dos arquivos originais
        const backup = CodeIntegrator.createBackup(repoPath);
        if (backup.success) {
          console.log(`💾 Backup criado: ${backup.filesBackedUp} arquivo(s)`);
        }
        
        // Integrar código nos arquivos principais
        const integration = await CodeIntegrator.integrateIntoRepository(
          repoPath,
          generatedCode,
          language
        );
        
        if (integration.success) {
          console.log(`✅ ${integration.message}`);
        } else {
          console.warn(`⚠️ ${integration.message}`);
        }
      }
      
      // Persistir saída completa do pipeline (metadados e documentação)
      await CodePersister.persistPipelineOutput(repoPath, pipelineExecution);
      
      console.log('✅ Código integrado e documentação persistida');
    } catch (persistError) {
      console.warn('⚠️ Erro ao integrar código: ' + persistError.message);
    }
    
    // Auto-commit and push if enabled
    if (autoCommit) {
      try {
        console.log(`📝 Auto-committing changes for ${executionId}...`);
        const commitMessage = `feat: ${requirement.substring(0, 50)}...`;
        await repositoryManager.commitChanges(repoPath, commitMessage);
        console.log(`✅ Changes committed`);
        
        // Auto-push if token is provided
        if (githubToken) {
          console.log(`📤 Auto-pushing changes for ${executionId}...`);
          await repositoryManager.pushChanges(repoPath, githubToken);
          console.log(`✅ Changes pushed to GitHub`);
        }
      } catch (commitError) {
        console.error(`⚠️ Auto-commit/push failed: ${commitError.message}`);
        // Don't fail the pipeline if commit fails
      }
    }
    
    res.json({
      executionId,
      pipelineId: pipelineExecution.pipelineId,
      repository: {
        url: repositoryUrl,
        name: repoInfo.name,
        type: repoInfo.type,
        version: repoInfo.version
      },
      deployment: {
        port,
        url: `http://localhost:${port}`,
        status: 'pending'
      },
      autoCommit: {
        enabled: autoCommit,
        committed: autoCommit,
        pushed: autoCommit && !!githubToken
      },
      status: 'completed'
    });
  } catch (error) {
    console.error('Pipeline execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get external execution status
app.get('/api/pipeline/external/:executionId', (req, res) => {
  try {
    const { executionId } = req.params;
    const port = portManager.getPort(executionId);
    
    if (!port) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json({
      executionId,
      deployment: {
        port,
        url: `http://localhost:${port}`,
        status: portManager.activeProcesses.has(port) ? 'running' : 'stopped'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all active deployments
app.get('/api/deployments', (req, res) => {
  try {
    const deployments = portManager.listAllocatedPorts();
    res.json({
      count: deployments.length,
      deployments,
      stats: portManager.getStats()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Commit changes to external repository
app.post('/api/pipeline/external/:executionId/commit', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { message, push = false, githubToken = null } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Commit message is required' });
    }
    
    const workspacePath = path.join(__dirname, 'workspaces', executionId);
    const repoPath = path.join(workspacePath, 'repo');
    
    if (!fs.existsSync(repoPath)) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Fazer commit
    await repositoryManager.commitChanges(repoPath, message);
    
    // Fazer push se solicitado
    let pushResult = null;
    if (push) {
      await repositoryManager.pushChanges(repoPath, githubToken);
      pushResult = { status: 'success', message: 'Changes pushed to repository' };
    }
    
    res.json({
      executionId,
      commit: {
        status: 'success',
        message: 'Changes committed successfully',
        commitMessage: message
      },
      push: pushResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard routes
app.use('/dashboard', dashboardMonitor);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// Start server
app.listen(PORT, () => {
  console.log(`✅ Pipeline Executor running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard.html`);
});
