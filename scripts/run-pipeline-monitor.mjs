import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const scriptFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptFilePath), '..');
const defaultOutputDir = path.join(repoRoot, 'artifacts', 'pipeline-monitor');
const command = 'node';
const args = ['--test', 'tests/pipeline-external-safe-change.test.js'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractMetric(output, label) {
  const regex = new RegExp(`(?:ℹ|#)\\s+${label}\\s+(\\d+)`, 'i');
  const match = output.match(regex);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function extractDuration(output) {
  const match = output.match(/(?:ℹ|#)\s+duration_ms\s+([\d.]+)/i);
  return match ? Number.parseFloat(match[1]) : null;
}

function buildSummary({ startedAt, endedAt, stdout, stderr, maxDurationMs, rawOutputFile }) {
  const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
  const passed = extractMetric(combinedOutput, 'pass');
  const failed = extractMetric(combinedOutput, 'fail');
  const cancelled = extractMetric(combinedOutput, 'cancelled');
  const skipped = extractMetric(combinedOutput, 'skipped');
  const todo = extractMetric(combinedOutput, 'todo');
  const tests = extractMetric(combinedOutput, 'tests');
  const durationMs = extractDuration(combinedOutput) ?? (new Date(endedAt) - new Date(startedAt));
  const durationThresholdBreached = durationMs > maxDurationMs;
  const status = failed === 0 && !durationThresholdBreached ? 'healthy' : 'unhealthy';

  return {
    monitor: 'pipeline-external-safe-change',
    status,
    measured_at: endedAt,
    started_at: startedAt,
    thresholds: {
      max_duration_ms: maxDurationMs,
      require_zero_failures: true,
    },
    results: {
      tests,
      passed,
      failed,
      cancelled,
      skipped,
      todo,
      duration_ms: durationMs,
      duration_threshold_breached: durationThresholdBreached,
    },
    command: `${command} ${args.join(' ')}`,
    test_file: 'tests/pipeline-external-safe-change.test.js',
    raw_output_file: rawOutputFile,
  };
}

async function main() {
  const outputDir = process.env.PIPELINE_MONITOR_OUTPUT_DIR
    ? path.resolve(process.env.PIPELINE_MONITOR_OUTPUT_DIR)
    : defaultOutputDir;
  const maxDurationMs = parseInteger(process.env.PIPELINE_MONITOR_MAX_DURATION_MS, 120000);

  ensureDir(outputDir);

  const startedAt = new Date().toISOString();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const result = await execFileAsync(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout ?? '';
    stderr = result.stderr ?? '';
  } catch (error) {
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? error.message ?? '';
    exitCode = typeof error.code === 'number' ? error.code : 1;
  }

  const endedAt = new Date().toISOString();
  const stamp = endedAt.replace(/[:.]/g, '-');
  const rawOutputFile = path.join(outputDir, `pipeline-monitor-${stamp}.log`);
  const latestRawOutputFile = path.join(outputDir, 'latest.log');
  const summaryFile = path.join(outputDir, `pipeline-monitor-${stamp}.json`);
  const latestSummaryFile = path.join(outputDir, 'latest.json');
  const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');

  fs.writeFileSync(rawOutputFile, combinedOutput, 'utf8');
  fs.writeFileSync(latestRawOutputFile, combinedOutput, 'utf8');

  const summary = buildSummary({
    startedAt,
    endedAt,
    stdout,
    stderr,
    maxDurationMs,
    rawOutputFile: path.relative(repoRoot, rawOutputFile),
  });

  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  fs.writeFileSync(latestSummaryFile, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  const headline = `[pipeline-monitor] status=${summary.status} passed=${summary.results.passed} failed=${summary.results.failed} duration_ms=${summary.results.duration_ms}`;
  console.log(headline);
  console.log(`[pipeline-monitor] summary=${path.relative(repoRoot, latestSummaryFile)}`);
  console.log(`[pipeline-monitor] raw_output=${path.relative(repoRoot, latestRawOutputFile)}`);

  if (exitCode !== 0 || summary.status !== 'healthy') {
    process.exit(exitCode || 1);
  }
}

main().catch((error) => {
  console.error('[pipeline-monitor] unexpected_error=', error);
  process.exit(1);
});
