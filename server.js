import './load-env.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, queryDatabase, getAllTables } from './db.js';
import { executePipeline, getPipelineExecution, getAllPipelineExecutions, generateDashboardQuery } from './orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
await initializeDatabase();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Get all tables
app.get('/api/tables', async (req, res) => {
  try {
    const tables = await getAllTables();
    res.json({ tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute SQL query
app.post('/api/query', async (req, res) => {
  try {
    const { sql } = req.body;
    
    if (!sql) {
      return res.status(400).json({ error: 'SQL query is required' });
    }

    const result = await queryDatabase(sql);
    res.json({ 
      query: sql,
      data: result,
      rowCount: result.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate dashboard query using AI
app.post('/api/dashboard/generate', async (req, res) => {
  try {
    const { requirement } = req.body;
    
    if (!requirement) {
      return res.status(400).json({ error: 'Requirement is required' });
    }

    const result = await generateDashboardQuery(requirement);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute complete pipeline
app.post('/api/pipeline/execute', async (req, res) => {
  try {
    const { requirement } = req.body;
    
    if (!requirement) {
      return res.status(400).json({ error: 'Requirement is required' });
    }

    // Start pipeline in background
    const execution = await executePipeline(requirement);
    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pipeline execution
app.get('/api/pipeline/:pipelineId', (req, res) => {
  try {
    const { pipelineId } = req.params;
    const execution = getPipelineExecution(pipelineId);
    
    if (!execution) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all pipeline executions
app.get('/api/pipeline', (req, res) => {
  try {
    const executions = getAllPipelineExecutions();
    res.json({ 
      count: executions.length,
      executions: executions.sort((a, b) => b.createdAt - a.createdAt)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get documentation for a pipeline
app.get('/api/documentation/:pipelineId', (req, res) => {
  try {
    const { pipelineId } = req.params;
    const docsDir = path.join(__dirname, 'docs', pipelineId);
    
    if (!fs.existsSync(docsDir)) {
      return res.status(404).json({ error: 'Documentation not found' });
    }
    
    const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
    const docs = {};
    
    files.forEach(file => {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      docs[file] = { content, size: fs.statSync(filePath).size };
    });
    
    res.json({ pipelineId, documentationFiles: files, documentation: docs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific documentation file
app.get('/api/documentation/:pipelineId/:filename', (req, res) => {
  try {
    const { pipelineId, filename } = req.params;
    const filePath = path.join(__dirname, 'docs', pipelineId, filename);
    
    if (!fs.existsSync(filePath) || !filename.endsWith('.md')) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ pipelineId, filename, content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download documentation as ZIP
app.get('/api/documentation/:pipelineId/download/zip', (req, res) => {
  try {
    const { pipelineId } = req.params;
    const docsDir = path.join(__dirname, 'docs', pipelineId);
    
    if (!fs.existsSync(docsDir)) {
      return res.status(404).json({ error: 'Documentation not found' });
    }
    
    res.json({ 
      message: 'ZIP download feature coming soon',
      pipelineId,
      docsDir
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all documentation
app.get('/api/documentation', (req, res) => {
  try {
    const docsDir = path.join(__dirname, 'docs');
    
    if (!fs.existsSync(docsDir)) {
      return res.json({ pipelines: [] });
    }
    
    const pipelines = fs.readdirSync(docsDir)
      .filter(f => fs.statSync(path.join(docsDir, f)).isDirectory())
      .map(pipelineId => {
        const pipelineDir = path.join(docsDir, pipelineId);
        const files = fs.readdirSync(pipelineDir).filter(f => f.endsWith('.md'));
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

// Serve frontend
app.use(express.static('public'));

// Serve documentation files
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Manus DevAgents MVP Server`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health                    - Health check`);
  console.log(`  GET  /api/tables                - List all tables`);
  console.log(`  POST /api/query                 - Execute SQL query`);
  console.log(`  POST /api/dashboard/generate    - Generate dashboard query with AI`);
  console.log(`  POST /api/pipeline/execute      - Execute complete pipeline`);
  console.log(`  GET  /api/pipeline              - Get all pipeline executions`);
  console.log(`  GET  /api/pipeline/:id          - Get specific pipeline execution`);
  console.log(`  GET  /api/documentation         - List all documentation`);
  console.log(`  GET  /api/documentation/:id     - Get documentation for pipeline`);
  console.log(`  GET  /api/documentation/:id/:file - Get specific documentation file\n`);
});
