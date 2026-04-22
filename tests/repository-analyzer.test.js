import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import RepositoryAnalyzer from '../repository-analyzer.js';
import { RepositoryManager } from '../repository-manager.js';

function createTempRepo(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('RepositoryAnalyzer.classifyProjectStack classifica Express com frontend estático sem perder o backend dominante', async () => {
  const repoPath = createTempRepo('repo-express-static');

  writeJson(path.join(repoPath, 'package.json'), {
    name: 'gera-motivacional-like',
    type: 'module',
    dependencies: {
      express: '^5.0.0',
      cors: '^2.8.5',
    },
    devDependencies: {
      supertest: '^7.0.0',
    },
  });
  writeText(path.join(repoPath, 'server.js'), "import express from 'express';\nconst app = express();\napp.get('/health', () => {});\n");
  writeText(path.join(repoPath, 'public/index.html'), '<html><script src="https://cdn.tailwindcss.com"></script></html>');
  writeText(path.join(repoPath, 'public/app.js'), 'console.log("ui");');
  writeText(path.join(repoPath, 'test/app.test.js'), "import test from 'node:test';\n");
  writeText(path.join(repoPath, 'package-lock.json'), '{}');

  const stackProfile = RepositoryAnalyzer.classifyProjectStack(repoPath);

  assert.equal(stackProfile.projectType, 'nodejs-express');
  assert.equal(stackProfile.primaryRuntime, 'nodejs');
  assert.equal(stackProfile.backendFramework, 'express');
  assert.equal(stackProfile.frontendFramework, 'none');
  assert.equal(stackProfile.frontendType, 'static-web');
  assert.equal(stackProfile.moduleType, 'esm');
  assert.equal(stackProfile.packageManager, 'npm');
  assert.ok(stackProfile.uiTech.includes('tailwind'));
  assert.ok(stackProfile.uiTech.includes('vanilla-js'));
  assert.ok(stackProfile.testFrameworks.includes('node-test'));
  assert.ok(stackProfile.testFrameworks.includes('supertest'));
  assert.ok(stackProfile.stackTags.includes('express'));
  assert.ok(stackProfile.stackTags.includes('static-web'));

  const analysis = await RepositoryAnalyzer.analyzeRepository(repoPath);
  assert.ok(analysis.runtimeEntrypoints.includes('server.js'));
  assert.ok(analysis.uiEntrypoints.includes('public/index.html'));
  assert.ok(analysis.uiEntrypoints.includes('public/app.js'));
  assert.ok(analysis.servedDirectories.includes('public'));
});

test('RepositoryAnalyzer.analyzeRepository retorna saída estruturada e mantém type compatível com consumidores legados', async () => {
  const repoPath = createTempRepo('repo-analysis-shape');

  writeJson(path.join(repoPath, 'package.json'), {
    name: 'analysis-shape',
    dependencies: {
      express: '^5.0.0',
    },
  });
  writeText(path.join(repoPath, 'server.js'), [
    '/** servidor principal */',
    "const express = require('express');",
    'const app = express();',
    "app.get('/health', (req, res) => res.json({ status: 'ok' }));",
    'function buildPayload(message) { return { message }; }',
  ].join('\n'));

  const analysis = await RepositoryAnalyzer.analyzeRepository(repoPath);

  assert.equal(analysis.type, 'nodejs-express');
  assert.equal(analysis.stackProfile.projectType, 'nodejs-express');
  assert.equal(analysis.fileCount, analysis.files.length);
  assert.ok(analysis.mainFiles.some(file => file.relativePath === 'server.js'));
  assert.ok(analysis.runtimeEntrypoints.includes('server.js'));
  assert.ok(analysis.routeMountFiles.includes('server.js'));
  assert.ok(analysis.endpoints.some(endpoint => endpoint.path === '/health'));
  assert.ok(analysis.functions.some(func => func.name === 'buildPayload'));
  assert.match(RepositoryAnalyzer.generateSummary(analysis), /Tags de Stack/);
});

test('RepositoryAnalyzer classifica Next.js como frontend SSR dominante', () => {
  const repoPath = createTempRepo('repo-nextjs');

  writeJson(path.join(repoPath, 'package.json'), {
    name: 'next-app',
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      jest: '^29.0.0',
    },
  });
  writeJson(path.join(repoPath, 'tsconfig.json'), { compilerOptions: { jsx: 'preserve' } });
  writeText(path.join(repoPath, 'app/page.tsx'), 'export default function Page() { return <main>ok</main>; }');

  const stackProfile = RepositoryAnalyzer.classifyProjectStack(repoPath);

  assert.equal(stackProfile.projectType, 'nextjs');
  assert.equal(stackProfile.frontendFramework, 'nextjs');
  assert.equal(stackProfile.frontendType, 'ssr-web');
  assert.ok(stackProfile.languages.includes('typescript'));
  assert.ok(stackProfile.testFrameworks.includes('jest'));
});

test('RepositoryAnalyzer reconhece monorepo híbrido com NestJS e React sem perder o formato do repositório', async () => {
  const repoPath = createTempRepo('repo-monorepo');

  writeJson(path.join(repoPath, 'package.json'), {
    name: 'hybrid-monorepo',
    private: true,
    workspaces: ['apps/*'],
  });
  writeText(path.join(repoPath, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  writeJson(path.join(repoPath, 'apps/api/package.json'), {
    name: 'api',
    dependencies: {
      '@nestjs/core': '^11.0.0',
      '@nestjs/common': '^11.0.0',
    },
  });
  writeText(path.join(repoPath, 'apps/api/src/app.module.ts'), 'export class AppModule {}');
  writeJson(path.join(repoPath, 'apps/web/package.json'), {
    name: 'web',
    dependencies: {
      react: '^19.0.0',
    },
    devDependencies: {
      vitest: '^2.0.0',
    },
  });
  writeText(path.join(repoPath, 'apps/web/src/App.tsx'), 'export function App() { return <div />; }');

  const stackProfile = RepositoryAnalyzer.classifyProjectStack(repoPath);

  assert.equal(stackProfile.projectType, 'nestjs');
  assert.equal(stackProfile.backendFramework, 'nestjs');
  assert.equal(stackProfile.frontendFramework, 'react');
  assert.equal(stackProfile.frontendType, 'spa');
  assert.equal(stackProfile.repoShape, 'monorepo');
  assert.equal(stackProfile.packageManager, 'pnpm');
  assert.ok(stackProfile.stackTags.includes('monorepo'));
  assert.ok(stackProfile.testFrameworks.includes('vitest'));

  const analysis = await RepositoryAnalyzer.analyzeRepository(repoPath);
  assert.ok(analysis.workspaceRoots.includes('apps/api'));
  assert.ok(analysis.workspaceRoots.includes('apps/web'));
});

test('RepositoryManager.getRepositoryInfo reutiliza a mesma classificação estruturada do RepositoryAnalyzer', () => {
  const repoPath = createTempRepo('repo-manager-info');
  const workspaceBase = createTempRepo('workspace-base');

  writeJson(path.join(repoPath, 'package.json'), {
    name: 'manager-info',
    dependencies: {
      express: '^5.0.0',
    },
  });
  writeText(path.join(repoPath, 'public/index.html'), '<html></html>');

  const manager = new RepositoryManager(workspaceBase);
  const info = manager.getRepositoryInfo(repoPath);

  assert.equal(info.type, 'nodejs-express');
  assert.equal(info.stackProfile.projectType, 'nodejs-express');
  assert.equal(info.stackProfile.frontendType, 'static-web');
});
