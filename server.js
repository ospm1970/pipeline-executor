import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RepositoryManager } from './repository-manager.js';
import { PortManager } from './port-manager.js';
import { executePipeline, loadExecutionsFromDisk, startPipeline, pipelineEmitters } from './orchestrator.js';
import { CodePersister } from './code-persister.js';
import { CodeIntegrator } from './code-integrator.js';
import { validateWriteback } from './writeback-validator.js';
import dashboardMonitor from './dashboard-monitor.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const repositoryManager = new RepositoryManager('./workspaces');
const portManager = new PortManager();

export function resolveIntegrableArtifact(pipelineExecution) {
  return pipelineExecution?.finalArtifact
    || pipelineExecution?.stages?.code_review?.output
    || pipelineExecution?.stages?.development?.result
    || null;
}

// API key authentication middleware
const apiKeyMiddleware = (req, res, next) => {
  // Accept key from header (regular requests) or query param (EventSource/SSE)
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
app.use('/api', apiKeyMiddleware);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
    }
  }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

const pipelineLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Pipeline execution limit reached. Max 10 executions per hour.' }
});
app.use('/api/pipeline/execute', pipelineLimiter);
app.use('/api/pipeline/external', pipelineLimiter);

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Execute pipeline on requirement — starts async, returns pipelineId immediately.
// Progress is streamed via GET /api/pipeline/:pipelineId/stream (SSE).
app.post('/api/pipeline/execute', (req, res) => {
  try {
    const { requirement } = req.body;
    if (!requirement) {
      return res.status(400).json({ error: 'Requirement is required' });
    }
    const pipelineId = startPipeline(requirement);
    res.json({ pipelineId, status: 'running', requirement, createdAt: new Date() });
  } catch (error) {
    logger.error('Pipeline start error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// SSE stream — push pipeline progress to the browser in real time.
// EventSource can't set custom headers, so auth uses ?api_key= query param.
app.get('/api/pipeline/:pipelineId/stream', (req, res) => {
  const { pipelineId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Keep-alive ping every 20 s so proxies don't close idle connections
  const heartbeat = setInterval(() => res.write(':ping\n\n'), 20_000);

  const emitter = pipelineEmitters.get(pipelineId);
  if (!emitter) {
    // Pipeline already finished or unknown — client can fall back to REST
    clearInterval(heartbeat);
    send('done', { pipelineId, status: 'completed' });
    return res.end();
  }

  const cleanup = () => {
    clearInterval(heartbeat);
    emitter.off('progress', onProgress);
    emitter.off('done', onDone);
    emitter.off('blocked_by_qa', onBlocked);
    emitter.off('error', onError);
  };

  const onProgress    = (data) => send('progress', data);
  const onDone        = (data) => { cleanup(); send('done', data); res.end(); };
  const onBlocked     = (data) => { cleanup(); send('blocked_by_qa', data); res.end(); };
  const onError       = (data) => { cleanup(); send('error', data); res.end(); };

  emitter.on('progress',     onProgress);
  emitter.on('done',         onDone);
  emitter.on('blocked_by_qa', onBlocked);
  emitter.on('error',        onError);

  req.on('close', cleanup);
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
      return res.json({ count: 0, pipelines: [] });
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
    const { repositoryUrl, requirement, autoCommit = true } = req.body;
    const githubToken = req.body.githubToken || process.env.GITHUB_TOKEN || null;
    
    if (!repositoryUrl || !requirement) {
      return res.status(400).json({ error: 'Repository URL and requirement are required' });
    }

    const executionId = repositoryManager.generateExecutionId();
    logger.info('Iniciando execução', { executionId });
    
    // Clone repository
    const repoPath = await repositoryManager.cloneRepository(repositoryUrl, executionId, githubToken);
    const repoInfo = repositoryManager.getRepositoryInfo(repoPath);
    
    // Allocate port
    const port = await portManager.allocatePort(executionId);
    
    // Execute pipeline with repository path (analysis will be done by spec agent)
    const pipelineExecution = await executePipeline(requirement, executionId, repoPath);

    // Bloquear em qualquer gateway — não criar PR com código reprovado
    if (['blocked_by_review', 'blocked_by_security', 'blocked_by_qa'].includes(pipelineExecution.status)) {
      const stage = pipelineExecution.stages;
      return res.status(422).json({
        pipelineId: pipelineExecution.id,
        status: pipelineExecution.status,
        reason: pipelineExecution.error
          || stage.qa?.gatewayReason
          || stage.security?.gatewayReason
          || 'Pipeline bloqueado por gateway de qualidade',
        code_review: stage.code_review ?? null,
        security: stage.security ?? null,
        qa: stage.qa ?? null,
      });
    }

    // Integrate generated code into repository files
    try {
      logger.info('Integrando código gerado nos arquivos do repositório');

      // Integrar o artefato final aprovado nos arquivos originais
      const generatedCode = resolveIntegrableArtifact(pipelineExecution);
      if (generatedCode) {
        const language = generatedCode.language
          || pipelineExecution.stages.development?.result?.language
          || 'javascript';

        const writebackValidation = validateWriteback({
          repoPath,
          repositoryAnalysis: pipelineExecution.repositoryAnalysis || {},
          generatedCode,
          requirement,
          triggerType: pipelineExecution.triggerType || 'feature',
        });

        pipelineExecution.stages.writeback_validation = {
          status: writebackValidation.compatible ? 'approved' : 'blocked',
          output: writebackValidation,
          duration: '0ms',
          gatewayReason: writebackValidation.compatible ? null : writebackValidation.summary,
        };

        const outputDir = path.join(repoPath, 'pipeline-output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(outputDir, 'writeback-validation.json'),
          JSON.stringify(writebackValidation, null, 2),
          'utf-8'
        );

        if (!writebackValidation.compatible) {
          logger.warn('Writeback estrutural bloqueado', {
            summary: writebackValidation.summary,
            blockingIssues: writebackValidation.blockingIssues,
            missingConnections: writebackValidation.missingConnections,
            pathMismatches: writebackValidation.pathMismatches,
          });

          return res.status(422).json({
            executionId,
            pipelineId: pipelineExecution.id,
            status: 'blocked_by_writeback_validation',
            reason: writebackValidation.summary,
            writeback_validation: writebackValidation,
            repository: {
              url: repositoryUrl,
              name: repoInfo.name,
              type: repoInfo.type,
              version: repoInfo.version,
            },
          });
        }

        // Criar backup dos arquivos originais
        const backup = CodeIntegrator.createBackup(repoPath);
        if (backup.success) {
          logger.info('Backup criado', { filesBackedUp: backup.filesBackedUp });
        }

        // Integrar código nos arquivos principais
        const integration = await CodeIntegrator.integrateIntoRepository(
          repoPath,
          generatedCode,
          language,
          { validatedPaths: writebackValidation.validatedPaths }
        );

        pipelineExecution.stages.writeback_validation.integration = integration;

        if (integration.success) {
          logger.info(integration.message);
        } else {
          logger.warn(integration.message);
        }
      }

      // Persistir saída completa do pipeline (metadados e documentação)
      await CodePersister.persistPipelineOutput(repoPath, pipelineExecution);

      logger.info('Código integrado e documentação persistida');
    } catch (persistError) {
      logger.warn('Erro ao integrar código', { error: persistError.message });
    }
    
    // Auto-commit and push if enabled
    let committed = false;
    let pushed = false;
    if (autoCommit && githubToken) {
      try {
        const branchName = `pipeline/${executionId}`;
        await repositoryManager.createBranch(repoPath, branchName);
        const commitMessage = `feat: ${requirement.substring(0, 72)}`;
        await repositoryManager.commitChanges(repoPath, commitMessage);
        committed = true;
        await repositoryManager.pushChanges(repoPath, githubToken, branchName);
        pushed = true;

        const { createPullRequest } = await import('./github-pr.js');
        const pr = await createPullRequest({
          repoUrl: repositoryUrl,
          githubToken,
          branchName,
          baseBranch: process.env.DEFAULT_BASE_BRANCH || 'main',
          title: `[Pipeline] ${requirement.substring(0, 72)}`,
          body: `## Pipeline Executor\n\n**Requisito:** ${requirement}\n\n**Pipeline ID:** ${pipelineExecution.id}\n\n**Stages executados:** Spec → Analyst → UX → Developer → Code Review → Security → QA → DevOps\n\n> Gerado automaticamente pelo Pipeline Executor`
        });

        pipelineExecution.pullRequest = pr;
      } catch (commitError) {
        logger.warn('Auto-commit/push failed', { error: commitError.message });
        pipelineExecution.logs.push({
          timestamp: new Date(),
          message: `Auto-commit/push failed: ${commitError.message}`,
          level: 'warning'
        });
      }
    }

    res.json({
      executionId,
      pipelineId: pipelineExecution.id,
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
        committed,
        pushed
      },
      status: 'completed'
    });
  } catch (error) {
    logger.error('Pipeline execution error', { error: error.message, stack: error.stack });
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
app.use('/api/dashboard', apiKeyMiddleware, dashboardMonitor);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

if (process.argv[1] === __filename) {
  app.listen(PORT, () => {
    logger.info('Server started', { port: PORT });
    logger.info('Loading executions from disk');
    loadExecutionsFromDisk();
  });
}

export default app;
