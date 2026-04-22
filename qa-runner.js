import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * QARunner — executa testes reais no repositório alvo e coleta evidências:
 * cobertura (linha, função, branch), resultados de testes, lint e baseline.
 *
 * Funciona copiando o repo para um diretório temporário, aplicando o código
 * gerado pelo developer agent por cima, e executando os testes lá.
 * O node_modules original é linkado via junction para evitar reinstalação.
 */
export class QARunner {
  // ── Detecção de ambiente ──────────────────────────────────────────────────

  static isTestFilePath(filePath) {
    return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//].some((pattern) =>
      pattern.test(String(filePath).replace(/\\/g, '/'))
    );
  }

  static detectTestFramework(repoPath) {
    const pkgPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch { return null; }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const testScript = pkg.scripts?.test || '';

    if (deps.vitest || testScript.includes('vitest')) return 'vitest';
    if (deps.jest || deps['@jest/core'] || deps['ts-jest'] || testScript.includes('jest')) return 'jest';
    if (deps.mocha || testScript.includes('mocha')) return 'mocha';
    if (testScript.includes('node --test') || testScript.includes('node:test')) return 'node-test';
    return null;
  }

  static detectLinter(repoPath) {
    const eslintFiles = [
      '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
      '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml',
      'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
    ];
    for (const f of eslintFiles) {
      if (fs.existsSync(path.join(repoPath, f))) return 'eslint';
    }
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8'));
      if (pkg.eslintConfig) return 'eslint';
    } catch { /* ignore */ }
    return null;
  }

  static findTestFiles(repoPath) {
    const files = [];

    const scan = (dir, depth = 0) => {
      if (depth > 5) return;
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next'].includes(entry)) continue;
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scan(fullPath, depth + 1);
          } else if (this.isTestFilePath(fullPath) || this.isTestFilePath(entry)) {
            files.push(fullPath);
          }
        }
      } catch { /* ignore unreadable dirs */ }
    };

    scan(repoPath);
    return files;
  }

  // ── Ambiente temporário ───────────────────────────────────────────────────

  static prepareEnvironment(repoPath, generatedCode) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-qa-'));

    try {
      const EXCLUDE = new Set(['node_modules', '.git', '.pipeline-backup', 'dist', 'build', 'coverage', '.next']);

      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
          if (EXCLUDE.has(entry)) continue;
          const srcPath = path.join(src, entry);
          const destPath = path.join(dest, entry);
          const stat = fs.statSync(srcPath);
          if (stat.isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };

      copyDir(repoPath, tempDir);

      // Link node_modules to avoid slow reinstall
      const nmSrc = path.join(repoPath, 'node_modules');
      const nmDest = path.join(tempDir, 'node_modules');
      if (fs.existsSync(nmSrc) && !fs.existsSync(nmDest)) {
        try { fs.symlinkSync(nmSrc, nmDest, 'junction'); } catch { /* fallback: skip symlink */ }
      }

      // Apply generated files on top
      const allFiles = [
        ...(generatedCode?.files || []),
        ...(generatedCode?.tests || []),
      ];
      for (const file of allFiles) {
        if (!file.path || typeof file.content !== 'string') continue;
        const rel = file.path.replace(/^\.?[/\\]/, '');
        const dest = path.join(tempDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, file.content, 'utf-8');
      }

      return tempDir;
    } catch (error) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      throw error;
    }
  }

  static cleanup(tempDir) {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`⚠️ QA Runner: cleanup failed for ${tempDir}: ${error.message}`);
    }
  }

  static detectPackageManager(repoPath) {
    if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(repoPath, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(repoPath, 'package.json'))) return 'npm';
    return null;
  }

  static buildInstallCommand(packageManager) {
    switch (packageManager) {
      case 'pnpm':
        return 'pnpm install --frozen-lockfile';
      case 'yarn':
        return 'yarn install --frozen-lockfile';
      case 'npm':
        return 'npm ci';
      default:
        return null;
    }
  }

  static shouldInstallDependencies(tempDir) {
    const packageJsonPath = path.join(tempDir, 'package.json');
    const nodeModulesPath = path.join(tempDir, 'node_modules');
    return fs.existsSync(packageJsonPath) && !fs.existsSync(nodeModulesPath);
  }

  static ensureDependenciesInstalled(tempDir, repoPath, timeoutMs = 120_000) {
    if (!this.shouldInstallDependencies(tempDir)) {
      return { installed: false, skipped: true, packageManager: null };
    }

    const packageManager = this.detectPackageManager(tempDir) || this.detectPackageManager(repoPath);
    const installCommand = this.buildInstallCommand(packageManager);
    if (!installCommand) {
      return { installed: false, skipped: true, packageManager: null };
    }

    console.log(`📦 QA Runner: instalando dependências com ${packageManager}...`);
    const output = execSync(installCommand, {
      cwd: tempDir,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
    });

    return {
      installed: true,
      skipped: false,
      packageManager,
      output: output.slice(-1000),
    };
  }

  // ── Execução de testes ────────────────────────────────────────────────────

  static compactCommandOutput(output = '', maxChars = 6000) {
    const text = String(output || '');
    if (text.length <= maxChars) return text;

    const headSize = Math.floor(maxChars / 2);
    const tailSize = maxChars - headSize;
    return `${text.slice(0, headSize)}\n\n...[output truncated for logging]...\n\n${text.slice(-tailSize)}`;
  }

  static buildTestCommand(framework) {
    switch (framework) {
      case 'jest':
        return 'npx jest --coverage --coverageReporters=json-summary --coverageReporters=text --json --outputFile=test-results.json --forceExit --passWithNoTests';
      case 'vitest':
        return 'npx vitest run --coverage --coverage.reporter=json-summary --reporter=json --outputFile=test-results.json';
      case 'mocha':
        return 'npx mocha --recursive --reporter json > test-results.json 2>&1';
      case 'node-test':
        return 'node --test --experimental-test-coverage';
      default:
        return 'npm test';
    }
  }

  static executeTests(tempDir, framework, timeoutMs = 120_000) {
    const command = this.buildTestCommand(framework);
    const childEnv = { ...process.env, CI: 'true', NODE_ENV: 'test' };
    delete childEnv.NODE_V8_COVERAGE;

    try {
      const output = execSync(command, {
        cwd: tempDir,
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: childEnv,
      });
      return { success: true, output: this.compactCommandOutput(output), exitCode: 0 };
    } catch (error) {
      return {
        success: false,
        output: this.compactCommandOutput(error.stdout || error.message || ''),
        exitCode: error.status || 1,
        stderr: this.compactCommandOutput(error.stderr || '', 2000),
      };
    }
  }

  static parseTestResults(tempDir, framework, rawOutput = '') {
    if (framework === 'node-test') {
      const extractCount = (label) => {
        const match = rawOutput.match(new RegExp(`(?:ℹ|#)\\s*${label}\\s+(\\d+)`, 'i'));
        return match ? Number(match[1]) : 0;
      };
      const fail = extractCount('fail');
      return {
        total: extractCount('tests'),
        passed: extractCount('pass'),
        failed: fail,
        pending: extractCount('skipped') + extractCount('todo'),
        suites: extractCount('suites'),
        success: fail === 0,
      };
    }

    const resultsPath = path.join(tempDir, 'test-results.json');
    if (!fs.existsSync(resultsPath)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

      if (framework === 'jest') {
        return {
          total: raw.numTotalTests ?? 0,
          passed: raw.numPassedTests ?? 0,
          failed: raw.numFailedTests ?? 0,
          pending: raw.numPendingTests ?? 0,
          suites: raw.numTotalTestSuites ?? 0,
          success: raw.success ?? false,
        };
      }

      if (framework === 'vitest') {
        return {
          total: raw.numTotalTests ?? 0,
          passed: raw.numPassedTests ?? 0,
          failed: raw.numFailedTests ?? 0,
          pending: raw.numPendingTests ?? 0,
          suites: (raw.testResults || []).length,
          success: raw.success ?? (raw.numFailedTests === 0),
        };
      }

      if (framework === 'mocha') {
        return {
          total: raw.stats?.tests ?? 0,
          passed: raw.stats?.passes ?? 0,
          failed: raw.stats?.failures ?? 0,
          pending: raw.stats?.pending ?? 0,
          suites: raw.stats?.suites ?? 0,
          success: (raw.stats?.failures ?? 1) === 0,
        };
      }
    } catch { /* ignore */ }
    return null;
  }

  static parseCoverageSummary(tempDir, framework = null, rawOutput = '') {
    const summaryPath = path.join(tempDir, 'coverage', 'coverage-summary.json');
    if (fs.existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        const total = summary.total || {};
        return {
          lines: total.lines?.pct ?? 0,
          statements: total.statements?.pct ?? 0,
          functions: total.functions?.pct ?? 0,
          branches: total.branches?.pct ?? 0,
          overall: total.lines?.pct ?? 0,
        };
      } catch { /* ignore and try fallback below */ }
    }

    if (framework === 'node-test' && rawOutput.includes('start of coverage report')) {
      const allFilesMatch = rawOutput.match(/(?:#|ℹ)\s*all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
      if (allFilesMatch) {
        return {
          lines: Number(allFilesMatch[1]),
          branches: Number(allFilesMatch[2]),
          functions: Number(allFilesMatch[3]),
          statements: Number(allFilesMatch[1]),
          overall: Number(allFilesMatch[1]),
        };
      }
    }

    return null;
  }

  // ── Lint ──────────────────────────────────────────────────────────────────

  static executeLint(tempDir, timeoutMs = 30_000) {
    try {
      const output = execSync(
        'npx eslint . --format json --ext .js,.ts,.jsx,.tsx --ignore-pattern node_modules --ignore-pattern dist 2>&1',
        { cwd: tempDir, timeout: timeoutMs, encoding: 'utf-8', stdio: 'pipe' }
      );
      const results = JSON.parse(output);
      const errors = results.reduce((s, f) => s + f.errorCount, 0);
      const warnings = results.reduce((s, f) => s + f.warningCount, 0);
      return { ran: true, errors, warnings, files: results.length };
    } catch (error) {
      try {
        const results = JSON.parse(error.stdout || '[]');
        const errors = results.reduce((s, f) => s + f.errorCount, 0);
        const warnings = results.reduce((s, f) => s + f.warningCount, 0);
        return { ran: true, errors, warnings, files: results.length };
      } catch {
        return { ran: false, error: error.message.slice(0, 200), errors: -1, warnings: 0 };
      }
    }
  }

  // ── Baseline ──────────────────────────────────────────────────────────────

  static getBaseline(repoPath, framework) {
    let tempDir = null;
    try {
      tempDir = this.prepareEnvironment(repoPath, null);
      this.ensureDependenciesInstalled(tempDir, repoPath, 120_000);
      const baselineRun = this.executeTests(tempDir, framework, 90_000);
      const coverage = this.parseCoverageSummary(tempDir, framework, baselineRun.output);
      return coverage;
    } catch {
      return null;
    } finally {
      if (tempDir) this.cleanup(tempDir);
    }
  }

  // ── Entry point ───────────────────────────────────────────────────────────

  /**
   * Executa QA completo: baseline → testes com código gerado → lint → structured result.
   *
   * @param {string} repoPath - Caminho absoluto do repositório alvo
   * @param {object} generatedCode - Output do developer agent {files[], tests[]}
   * @returns {object} QA evidence result
   */
  static async run(repoPath, generatedCode) {
    const result = {
      framework: null,
      hasTests: false,
      testResults: null,
      coverage: null,
      baseline: null,
      coverageRegression: false,
      coverageDelta: null,
      linter: null,
      lintResults: null,
      errors: [],
      ran: false,
    };

    if (!repoPath || !fs.existsSync(repoPath)) {
      result.errors.push('repositoryPath não fornecido ou inválido — QA executado apenas via LLM');
      return result;
    }

    const framework = this.detectTestFramework(repoPath);
    result.framework = framework;

    if (!framework) {
      result.errors.push('Nenhum framework de testes detectado (jest/vitest/mocha/node-test)');
      return result;
    }

    const existingTestFiles = this.findTestFiles(repoPath);
    const generatedTestFiles = [
      ...(generatedCode?.tests || []).filter(file => this.isTestFilePath(file.path)),
      ...(generatedCode?.files || []).filter(file => this.isTestFilePath(file.path)),
    ];
    result.existingTestFiles = existingTestFiles.map(file => path.relative(repoPath, file));
    result.generatedTestFiles = generatedTestFiles.map(file => file.path);
    result.hasTests = existingTestFiles.length > 0 || generatedTestFiles.length > 0;

    if (!result.hasTests) {
      result.errors.push('Nenhum arquivo de teste encontrado no repositório ou no código gerado');
      return result;
    }

    let tempDir = null;
    try {
      // Collect baseline coverage from unmodified repo
      console.log('📊 QA Runner: coletando baseline de cobertura...');
      result.baseline = this.getBaseline(repoPath, framework);
      if (result.baseline) {
        console.log(`   Baseline: ${result.baseline.overall}% (linhas)`);
      }

      // Prepare isolated environment with generated code applied
      console.log('🧪 QA Runner: preparando ambiente isolado...');
      tempDir = this.prepareEnvironment(repoPath, generatedCode);

      // Install dependencies when the cloned repository has no node_modules
      result.install = this.ensureDependenciesInstalled(tempDir, repoPath, 120_000);

      // Execute tests
      console.log(`🧪 QA Runner: executando testes (${framework})...`);
      const run = this.executeTests(tempDir, framework);
      result.ran = true;

      // Parse structured test results
      result.testResults = this.parseTestResults(tempDir, framework, run.output) ?? {
        success: run.success,
        rawOutput: run.output,
      };

      // Parse coverage
      result.coverage = this.parseCoverageSummary(tempDir, framework, run.output);
      if (result.coverage) {
        console.log(`   Cobertura: ${result.coverage.overall}% linhas, ${result.coverage.functions}% funções`);
      }

      // Detect regression
      if (result.baseline && result.coverage) {
        result.coverageDelta = parseFloat((result.coverage.overall - result.baseline.overall).toFixed(2));
        result.coverageRegression = result.coverage.overall < result.baseline.overall - 0.5; // 0.5% tolerance
        if (result.coverageRegression) {
          console.warn(`⚠️ QA Runner: regressão de cobertura! ${result.baseline.overall}% → ${result.coverage.overall}%`);
        }
      }

      // Lint
      const linter = this.detectLinter(repoPath);
      result.linter = linter;
      if (linter === 'eslint') {
        console.log('🔍 QA Runner: executando lint...');
        result.lintResults = this.executeLint(tempDir);
        console.log(`   Lint: ${result.lintResults.errors} erros, ${result.lintResults.warnings} avisos`);
      }

    } catch (error) {
      result.errors.push(`Erro durante execução: ${error.message}`);
      console.error('❌ QA Runner error:', error.message);
    } finally {
      if (tempDir) this.cleanup(tempDir);
    }

    return result;
  }
}

export default QARunner;
