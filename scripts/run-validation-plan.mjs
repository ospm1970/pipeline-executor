#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const artifactsDir = path.join(repoRoot, 'test-artifacts', 'validation-plan');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(artifactsDir, timestamp);

const argv = new Set(process.argv.slice(2));
const failFast = argv.has('--fail-fast');
const skipSafeEndpoints = argv.has('--skip-safe-endpoints');
const onlyQuick = argv.has('--quick');

const suites = [
  {
    id: 'CT-01_to_CT-14',
    title: 'Regressão rápida das correções centrais',
    command: 'node',
    args: [
      '--test',
      '--test-name-pattern',
      'sanitizeGitUrl|assessStackAdherence|buildDeveloperPrompt|buildReviewInput|persistPipelineOutput|QARunner|resolveIntegrableArtifact',
      'tests/pipeline-hardening.test.js',
      'tests/integration.test.js',
    ],
    enabled: true,
  },
  {
    id: 'SAFE_ENDPOINTS',
    title: 'Suite rápida com endpoints seguros',
    command: 'node',
    args: [
      '--test',
      '--test-name-pattern',
      'GET /health|GET /api/pipeline sem|GET /api/pipeline com|GET /api/deployments|POST /api/pipeline/execute sem body',
      'tests/integration.test.js',
    ],
    enabled: !skipSafeEndpoints && !onlyQuick,
  },
];

function ensurePrerequisites() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json não encontrado em ${repoRoot}`);
  }

  const nodeModulesPath = path.join(repoRoot, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    throw new Error('Dependências não instaladas. Execute npm install antes de rodar o plano de testes.');
  }

  fs.mkdirSync(runDir, { recursive: true });
}

function parseNodeTestMetrics(output) {
  const metrics = {
    tests: null,
    pass: null,
    fail: null,
    cancelled: null,
    skipped: null,
    todo: null,
    duration_ms: null,
  };

  const patterns = {
    tests: /ℹ tests\s+(\d+)/,
    pass: /ℹ pass\s+(\d+)/,
    fail: /ℹ fail\s+(\d+)/,
    cancelled: /ℹ cancelled\s+(\d+)/,
    skipped: /ℹ skipped\s+(\d+)/,
    todo: /ℹ todo\s+(\d+)/,
    duration_ms: /ℹ duration_ms\s+([\d.]+)/,
  };

  for (const [key, regex] of Object.entries(patterns)) {
    const match = output.match(regex);
    if (match) metrics[key] = Number(match[1]);
  }

  return metrics;
}

function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf-8');
}

function commandToString(command, args) {
  return [command, ...args].join(' ');
}

async function runSuite(suite) {
  const startedAt = new Date();
  const logPath = path.join(runDir, `${suite.id}.log`);

  return new Promise((resolve) => {
    const child = spawn(suite.command, suite.args, {
      cwd: repoRoot,
      env: { ...process.env },
      shell: false,
    });

    let combinedOutput = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      combinedOutput += text;
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      combinedOutput += text;
    });

    child.on('close', (code) => {
      writeFile(logPath, combinedOutput);
      const finishedAt = new Date();
      const metrics = parseNodeTestMetrics(combinedOutput);

      resolve({
        id: suite.id,
        title: suite.title,
        command: commandToString(suite.command, suite.args),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        exitCode: code ?? 1,
        success: code === 0,
        metrics,
        logPath,
      });
    });
  });
}

function buildMarkdownReport(results) {
  const automatedApproved = results.every(result => result.success);

  const summaryTable = results.map(result => {
    const status = result.success ? 'Aprovado' : 'Falhou';
    return `| ${result.id} | ${result.title} | ${status} | ${result.exitCode} | ${result.metrics.pass ?? 'N/A'} | ${result.metrics.fail ?? 'N/A'} | ${result.logPath.replace(`${repoRoot}/`, '')} |`;
  }).join('\n');

  const manualChecklist = [
    '| CT-15 | Execução real em repositório Express pequeno | Pendente manual | Verificar se o pipeline evita NestJS sem justificativa e preserva mudança mínima compatível |',
    '| CT-16 | Execução real em migração explícita | Pendente manual | Verificar se expansões arquiteturais são justificadas e rastreáveis |',
  ].join('\n');

  return `# Relatório automatizado do plano de testes\n\n## Síntese\n\nA automação executou os blocos automatizáveis do plano de testes e consolidou os resultados desta rodada. O status automatizado geral foi **${automatedApproved ? 'aprovado' : 'bloqueado'}**. Os cenários manuais CT-15 e CT-16 permanecem como pendências guiadas, porque exigem execução real contra repositórios-alvo representativos.\n\n## Resultado das suítes automatizadas\n\n| Bloco | Descrição | Status | Exit code | Pass | Fail | Log |\n|---|---|---|---|---|---|---|\n${summaryTable}\n\n## Cenários manuais pendentes\n\n| ID | Cenário | Status | Critério principal |\n|---|---|---|---|\n${manualChecklist}\n\n## Critério de aprovação\n\nA rodada automatizada só deve ser considerada suficiente quando todas as suítes acima estiverem aprovadas. A validação final completa do plano continua dependente da execução manual dos cenários CT-15 e CT-16, conforme definido no documento de planejamento.\n`;
}

async function main() {
  ensurePrerequisites();

  const activeSuites = suites.filter(suite => suite.enabled);
  if (activeSuites.length === 0) {
    throw new Error('Nenhuma suíte de teste foi selecionada para execução.');
  }

  const results = [];

  for (const suite of activeSuites) {
    console.log(`\n=== Executando ${suite.id}: ${suite.title} ===`);
    const result = await runSuite(suite);
    results.push(result);

    if (failFast && !result.success) {
      break;
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    options: {
      failFast,
      skipSafeEndpoints,
      onlyQuick,
    },
    results,
    manualPending: ['CT-15', 'CT-16'],
    overallSuccess: results.every(result => result.success),
  };

  const jsonReportPath = path.join(runDir, 'validation-summary.json');
  const markdownReportPath = path.join(runDir, 'validation-summary.md');
  const manualChecklistPath = path.join(runDir, 'manual-checklist.md');

  writeFile(jsonReportPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFile(markdownReportPath, `${buildMarkdownReport(results)}\n`);
  writeFile(manualChecklistPath, '# Checklist manual pendente\n\n- [ ] CT-15 — Executar pipeline contra repositório Express pequeno e validar aderência contextual.\n- [ ] CT-16 — Executar pipeline contra cenário de migração explícita e validar flexibilização controlada.\n');

  console.log('\n=== Resumo final ===');
  console.log(`Status automatizado: ${payload.overallSuccess ? 'APROVADO' : 'BLOQUEADO'}`);
  console.log(`Relatório JSON: ${jsonReportPath}`);
  console.log(`Relatório Markdown: ${markdownReportPath}`);
  console.log(`Checklist manual: ${manualChecklistPath}`);

  process.exit(payload.overallSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error(`Erro ao executar o plano de testes: ${error.message}`);
  process.exit(1);
});
