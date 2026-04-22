import fs from 'fs';
import path from 'path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
]);

const MAX_SCANNED_FILES = 4000;

/**
 * Analisa repositórios para extrair contexto e estrutura.
 */
export class RepositoryAnalyzer {
  /**
   * Analisa o repositório e extrai informações estruturais.
   */
  static async analyzeRepository(repoPath) {
    try {
      console.log(`🔍 Analisando repositório: ${repoPath}`);

      const scannedFiles = this.scanRepositoryFiles(repoPath);
      const stackProfile = this.classifyProjectStack(repoPath, scannedFiles);
      const manifests = this.collectPackageJsonManifests(repoPath, scannedFiles);
      const runtimeEntrypoints = this.inferRuntimeEntrypoints(repoPath, scannedFiles, stackProfile, manifests);
      const uiEntrypoints = this.inferUiEntrypoints(scannedFiles, stackProfile);
      const servedDirectories = this.inferServedDirectories(repoPath, scannedFiles, stackProfile);
      const workspaceRoots = this.inferWorkspaceRoots(manifests, scannedFiles, stackProfile);
      const mainFiles = this.findMainFiles(repoPath, scannedFiles);
      const routeMountFiles = this.inferRouteMountFiles(mainFiles, scannedFiles, stackProfile);

      const analysis = {
        path: repoPath,
        type: stackProfile.projectType,
        stackProfile,
        structure: this.analyzeStructure(repoPath),
        files: scannedFiles,
        fileCount: scannedFiles.length,
        mainFiles,
        runtimeEntrypoints,
        uiEntrypoints,
        servedDirectories,
        workspaceRoots,
        routeMountFiles,
        dependencies: this.extractDependencies(repoPath, scannedFiles),
        endpoints: [],
        functions: [],
        codePatterns: [],
        description: '',
      };

      for (const file of analysis.mainFiles) {
        const fileAnalysis = await this.analyzeFile(file.path, file.language);

        if (fileAnalysis.endpoints.length > 0) {
          analysis.endpoints.push(...fileAnalysis.endpoints);
        }

        if (fileAnalysis.functions.length > 0) {
          analysis.functions.push(...fileAnalysis.functions);
        }

        if (fileAnalysis.patterns.length > 0) {
          analysis.codePatterns.push(...fileAnalysis.patterns);
        }

        if (fileAnalysis.description) {
          analysis.description = fileAnalysis.description;
        }
      }

      const readmePath = path.join(repoPath, 'README.md');
      if (fs.existsSync(readmePath)) {
        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        analysis.readme = readmeContent.substring(0, 1000);
      }

      console.log('✅ Análise completa:');
      console.log(`   - Tipo: ${analysis.type}`);
      console.log(`   - Arquivos: ${analysis.fileCount}`);
      console.log(`   - Endpoints: ${analysis.endpoints.length}`);
      console.log(`   - Funções: ${analysis.functions.length}`);
      console.log(`   - Entrypoints de runtime: ${analysis.runtimeEntrypoints.length}`);
      console.log(`   - Entrypoints de UI: ${analysis.uiEntrypoints.length}`);

      return analysis;
    } catch (error) {
      console.error(`❌ Erro ao analisar repositório: ${error.message}`);
      throw new Error(`Falha ao analisar repositório: ${error.message}`);
    }
  }

  /**
   * Mantém compatibilidade retroativa com o contracto legado.
   */
  static detectProjectType(repoPath) {
    return this.classifyProjectStack(repoPath).projectType;
  }

