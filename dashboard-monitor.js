import express from 'express';
import { getAllPipelineExecutions, getPipelineExecution } from './orchestrator.js';

const router = express.Router();

// Calcular estatísticas gerais
function calculateStats() {
  const executions = getAllPipelineExecutions();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const recentExecutions = executions.filter(e => new Date(e.createdAt) > thirtyDaysAgo);
  
  const completed = recentExecutions.filter(e => e.status === 'completed').length;
  const failed = recentExecutions.filter(e => e.status === 'failed').length;
  const total = recentExecutions.length;
  
  const successRate = total > 0 ? ((completed / total) * 100).toFixed(2) : 0;
  
  const avgTime = recentExecutions.length > 0
    ? Math.round(
        recentExecutions.reduce((sum, e) => {
          if (e.completedAt && e.createdAt) {
            return sum + (new Date(e.completedAt) - new Date(e.createdAt));
          }
          return sum;
        }, 0) / recentExecutions.length / 1000
      )
    : 0;
  
  return {
    totalExecutions: executions.length,
    executionsLast30Days: total,
    successfulExecutions: completed,
    failedExecutions: failed,
    successRate: parseFloat(successRate),
    averageExecutionTime: avgTime,
    averageExecutionTimeFormatted: `${avgTime}s`
  };
}

// Calcular distribuição por tipo
function calculateDistribution() {
  const executions = getAllPipelineExecutions();
  
  const simple = executions.filter(e => !e.repositoryUrl).length;
  const external = executions.filter(e => e.repositoryUrl).length;
  
  return {
    simple,
    external,
    total: executions.length
  };
}

// Calcular erros mais comuns
function calculateCommonErrors() {
  const executions = getAllPipelineExecutions();
  const errors = {};
  
  executions.forEach(e => {
    if (e.error) {
      const errorType = e.error.split(':')[0].trim();
      errors[errorType] = (errors[errorType] || 0) + 1;
    }
  });
  
  return Object.entries(errors)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// Calcular tempo economizado
function calculateTimeSaved() {
  const executions = getAllPipelineExecutions().filter(e => e.status === 'completed');
  
  // Assumir que cada execução economiza 40 horas de desenvolvimento
  const hoursSavedPerExecution = 40;
  const totalHoursSaved = executions.length * hoursSavedPerExecution;
  const totalDaysSaved = (totalHoursSaved / 8).toFixed(1);
  
  return {
    totalExecutions: executions.length,
    hoursSavedPerExecution,
    totalHoursSaved,
    totalDaysSaved: parseFloat(totalDaysSaved),
    costSavedEstimate: `$${(totalHoursSaved * 50).toLocaleString()}` // $50/hora
  };
}

// GET /api/dashboard/stats - Estatísticas gerais
router.get('/stats', (req, res) => {
  try {
    const stats = calculateStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/distribution - Distribuição por tipo
router.get('/distribution', (req, res) => {
  try {
    const distribution = calculateDistribution();
    res.json(distribution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/errors - Erros mais comuns
router.get('/errors', (req, res) => {
  try {
    const errors = calculateCommonErrors();
    res.json(errors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/time-saved - Tempo economizado
router.get('/time-saved', (req, res) => {
  try {
    const timeSaved = calculateTimeSaved();
    res.json(timeSaved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/executions - Lista de execuções com filtros
router.get('/executions', (req, res) => {
  try {
    const executions = getAllPipelineExecutions();
    const { status, type, limit = 50, offset = 0 } = req.query;
    
    let filtered = executions;
    
    if (status) {
      filtered = filtered.filter(e => e.status === status);
    }
    
    if (type === 'simple') {
      filtered = filtered.filter(e => !e.repositoryUrl);
    } else if (type === 'external') {
      filtered = filtered.filter(e => e.repositoryUrl);
    }
    
    // Ordenar por data decrescente
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);
    
    res.json({
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      executions: paginated.map(e => ({
        id: e.id,
        status: e.status,
        requirement: e.requirement?.substring(0, 100) + '...',
        type: e.repositoryUrl ? 'external' : 'simple',
        createdAt: e.createdAt,
        completedAt: e.completedAt,
        duration: e.completedAt ? Math.round((new Date(e.completedAt) - new Date(e.createdAt)) / 1000) : null,
        error: e.error
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/executions/:id - Detalhes de uma execução
router.get('/executions/:id', (req, res) => {
  try {
    const execution = getPipelineExecution(req.params.id);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execução não encontrada' });
    }
    
    res.json({
      ...execution,
      duration: execution.completedAt 
        ? Math.round((new Date(execution.completedAt) - new Date(execution.createdAt)) / 1000)
        : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/timeline - Timeline das últimas 30 execuções
router.get('/timeline', (req, res) => {
  try {
    const executions = getAllPipelineExecutions();
    const timeline = executions
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-30)
      .map(e => ({
        date: new Date(e.createdAt).toLocaleDateString('pt-BR'),
        status: e.status,
        duration: e.completedAt
          ? Math.round((new Date(e.completedAt) - new Date(e.createdAt)) / 1000)
          : null
      }));
    res.json({ timeline });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/performance - Dados de performance
router.get('/performance', (req, res) => {
  try {
    const executions = getAllPipelineExecutions().filter(e => e.status === 'completed');
    
    const stageTimings = {};
    
    executions.forEach(e => {
      Object.entries(e.stages || {}).forEach(([stage, data]) => {
        if (!stageTimings[stage]) {
          stageTimings[stage] = [];
        }
        // Extrair tempo do formato "5s"
        if (data.duration) {
          const seconds = parseInt(data.duration);
          stageTimings[stage].push(seconds);
        }
      });
    });
    
    const performance = {};
    Object.entries(stageTimings).forEach(([stage, times]) => {
      if (times.length > 0) {
        performance[stage] = {
          average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
          min: Math.min(...times),
          max: Math.max(...times),
          count: times.length
        };
      }
    });
    
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/health - Health check do dashboard
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    executionsTotal: getAllPipelineExecutions().length
  });
});

export default router;
