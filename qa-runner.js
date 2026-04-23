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
  static baselineCache = new Map();

  // ── Utilidades ─────────────────────────────────────────────────────────────

  static isTestFilePath(filePath) {
    return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//].some((pattern) =>
      pattern.test(String(filePath).replace(/\\/g, '/'))
    );
  }

  static stripAnsi(text = '') {
    return String(text).replace(/\u001b\[[0-9;]*m/g, '');
  }

  static normalizeOutput(text = '') {
    return this.stripAnsi(String(text || ''))
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  static compactCommandOutput(output = '', maxChars = 6000) {
    const text = this.normalizeOutput(output);
    if (text.length <= maxChars) return text;

    const headSize = Math.floor(maxChars / 2);
    const tailSize = maxChars - headSize;
    return `${text.slice(0, headSize)}\n\n...[output truncated for logging]...\n\n${text.slice(-tailSize)}`;
  }

  static cloneCoverage(coverage) {
    if (!coverage) return null;
    return {
      lines: coverage.lines ?? 0,
      statements: coverage.statements ?? 0,
      functions: coverage.functions ?? 0,
      branches: coverage.branches ?? 0,
      overall: coverage.overall ?? coverage.lines ?? 0,
      source: coverage.source || null,
    };
  }

  static toRoundedNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Number(num.toFixed(2));
  }

  static ensureCoverageShape(coverage, source = null) {
    if (!coverage) return null;

    const lines = this.toRoundedNumber(coverage.lines ?? coverage.overall);
    const statements = this.toRoundedNumber(coverage.statements ?? coverage.lines ?? coverage.overall);
    const functions = this.toRoundedNumber(coverage.functions ?? coverage.lines ?? coverage.overall);
    const branches = this.toRoundedNumber(coverage.branches ?? coverage.lines ?? coverage.overall);
    const overall = this.toRoundedNumber(coverage.overall ?? coverage.lines);

    if ([lines, statements, functions, branches, overall].some((value) => value === null)) {
      return null;
    }

    return { lines, statements, functions, branches, overall, source };
  }

  static extractNumberByPattern(text, patterns = []) {
    const normalized = this.normalizeOutput(text);
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  static buildBaselineCacheKey(repoPath, framework) {
    return `${path.resolve(repoPath)}::${framework || 'unknown'}`;
  }

  // ── Detecção de ambiente ──────────────────────────────────────────────────

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

      const nmSrc = path.join(repoPath, 'node_modules');
      const nmDest = path.join(tempDir, 'node_modules');
      if (fs.existsSync(nmSrc) && !fs.existsSync(nmDest)) {
        try { fs.symlinkSync(nmSrc, nmDest, 'junction'); } catch { /* fallback: skip symlink */ }
      }

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
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
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

  static isBuiltInNodeDependency(name) {
    return typeof name === 'string' && name.startsWith('node:');
  }

  static sanitizeTemporaryPackageManifest(tempDir) {
    const packageJsonPath = path.join(tempDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        changed: false,
        removedDependencies: [],
        removedDevDependencies: [],
      };
    }

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      return {
        changed: false,
        removedDependencies: [],
        removedDevDependencies: [],
      };
    }

    const removedDependencies = [];
    const removedDevDependencies = [];

    const sanitizeDependencyMap = (dependencyMap, removedList) => {
      if (!dependencyMap || typeof dependencyMap !== 'object' || Array.isArray(dependencyMap)) {
        return dependencyMap;
      }

      const sanitized = {};
      for (const [name, version] of Object.entries(dependencyMap)) {
        if (this.isBuiltInNodeDependency(name)) {
          removedList.push(`${name}@${version}`);
          continue;
        }
        sanitized[name] = version;
      }
      return sanitized;
    };

    const nextDependencies = sanitizeDependencyMap(pkg.dependencies, removedDependencies);
    const nextDevDependencies = sanitizeDependencyMap(pkg.devDependencies, removedDevDependencies);
    const changed = removedDependencies.length > 0 || removedDevDependencies.length > 0;

    if (!changed) {
      return {
        changed: false,
        removedDependencies,
        removedDevDependencies,
      };
    }

    pkg.dependencies = nextDependencies;
    pkg.devDependencies = nextDevDependencies;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');

    const packageLockPath = path.join(tempDir, 'package-lock.json');
    if (fs.existsSync(packageLockPath)) {
      try {
        fs.rmSync(packageLockPath, { force: true });
      } catch {
        /* ignore lock cleanup failures */
      }
    }

    return {
      changed: true,
      removedDependencies,
      removedDevDependencies,
    };
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

    const manifestSanitization = this.sanitizeTemporaryPackageManifest(tempDir);
    if (manifestSanitization.changed) {
      const removedEntries = [
        ...manifestSanitization.removedDependencies,
        ...manifestSanitization.removedDevDependencies,
      ];
      console.log(`🧹 QA Runner: removendo dependências internas do Node do package.json temporário: ${removedEntries.join(', ')}`);
    }

    const packageManager = this.detectPackageManager(tempDir) || this.detectPackageManager(repoPath);
    const installCommand = this.buildInstallCommand(packageManager);
    if (!installCommand) {
      return { installed: false, skipped: true, packageManager: null, manifestSanitization };
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
      output: this.compactCommandOutput(output),
      manifestSanitization,
    };
  }


  // ── Execução de testes ────────────────────────────────────────────────────

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
    const childEnv = {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'test',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    };
    delete childEnv.NODE_V8_COVERAGE;

    try {
      const output = execSync(command, {
        cwd: tempDir,
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: childEnv,
      });
      const normalizedOutput = this.normalizeOutput(output);
      return {
        success: true,
        output: this.compactCommandOutput(normalizedOutput),
        rawOutput: normalizedOutput,
        exitCode: 0,
      };
    } catch (error) {
      const stdout = this.normalizeOutput(error.stdout || '');
      const stderr = this.normalizeOutput(error.stderr || '');
      const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
      return {
        success: false,
        output: this.compactCommandOutput(combinedOutput || error.message || ''),
        rawOutput: combinedOutput || this.normalizeOutput(error.message || ''),
        exitCode: error.status || 1,
        stderr: this.compactCommandOutput(stderr, 2000),
      };
    }
  }

  static parseNodeTestCount(rawOutput, label) {
    const normalized = this.normalizeOutput(rawOutput);
    const patterns = [
      new RegExp(`(?:^|\\n)(?:ℹ|#)?\\s*${label}\\s+(\\d+)`, 'i'),
      new RegExp(`(?:^|\\n)${label}:\\s*(\\d+)`, 'i'),
      new RegExp(`"${label}"\\s*:\\s*(\\d+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  static parseTestResults(tempDir, framework, rawOutput = '') {
    if (framework === 'node-test') {
      const fail = this.parseNodeTestCount(rawOutput, 'fail');
      const total = this.parseNodeTestCount(rawOutput, 'tests');
      const passed = this.parseNodeTestCount(rawOutput, 'pass');
      const skipped = this.parseNodeTestCount(rawOutput, 'skipped');
      const todo = this.parseNodeTestCount(rawOutput, 'todo');
      const suites = this.parseNodeTestCount(rawOutput, 'suites');

      if (total > 0 || passed > 0 || fail > 0 || suites > 0) {
        return {
          total,
          passed,
          failed: fail,
          pending: skipped + todo,
          suites,
          success: fail === 0,
        };
      }
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

  static parseCoverageFromCoverageSummary(tempDir) {
    const summaryPath = path.join(tempDir, 'coverage', 'coverage-summary.json');
    if (!fs.existsSync(summaryPath)) return null;

    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      const total = summary.total || {};
      return this.ensureCoverageShape({
        lines: total.lines?.pct,
        statements: total.statements?.pct,
        functions: total.functions?.pct,
        branches: total.branches?.pct,
        overall: total.lines?.pct,
      }, 'coverage-summary.json');
    } catch {
      return null;
    }
  }

  static parseCoverageFromCoverageFinal(tempDir) {
    const finalPath = path.join(tempDir, 'coverage', 'coverage-final.json');
    if (!fs.existsSync(finalPath)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(finalPath, 'utf-8'));
      const files = Object.values(raw || {});
      if (!files.length) return null;

      let statementTotal = 0;
      let statementCovered = 0;
      let functionTotal = 0;
      let functionCovered = 0;
      let branchTotal = 0;
      let branchCovered = 0;
      let lineTotal = 0;
      let lineCovered = 0;

      for (const file of files) {
        const statements = Object.values(file.s || {});
        statementTotal += statements.length;
        statementCovered += statements.filter((value) => Number(value) > 0).length;

        const functions = Object.values(file.f || {});
        functionTotal += functions.length;
        functionCovered += functions.filter((value) => Number(value) > 0).length;

        const branches = Object.values(file.b || {}).flat();
        branchTotal += branches.length;
        branchCovered += branches.filter((value) => Number(value) > 0).length;

        const lines = Object.values(file.l || {});
        lineTotal += lines.length;
        lineCovered += lines.filter((value) => Number(value) > 0).length;
      }

      const pct = (covered, total) => (total > 0 ? (covered / total) * 100 : 0);
      return this.ensureCoverageShape({
        lines: pct(lineCovered, lineTotal),
        statements: pct(statementCovered, statementTotal),
        functions: pct(functionCovered, functionTotal),
        branches: pct(branchCovered, branchTotal),
        overall: pct(lineCovered, lineTotal),
      }, 'coverage-final.json');
    } catch {
      return null;
    }
  }

  static parseCoverageFromNodeTestOutput(rawOutput = '') {
    const normalized = this.normalizeOutput(rawOutput);
    if (!/coverage report/i.test(normalized)) return null;

    const tablePatterns = [
      /(?:^|\n)(?:#|ℹ)?\s*all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i,
      /(?:^|\n)(?:#|ℹ)?\s*all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i,
    ];

    for (const pattern of tablePatterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const lines = Number(match[1]);
      const branches = Number(match[2]);
      const functions = Number(match[3]);
      const statements = match[4] !== undefined ? Number(match[4]) : lines;
      return this.ensureCoverageShape({ lines, branches, functions, statements, overall: lines }, 'node-test-output-table');
    }

    const lines = this.extractNumberByPattern(normalized, [
      /line coverage[^\d]*([\d.]+)/i,
      /lines[^\d]*([\d.]+)/i,
    ]);
    const functions = this.extractNumberByPattern(normalized, [
      /function coverage[^\d]*([\d.]+)/i,
      /functions[^\d]*([\d.]+)/i,
    ]);
    const branches = this.extractNumberByPattern(normalized, [
      /branch coverage[^\d]*([\d.]+)/i,
      /branches[^\d]*([\d.]+)/i,
    ]);

    if (lines !== null) {
      return this.ensureCoverageShape({
        lines,
        statements: lines,
        functions: functions ?? lines,
        branches: branches ?? lines,
        overall: lines,
      }, 'node-test-output-fallback');
    }

    return null;
  }

  static parseCoverageSummary(tempDir, framework = null, rawOutput = '') {
    return this.parseCoverageFromCoverageSummary(tempDir)
      || this.parseCoverageFromCoverageFinal(tempDir)
      || (framework === 'node-test' ? this.parseCoverageFromNodeTestOutput(rawOutput) : null);
  }

  // ── Lint ──────────────────────────────────────────────────────────────────

  static executeLint(tempDir, timeoutMs = 30_000) {
    try {
      const output = execSync(
        'npx eslint . --format json --ext .js,.ts,.jsx,.tsx --ignore-pattern node_modules --ignore-pattern dist 2>&1',
        { cwd: tempDir, timeout: timeoutMs, encoding: 'utf-8', stdio: 'pipe' }
      );
      const results = JSON.parse(output);
      const errors = results.reduce((sum, file) => sum + file.errorCount, 0);
      const warnings = results.reduce((sum, file) => sum + file.warningCount, 0);
      return { ran: true, errors, warnings, files: results.length };
    } catch (error) {
      try {
        const results = JSON.parse(error.stdout || '[]');
        const errors = results.reduce((sum, file) => sum + file.errorCount, 0);
        const warnings = results.reduce((sum, file) => sum + file.warningCount, 0);
        return { ran: true, errors, warnings, files: results.length };
      } catch {
        return { ran: false, error: String(error.message || '').slice(0, 200), errors: -1, warnings: 0 };
      }
    }
  }

  // ── Baseline ──────────────────────────────────────────────────────────────

  static getBaseline(repoPath, framework) {
    const cacheKey = this.buildBaselineCacheKey(repoPath, framework);
    if (this.baselineCache.has(cacheKey)) {
      return this.cloneCoverage(this.baselineCache.get(cacheKey));
    }

    let tempDir = null;
    try {
      tempDir = this.prepareEnvironment(repoPath, null);
      this.ensureDependenciesInstalled(tempDir, repoPath, 120_000);
      const baselineRun = this.executeTests(tempDir, framework, 90_000);
      const coverage = this.parseCoverageSummary(tempDir, framework, baselineRun.rawOutput || baselineRun.output || '');
      if (coverage) {
        this.baselineCache.set(cacheKey, this.cloneCoverage(coverage));
      }
      return this.cloneCoverage(coverage);
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
      rawOutput: null,
      coverageSource: null,
      install: null,
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
      ...(generatedCode?.tests || []).filter((file) => this.isTestFilePath(file.path)),
      ...(generatedCode?.files || []).filter((file) => this.isTestFilePath(file.path)),
    ];
    result.existingTestFiles = existingTestFiles.map((file) => path.relative(repoPath, file));
    result.generatedTestFiles = generatedTestFiles.map((file) => file.path);
    result.hasTests = existingTestFiles.length > 0 || generatedTestFiles.length > 0;

    if (!result.hasTests) {
      result.errors.push('Nenhum arquivo de teste encontrado no repositório ou no código gerado');
      return result;
    }

    let tempDir = null;
    try {
      console.log('📊 QA Runner: coletando baseline de cobertura...');
      result.baseline = this.getBaseline(repoPath, framework);
      if (result.baseline) {
        console.log(`   Baseline: ${result.baseline.overall}% (linhas)`);
      }

      console.log('🧪 QA Runner: preparando ambiente isolado...');
      tempDir = this.prepareEnvironment(repoPath, generatedCode);

      result.install = this.ensureDependenciesInstalled(tempDir, repoPath, 120_000);

      console.log(`🧪 QA Runner: executando testes (${framework})...`);
      const run = this.executeTests(tempDir, framework);
      result.ran = true;
      result.rawOutput = this.compactCommandOutput(run.rawOutput || run.output || '', 8000);
      result.exitCode = run.exitCode;

      result.testResults = this.parseTestResults(tempDir, framework, run.rawOutput || run.output || '') ?? {
        success: run.success,
        rawOutput: this.compactCommandOutput(run.rawOutput || run.output || '', 4000),
      };

      result.coverage = this.parseCoverageSummary(tempDir, framework, run.rawOutput || run.output || '');
      result.coverageSource = result.coverage?.source || null;
      if (result.coverage) {
        console.log(`   Cobertura: ${result.coverage.overall}% linhas, ${result.coverage.functions}% funções`);
      } else {
        result.errors.push('Cobertura estruturada não pôde ser coletada a partir dos artefatos ou do output bruto dos testes');
      }

      if (result.baseline && result.coverage) {
        result.coverageDelta = parseFloat((result.coverage.overall - result.baseline.overall).toFixed(2));
        result.coverageRegression = result.coverage.overall < result.baseline.overall - 0.5;
        if (result.coverageRegression) {
          console.warn(`⚠️ QA Runner: regressão de cobertura! ${result.baseline.overall}% → ${result.coverage.overall}%`);
        }
      }

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