  /**
   * Classifica a stack do projeto de forma estruturada.
   */
  static classifyProjectStack(repoPath, scannedFiles = null) {
    const files = Array.isArray(scannedFiles) ? scannedFiles : this.scanRepositoryFiles(repoPath);
    const manifests = this.collectPackageJsonManifests(repoPath, files);
    const dependencyInfo = this.collectDependencyInfo(manifests);
    const rootManifest = manifests.find(manifest => manifest.relativePath === 'package.json') || manifests[0] || null;

    const hasFile = (relativePath) => files.includes(relativePath);
    const hasDirectory = (directoryName) =>
      fs.existsSync(path.join(repoPath, directoryName)) && fs.statSync(path.join(repoPath, directoryName)).isDirectory();

    const hasDependency = (...names) => names.some(name => dependencyInfo.all.has(name));
    const hasAnyFileMatch = (patterns) => files.some(file => patterns.some(pattern => pattern.test(file)));

    const languages = this.detectLanguages(files);
    const repoShape = this.detectRepositoryShape(repoPath, rootManifest, files);
    const packageManager = this.detectPackageManager(repoPath, rootManifest);
    const moduleType = rootManifest?.json?.type === 'module' ? 'esm' : 'commonjs';

    const backendFramework = hasDependency('@nestjs/core', '@nestjs/common')
      ? 'nestjs'
      : hasDependency('express')
        ? 'express'
        : hasDependency('fastify')
          ? 'fastify'
          : hasDependency('koa')
            ? 'koa'
            : hasDependency('hono')
              ? 'hono'
              : 'none';

    const frontendFramework = hasDependency('next')
      ? 'nextjs'
      : hasDependency('react')
        ? 'react'
        : hasDependency('vue')
          ? 'vue'
          : hasDependency('svelte')
            ? 'svelte'
            : 'none';

    const staticFrontend = hasFile('public/index.html')
      || hasFile('index.html')
      || hasFile('src/index.html')
      || hasDirectory('public');

    const frontendType = frontendFramework !== 'none'
      ? (frontendFramework === 'nextjs' ? 'ssr-web' : 'spa')
      : (staticFrontend ? 'static-web' : 'none');

    const uiTech = [];
    if (hasDependency('tailwindcss') || this.fileContainsAny(repoPath, files, ['tailwindcss', 'tailwind'])) {
      uiTech.push('tailwind');
    }
    if (frontendFramework === 'react') {
      uiTech.push('react');
    }
    if (frontendFramework === 'nextjs') {
      uiTech.push('nextjs');
    }
    if (frontendFramework === 'vue') {
      uiTech.push('vue');
    }
    if (frontendFramework === 'svelte') {
      uiTech.push('svelte');
    }
    if (frontendFramework === 'none' && staticFrontend) {
      uiTech.push('vanilla-js');
    }

    const primaryRuntime = hasFile('package.json') || manifests.length > 0
      ? 'nodejs'
      : hasAnyFileMatch([/pyproject\.toml$/i, /requirements\.txt$/i, /setup\.py$/i])
        ? 'python'
        : hasAnyFileMatch([/pom\.xml$/i, /build\.gradle$/i])
          ? 'java'
          : hasFile('go.mod')
            ? 'golang'
            : hasFile('Cargo.toml')
              ? 'rust'
              : 'unknown';

    const primaryLanguage = languages.includes('typescript')
      ? 'typescript'
      : languages.includes('javascript')
        ? 'javascript'
        : languages[0] || 'unknown';

    const testFrameworks = this.detectTestFrameworks(dependencyInfo, files, repoPath);

    const stackTags = [
      primaryRuntime,
      backendFramework !== 'none' ? backendFramework : null,
      frontendFramework !== 'none' ? frontendFramework : null,
      frontendType !== 'none' ? frontendType : null,
      packageManager,
      moduleType,
      repoShape,
      ...languages,
      ...uiTech,
      ...testFrameworks,
    ].filter(Boolean);

    const projectType = this.determineLegacyProjectType({
      primaryRuntime,
      backendFramework,
      frontendFramework,
    });

    const evidence = {
      manifests: manifests.map(manifest => manifest.relativePath),
      dependencies: dependencyInfo.detectedDependencies,
      indicators: {
        staticFrontend,
        hasPublicDirectory: hasDirectory('public'),
        hasTsconfig: hasAnyFileMatch([/tsconfig\.json$/i]),
        hasWorkspaces: repoShape === 'monorepo',
        hasTests: hasAnyFileMatch([/\.test\.[cm]?[jt]sx?$/i, /\.spec\.[cm]?[jt]sx?$/i, /^test\//i]),
      },
    };

    return {
      projectType,
      primaryRuntime,
      primaryLanguage,
      backendFramework,
      frontendFramework,
      frontendType,
      uiTech: [...new Set(uiTech)],
      moduleType,
      packageManager,
      repoShape,
      languages,
      testFrameworks,
      stackTags: [...new Set(stackTags)],
      evidence,
    };
  }

  static determineLegacyProjectType({ primaryRuntime, backendFramework, frontendFramework }) {
    if (frontendFramework === 'nextjs') {
      return 'nextjs';
    }
    if (backendFramework === 'nestjs') {
      return 'nestjs';
    }
    if (backendFramework === 'express') {
      return 'nodejs-express';
    }
    if (frontendFramework === 'react') {
      return 'react';
    }
    if (primaryRuntime === 'python') {
      return 'python';
    }
    if (primaryRuntime === 'java') {
      return 'java-maven';
    }
    if (primaryRuntime === 'golang') {
      return 'golang';
    }
    if (primaryRuntime === 'rust') {
      return 'rust';
    }
    if (primaryRuntime === 'nodejs') {
      return 'nodejs';
    }
    return 'unknown';
  }

  static scanRepositoryFiles(repoPath) {
    const scannedFiles = [];

    const walk = (currentPath, relativePrefix = '') => {
      if (scannedFiles.length >= MAX_SCANNED_FILES) {
        return;
      }

      let entries = [];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (scannedFiles.length >= MAX_SCANNED_FILES) {
          break;
        }

        if (entry.name.startsWith('.') && entry.name !== '.env.example') {
          continue;
        }
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const absolutePath = path.join(currentPath, entry.name);
        const relativePath = path.posix.join(relativePrefix, entry.name);

        if (entry.isDirectory()) {
          walk(absolutePath, relativePath);
        } else {
          scannedFiles.push(relativePath);
        }
      }
    };

    walk(repoPath, '');
    return scannedFiles.sort();
  }

  static collectPackageJsonManifests(repoPath, files) {
    return files
      .filter(file => file.endsWith('package.json'))
      .map((relativePath) => {
        const absolutePath = path.join(repoPath, relativePath);
        try {
          const json = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
          return { relativePath, absolutePath, json };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  static collectDependencyInfo(manifests) {
    const runtime = new Set();
    const dev = new Set();

    for (const manifest of manifests) {
      Object.keys(manifest.json.dependencies || {}).forEach(dep => runtime.add(dep));
      Object.keys(manifest.json.devDependencies || {}).forEach(dep => dev.add(dep));
    }

    const all = new Set([...runtime, ...dev]);
    return {
      runtime,
      dev,
      all,
      detectedDependencies: [...all].sort(),
    };
  }

  static detectLanguages(files) {
    const languageByExtension = new Map([
      ['.js', 'javascript'],
      ['.mjs', 'javascript'],
      ['.cjs', 'javascript'],
      ['.jsx', 'javascript'],
      ['.ts', 'typescript'],
      ['.tsx', 'typescript'],
      ['.py', 'python'],
      ['.java', 'java'],
      ['.go', 'golang'],
      ['.rs', 'rust'],
      ['.php', 'php'],
      ['.html', 'html'],
      ['.css', 'css'],
    ]);

    const languages = new Set();
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (languageByExtension.has(extension)) {
        languages.add(languageByExtension.get(extension));
      }
    }

    return [...languages];
  }

  static detectRepositoryShape(repoPath, rootManifest, files) {
    const hasWorkspaces = Array.isArray(rootManifest?.json?.workspaces)
      || Boolean(rootManifest?.json?.workspaces?.packages)
      || files.includes('pnpm-workspace.yaml')
      || files.includes('turbo.json')
      || files.some(file => /^apps\/[^/]+\/package\.json$/i.test(file))
      || files.some(file => /^packages\/[^/]+\/package\.json$/i.test(file));

    if (hasWorkspaces) {
      return 'monorepo';
    }

    const hasNestedPackageJson = files.filter(file => file.endsWith('package.json')).length > 1;
    return hasNestedPackageJson ? 'multi-package' : 'single-app';
  }

  static detectPackageManager(repoPath, rootManifest) {
    if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml')) || fs.existsSync(path.join(repoPath, 'pnpm-workspace.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(repoPath, 'package-lock.json'))) return 'npm';

    const packageManager = rootManifest?.json?.packageManager;
    if (typeof packageManager === 'string') {
      if (packageManager.startsWith('pnpm@')) return 'pnpm';
      if (packageManager.startsWith('yarn@')) return 'yarn';
      if (packageManager.startsWith('npm@')) return 'npm';
    }

    return 'unknown';
  }

  static detectTestFrameworks(dependencyInfo, files, repoPath) {
    const frameworks = new Set();
    const hasDependency = (...names) => names.some(name => dependencyInfo.all.has(name));

    if (hasDependency('jest', 'ts-jest')) frameworks.add('jest');
    if (hasDependency('vitest')) frameworks.add('vitest');
    if (hasDependency('mocha')) frameworks.add('mocha');
    if (hasDependency('@playwright/test', 'playwright')) frameworks.add('playwright');
    if (hasDependency('cypress')) frameworks.add('cypress');
    if (hasDependency('supertest')) frameworks.add('supertest');

    const nodeTestByFiles = files.some(file => /(^|\/)(test|tests)\/.+\.[cm]?[jt]sx?$/i.test(file))
      || files.some(file => /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file));

    if (nodeTestByFiles && this.fileContainsAny(repoPath, files.filter(file => /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file)).slice(0, 20), ['node:test', "from 'node:test'", 'require(\'node:test\')'])) {
      frameworks.add('node-test');
    }

    return [...frameworks];
  }

