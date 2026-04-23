import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  loadExecutionsFromDisk,
  getCheckpointCatalog,
  getPipelineExecution,
  getExecutionCheckpoints,
  getExecutionGuide,
  getExecutionInspection,
  getExecutionTimeline,
  getResumeInfo,
  getResumeRecommendations,
  resumePipeline,
  retryPipelineStage,
} from '../orchestrator.js';

function parseArgs(argv) {
  const args = {
    pipelineId: null,
    inspect: false,
    stage: null,
    retryStage: null,
    force: false,
    notes: null,
    failFast: false,
    timeline: false,
    guide: false,
    recommendations: false,
    checkpointStage: null,
    checkpointStatus: null,
    limit: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--pipeline-id') {
      args.pipelineId = next || null;
      index += 1;
      continue;
    }
    if (token === '--inspect') {
      args.inspect = true;
      continue;
    }
    if (token === '--stage') {
      args.stage = next || null;
      index += 1;
      continue;
    }
    if (token === '--retry-stage') {
      args.retryStage = next || null;
      index += 1;
      continue;
    }
    if (token === '--force') {
      args.force = true;
      continue;
    }
    if (token === '--notes') {
      args.notes = next || null;
      index += 1;
      continue;
    }
    if (token === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (token === '--timeline') {
      args.timeline = true;
      continue;
    }
    if (token === '--guide') {
      args.guide = true;
      continue;
    }
    if (token === '--recommendations') {
      args.recommendations = true;
      continue;
    }
    if (token === '--checkpoint-stage') {
      args.checkpointStage = next || null;
      index += 1;
      continue;
    }
    if (token === '--checkpoint-status') {
      args.checkpointStatus = next || null;
      index += 1;
      continue;
    }
    if (token === '--limit') {
      const parsedLimit = Number(next || 20);
      args.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
      index += 1;
      continue;
    }
  }

  return args;
}

function ensureArtifactsDir() {
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const dir = path.join(process.cwd(), 'test-artifacts', 'pipeline-resume', timestamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReport(outputDir, fileName, payload) {
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.pipelineId) {
    console.error('Uso inválido: informe --pipeline-id <id>.');
    process.exit(2);
  }

  loadExecutionsFromDisk();

  const execution = getPipelineExecution(args.pipelineId);
  if (!execution) {
    console.error(`Execução ${args.pipelineId} não encontrada.`);
    process.exit(1);
  }

  const outputDir = ensureArtifactsDir();
  const resumeInfo = getResumeInfo(args.pipelineId);
  const checkpoints = getExecutionCheckpoints(args.pipelineId);
  const checkpointCatalog = getCheckpointCatalog(args.pipelineId, {
    stage: args.checkpointStage,
    status: args.checkpointStatus,
    limit: args.limit,
  });
  const timeline = getExecutionTimeline(args.pipelineId, { limit: args.limit });
  const inspection = getExecutionInspection(args.pipelineId, {
    limit: args.limit,
    stage: args.checkpointStage,
    status: args.checkpointStatus,
    checkpointLimit: args.limit,
  });
  const guide = getExecutionGuide(args.pipelineId, {
    limit: args.limit,
    stage: args.checkpointStage,
    status: args.checkpointStatus,
    checkpointLimit: args.limit,
  });
  const recommendations = getResumeRecommendations(args.pipelineId);

  if (args.inspect || args.timeline || args.recommendations || args.guide) {
    const report = {
      action: args.guide ? 'guide' : (args.recommendations ? 'recommendations' : (args.timeline && !args.inspect ? 'timeline' : 'inspect')),
      pipelineId: args.pipelineId,
      executionStatus: execution.status,
      resumeInfo,
      checkpointCount: checkpoints.length,
      checkpoints,
      checkpointCatalog,
      recommendations,
      guide,
      timeline,
      inspection,
    };
    const reportPath = writeReport(outputDir, 'inspect.json', report);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    process.exit(0);
  }

  const requestedStage = args.retryStage || args.stage || null;
  const startedAt = new Date().toISOString();

  try {
    const resumedExecution = args.retryStage
      ? await retryPipelineStage(args.pipelineId, args.retryStage, {
          force: args.force,
          notes: args.notes,
        })
      : await resumePipeline(args.pipelineId, {
          stage: requestedStage,
          force: args.force,
          notes: args.notes,
        });

    const result = {
      action: args.retryStage ? 'retry-stage' : 'resume',
      pipelineId: args.pipelineId,
      previousStatus: execution.status,
      requestedStage,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: true,
      newStatus: resumedExecution.status,
      currentStage: resumedExecution.currentStage || null,
      resumeInfo: resumedExecution.resume || null,
      checkpointCatalog: getCheckpointCatalog(args.pipelineId, {
        stage: args.checkpointStage,
        status: args.checkpointStatus,
        limit: args.limit,
      }),
      recommendations: getResumeRecommendations(args.pipelineId),
      guide: getExecutionGuide(args.pipelineId, {
        limit: args.limit,
        stage: args.checkpointStage,
        status: args.checkpointStatus,
        checkpointLimit: args.limit,
      }),
      timeline: getExecutionTimeline(args.pipelineId, { limit: args.limit }),
    };

    const reportPath = writeReport(outputDir, 'resume-result.json', result);
    console.log(JSON.stringify({ ...result, reportPath }, null, 2));
    process.exit(0);
  } catch (error) {
    const failure = {
      action: args.retryStage ? 'retry-stage' : 'resume',
      pipelineId: args.pipelineId,
      requestedStage,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      error: error.message,
      checkpointCatalog: getCheckpointCatalog(args.pipelineId, {
        stage: args.checkpointStage,
        status: args.checkpointStatus,
        limit: args.limit,
      }),
      recommendations: getResumeRecommendations(args.pipelineId),
      guide: getExecutionGuide(args.pipelineId, {
        limit: args.limit,
        stage: args.checkpointStage,
        status: args.checkpointStatus,
        checkpointLimit: args.limit,
      }),
      timeline: getExecutionTimeline(args.pipelineId, { limit: args.limit }),
    };

    const reportPath = writeReport(outputDir, 'resume-error.json', failure);
    console.error(JSON.stringify({ ...failure, reportPath }, null, 2));
    process.exit(args.failFast ? 1 : 1);
  }
}

main();