  static fileContainsAny(repoPath, files, needles) {
    for (const relativePath of files.slice(0, 50)) {
      const absolutePath = path.join(repoPath, relativePath);
      try {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        if (needles.some(needle => content.includes(needle))) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  static inferRuntimeEntrypoints(repoPath, scannedFiles, stackProfile, manifests = []) {
    const files = Array.isArray(scannedFiles) ? new Set(scannedFiles) : new Set(this.scanRepositoryFiles(repoPath));
    const runtimeEntrypoints = [];
    const rootManifest = manifests.find(manifest => manifest.relativePath === 'package.json') || manifests[0] || null;
    const startScript = rootManifest?.json?.scripts?.start;

    if (typeof startScript === 'string') {
      const startTokens = startScript.split(/\s+/).filter(Boolean);
      const scriptCandidate = startTokens.find(token => /\.(js|mjs|cjs|ts)$/i.test(token) && !token.startsWith('-'));
      if (scriptCandidate && files.has(scriptCandidate)) {
        runtimeEntrypoints.push(scriptCandidate);
      }
    }

    const frameworkCandidates = [
      'server.js',
      'app.js',
      'index.js',
      'main.js',
      'src/server.js',
      'src/app.js',
      'src/index.js',
      'src/main.js',
      'main.ts',
      'src/main.ts',
      'app/main.ts',
      'apps/api/src/main.ts',
      'apps/server/src/main.ts',
    ];

    for (const candidate of frameworkCandidates) {
      if (files.has(candidate)) {
        runtimeEntrypoints.push(candidate);
      }
    }

    if (stackProfile.backendFramework === 'nextjs') {
      ['app/api/route.ts', 'pages/api/index.ts', 'src/app/api/route.ts', 'src/pages/api/index.ts'].forEach(candidate => {
        if (files.has(candidate)) {
          runtimeEntrypoints.push(candidate);
        }
      });
    }

    return [...new Set(runtimeEntrypoints)];
  }

  static inferUiEntrypoints(scannedFiles, stackProfile) {
    const files = Array.isArray(scannedFiles) ? new Set(scannedFiles) : new Set();
    const candidates = [
      'public/index.html',
      'public/app.js',
      'public/main.js',
      'index.html',
      'src/index.html',
      'src/App.js',
      'src/App.jsx',
      'src/App.tsx',
      'src/main.jsx',
      'src/main.tsx',
      'app/page.tsx',
      'app/page.jsx',
      'src/app/page.tsx',
      'src/app/page.jsx',
      'pages/index.tsx',
      'pages/index.jsx',
      'src/pages/index.tsx',
      'src/pages/index.jsx',
    ];

    const uiEntrypoints = candidates.filter(candidate => files.has(candidate));

    if (stackProfile.frontendType === 'static-web' && files.has('public/index.html') && !uiEntrypoints.includes('public/app.js') && files.has('public/app.js')) {
      uiEntrypoints.push('public/app.js');
    }

    return [...new Set(uiEntrypoints)];
  }

  static inferServedDirectories(repoPath, scannedFiles, stackProfile) {
    const files = Array.isArray(scannedFiles) ? scannedFiles : this.scanRepositoryFiles(repoPath);
    const servedDirectories = new Set();

    if (files.some(file => file.startsWith('public/'))) {
      servedDirectories.add('public');
    }
    if (files.some(file => file.startsWith('dist/'))) {
      servedDirectories.add('dist');
    }
    if (files.some(file => file.startsWith('build/'))) {
      servedDirectories.add('build');
    }
    if (stackProfile.frontendFramework === 'nextjs') {
      if (files.some(file => file.startsWith('app/'))) servedDirectories.add('app');
      if (files.some(file => file.startsWith('pages/'))) servedDirectories.add('pages');
      if (files.some(file => file.startsWith('src/app/'))) servedDirectories.add('src/app');
      if (files.some(file => file.startsWith('src/pages/'))) servedDirectories.add('src/pages');
    }

    return [...servedDirectories];
  }

  static inferWorkspaceRoots(manifests, scannedFiles, stackProfile) {
    if (stackProfile.repoShape !== 'monorepo') {
      return [];
    }

    const roots = manifests
      .map(manifest => manifest.relativePath)
      .filter(relativePath => relativePath !== 'package.json')
      .map(relativePath => relativePath.replace(/\/package\.json$/i, ''));

    if (roots.length > 0) {
      return [...new Set(roots)];
    }

    const files = Array.isArray(scannedFiles) ? scannedFiles : [];
    const inferred = files
      .filter(file => /^(apps|packages)\/[^/]+\//i.test(file))
      .map(file => file.split('/').slice(0, 2).join('/'));

    return [...new Set(inferred)];
  }

  static inferRouteMountFiles(mainFiles, scannedFiles, stackProfile) {
    const files = Array.isArray(scannedFiles) ? scannedFiles : [];
    const routeMountFiles = new Set((mainFiles || []).map(file => file.relativePath));

    if (stackProfile.backendFramework === 'express') {
      files
        .filter(file => /(server|app|index)\.[cm]?[jt]s$/i.test(file))
        .forEach(file => routeMountFiles.add(file));
    }

    if (stackProfile.backendFramework === 'nestjs') {
      files
        .filter(file => /(app\.module|main)\.[cm]?[jt]s$/i.test(file))
        .forEach(file => routeMountFiles.add(file));
    }

    return [...routeMountFiles];
  }

  /**
   * Analisa a estrutura de diretórios de primeiro nível.
   */
  static analyzeStructure(repoPath) {
    const structure = {
      directories: [],
      files: [],
    };

    try {
      const items = fs.readdirSync(repoPath);

      for (const item of items) {
        if (item.startsWith('.')) continue;

        const itemPath = path.join(repoPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          structure.directories.push(item);
        } else if (['.js', '.ts', '.py', '.java', '.go', '.json', '.html'].includes(path.extname(item))) {
          structure.files.push(item);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao analisar estrutura: ${error.message}`);
    }

    return structure;
  }

  /**
   * Encontra os arquivos principais.
   */
  static findMainFiles(repoPath, scannedFiles = null) {
    const mainFiles = [];
    const files = Array.isArray(scannedFiles) ? new Set(scannedFiles) : new Set(this.scanRepositoryFiles(repoPath));

    const patterns = {
      javascript: ['index.js', 'app.js', 'server.js', 'main.js', 'src/index.js', 'src/app.js'],
      typescript: ['index.ts', 'app.ts', 'server.ts', 'main.ts', 'src/index.ts', 'src/app.ts'],
      python: ['main.py', 'app.py', 'index.py', '__main__.py', 'src/main.py'],
    };

    for (const [language, candidates] of Object.entries(patterns)) {
      for (const file of candidates) {
        if (files.has(file)) {
          mainFiles.push({
            path: path.join(repoPath, file),
            relativePath: file,
            language,
            name: path.basename(file),
          });
        }
      }
    }

    return mainFiles;
  }

  /**
   * Extrai dependências agregadas dos manifests encontrados.
   */
  static extractDependencies(repoPath, scannedFiles = null) {
    const files = Array.isArray(scannedFiles) ? scannedFiles : this.scanRepositoryFiles(repoPath);
    const manifests = this.collectPackageJsonManifests(repoPath, files);
    const dependencyInfo = this.collectDependencyInfo(manifests);

    return {
      runtime: [...dependencyInfo.runtime].sort(),
      dev: [...dependencyInfo.dev].sort(),
    };
  }

  /**
   * Analisa um arquivo específico.
   */
  static async analyzeFile(filePath, language) {
    const analysis = {
      endpoints: [],
      functions: [],
      patterns: [],
      description: '',
    };

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      if (language === 'javascript' || language === 'typescript') {
        analysis.endpoints = this.extractEndpoints(content);
        analysis.functions = this.extractFunctions(content);
        analysis.patterns = this.detectPatterns(content);
      } else if (language === 'python') {
        analysis.functions = this.extractPythonFunctions(content);
      }

      const firstComment = content.match(/^\/\*\*([\s\S]*?)\*\//);
      if (firstComment) {
        analysis.description = firstComment[1].trim();
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao analisar arquivo: ${error.message}`);
    }

    return analysis;
  }

  /**
   * Extrai endpoints Express.
   */
  static extractEndpoints(content) {
    const endpoints = [];
    const endpointRegex = /app\.(get|post|put|delete|patch|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = endpointRegex.exec(content)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        line: content.substring(0, match.index).split('\n').length,
      });
    }

    return endpoints;
  }

  /**
   * Extrai funções JavaScript.
   */
  static extractFunctions(content) {
    const functions = [];
    const functionRegex = /(async\s+)?function\s+(\w+)\s*\(([^)]*)\)|const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[2] || match[4];
      const params = (match[3] || match[6] || '').split(',').map(p => p.trim()).filter(Boolean);
      const isAsync = !!match[1] || !!match[5];

      functions.push({
        name,
        params,
        isAsync,
        line: content.substring(0, match.index).split('\n').length,
      });
    }

    return functions;
  }

  /**
   * Extrai funções Python.
   */
  static extractPythonFunctions(content) {
    const functions = [];
    const functionRegex = /def\s+(\w+)\s*\(([^)]*)\):/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(Boolean);

      functions.push({
        name,
        params,
        isAsync: false,
        line: content.substring(0, match.index).split('\n').length,
      });
    }

    return functions;
  }

  /**
   * Detecta padrões de código.
   */
  static detectPatterns(content) {
    const patterns = [];

    if (content.includes('app.use(')) {
      patterns.push('middleware');
    }
    if (content.includes('validate') || content.includes('validation')) {
      patterns.push('validation');
    }
    if (content.includes('try') && content.includes('catch')) {
      patterns.push('error-handling');
    }
    if (content.includes('auth') || content.includes('token') || content.includes('jwt')) {
      patterns.push('authentication');
    }
    if (content.includes('database') || content.includes('db') || content.includes('query')) {
      patterns.push('database');
    }
    if (content.includes('fetch') || content.includes('axios') || content.includes('http')) {
      patterns.push('external-api');
    }

    return patterns;
  }

  /**
   * Gera um resumo legível da análise.
   */
  static generateSummary(analysis) {
    let summary = '## Análise do Repositório\n\n';
    summary += `**Tipo de Projeto**: ${analysis.type}\n\n`;

    if (analysis.stackProfile) {
      summary += `**Runtime Principal**: ${analysis.stackProfile.primaryRuntime}\n`;
      summary += `**Framework Backend**: ${analysis.stackProfile.backendFramework}\n`;
      summary += `**Framework Frontend**: ${analysis.stackProfile.frontendFramework}\n`;
      summary += `**Tipo de Frontend**: ${analysis.stackProfile.frontendType}\n`;
      summary += `**Formato do Repositório**: ${analysis.stackProfile.repoShape}\n`;
      summary += `**Tags de Stack**: ${analysis.stackProfile.stackTags.join(', ')}\n\n`;
    }

    if (analysis.structure.directories.length > 0) {
      summary += `**Diretórios**: ${analysis.structure.directories.join(', ')}\n\n`;
    }

    if (analysis.dependencies.runtime.length > 0) {
      summary += `**Dependências Principais**: ${analysis.dependencies.runtime.slice(0, 8).join(', ')}\n\n`;
    }

    if (analysis.endpoints.length > 0) {
      summary += '**Endpoints Encontrados**:\n';
      for (const endpoint of analysis.endpoints) {
        summary += `- ${endpoint.method} ${endpoint.path}\n`;
      }
      summary += '\n';
    }

    if (analysis.functions.length > 0) {
      summary += '**Funções Principais**:\n';
      for (const func of analysis.functions.slice(0, 10)) {
        summary += `- ${func.name}(${func.params.join(', ')})\n`;
      }
      summary += '\n';
    }

    if (analysis.codePatterns.length > 0) {
      summary += `**Padrões Detectados**: ${analysis.codePatterns.join(', ')}\n\n`;
    }

    return summary;
  }
}

export default RepositoryAnalyzer;
