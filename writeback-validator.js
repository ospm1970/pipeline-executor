import fs from 'fs';
import path from 'path';

const DEFAULT_DECISION = {
  compatible: true,
  severity: 'approved',
  summary: 'Artefato estruturalmente compatível com o repositório alvo.',
  entrypointConnections: [],
  missingConnections: [],
  pathMismatches: [],
  warnings: [],
  blockingIssues: [],
  recommendedFixes: [],
  validatedPaths: [],
  pathRemap: {},
  analyzedEntries: [],
};

function normalizePath(relativePath) {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/')
    .replace(/^\//, '');
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function isTestPath(relativePath) {
  return /(^|\/)(test|tests)\//i.test(relativePath) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(relativePath);
}

function dirname(relativePath) {
  const normalized = normalizePath(relativePath);
  const directory = path.posix.dirname(normalized);
  return directory === '.' ? '' : directory;
}

function topLevel(relativePath) {
  const normalized = normalizePath(relativePath);
  return normalized.split('/')[0] || normalized;
}

function buildExistingPathSet(repoPath) {
  const existing = new Set();

  const walk = (currentPath, prefix = '') => {
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const absolute = path.join(currentPath, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      existing.add(relative);

      if (entry.isDirectory()) {
        walk(absolute, relative);
      }
    }
  };

  walk(repoPath);
  return existing;
}

function collectEntrySets(repositoryAnalysis = {}) {
  const runtimeEntrypoints = unique(repositoryAnalysis.runtimeEntrypoints || repositoryAnalysis.mainFiles?.map(file => file.relativePath));
  const uiEntrypoints = unique(repositoryAnalysis.uiEntrypoints);
  const servedDirectories = unique(repositoryAnalysis.servedDirectories);
  const workspaceRoots = unique(repositoryAnalysis.workspaceRoots);
  const routeMountFiles = unique(repositoryAnalysis.routeMountFiles);

  return {
    runtimeEntrypoints,
    runtimeDirs: unique(runtimeEntrypoints.map(dirname)),
    runtimeBasenames: new Set(runtimeEntrypoints.map(item => path.posix.basename(item))),
    uiEntrypoints,
    uiDirs: unique(uiEntrypoints.map(dirname)),
    uiBasenames: new Set(uiEntrypoints.map(item => path.posix.basename(item))),
    servedDirectories,
    servedBasenames: new Set(servedDirectories.map(item => path.posix.basename(item))),
    workspaceRoots,
    routeMountFiles,
    structureDirs: unique(repositoryAnalysis.structure?.directories || []),
    stackProfile: repositoryAnalysis.stackProfile || {},
    projectType: repositoryAnalysis.type || repositoryAnalysis.projectType || 'unknown',
    repoShape: repositoryAnalysis.stackProfile?.repoShape || 'single-app',
  };
}

function classifyEntry(relativePath, context, existingPaths) {
  const normalized = normalizePath(relativePath);
  const entryDir = dirname(normalized);
  const basename = path.posix.basename(normalized);
  const top = topLevel(normalized);
  const exists = existingPaths.has(normalized);

  const insideWorkspace = context.workspaceRoots.length === 0
    || context.workspaceRoots.some(root => normalized === root || normalized.startsWith(`${root}/`));
  const inRuntimeDir = context.runtimeDirs.some(dir => dir === entryDir || (dir && normalized.startsWith(`${dir}/`)));
  const inUiDir = context.uiDirs.some(dir => dir === entryDir || (dir && normalized.startsWith(`${dir}/`)));
  const inServedDirectory = context.servedDirectories.some(dir => normalized === dir || normalized.startsWith(`${dir}/`));
  const touchesRuntimeEntrypoint = context.runtimeEntrypoints.includes(normalized);
  const touchesUiEntrypoint = context.uiEntrypoints.includes(normalized);
  const touchesRouteMountFile = context.routeMountFiles.includes(normalized);

  return {
    path: normalized,
    exists,
    isTest: isTestPath(normalized),
    entryDir,
    basename,
    top,
    insideWorkspace,
    inRuntimeDir,
    inUiDir,
    inServedDirectory,
    touchesRuntimeEntrypoint,
    touchesUiEntrypoint,
    touchesRouteMountFile,
    seemsParallelEntrypoint: !exists && context.runtimeBasenames.has(basename) && !touchesRuntimeEntrypoint,
    seemsParallelUiEntrypoint: !exists && context.uiBasenames.has(basename) && !touchesUiEntrypoint,
    suspiciousTopLevel: !exists && context.structureDirs.length > 0 && !context.structureDirs.includes(top) && normalized.includes('/'),
  };
}

function classifyChangeIntent(repositoryAnalysis = {}, generatedCode = {}) {
  const stackProfile = repositoryAnalysis.stackProfile || {};
  const frontendRequested = (generatedCode.files || []).some((entry) => /\.(html|css|jsx|tsx)$/i.test(entry.path || '') || /(public|components|pages|app)\//i.test(entry.path || ''));
  const backendRequested = (generatedCode.files || []).some((entry) => /\.(js|ts|mjs|cjs)$/i.test(entry.path || '') || /(routes|controllers|modules|services|server|app)\//i.test(entry.path || ''));

  return {
    expectsBackendConnection: backendRequested || stackProfile.backendFramework !== 'none' || ['nodejs-express', 'nestjs', 'nodejs'].includes(repositoryAnalysis.type),
    expectsUiConnection: frontendRequested || stackProfile.frontendFramework !== 'none' || stackProfile.frontendType === 'static-web',
  };
}

function deriveSeverity(decision) {
  if (decision.blockingIssues.length > 0 || decision.pathMismatches.length > 0 || decision.missingConnections.length > 0) {
    return 'blocked';
  }
  if (decision.warnings.length > 0) {
    return 'approved_with_warnings';
  }
  return 'approved';
}

export class WritebackValidator {
  static validate({ repoPath, repositoryAnalysis, generatedCode, requirement = '', triggerType = 'feature' }) {
    const decision = {
      compatible: DEFAULT_DECISION.compatible,
      severity: DEFAULT_DECISION.severity,
      summary: DEFAULT_DECISION.summary,
      entrypointConnections: [],
      missingConnections: [],
      pathMismatches: [],
      warnings: [],
      blockingIssues: [],
      recommendedFixes: [],
      validatedPaths: [],
      pathRemap: {},
      analyzedEntries: [],
    };
    const context = collectEntrySets(repositoryAnalysis);
    const existingPaths = buildExistingPathSet(repoPath);

    const rawEntries = [
      ...(generatedCode?.files || []),
      ...(generatedCode?.tests || []),
    ];

    if (rawEntries.length === 0) {
      return {
        ...decision,
        compatible: false,
        severity: 'blocked',
        summary: 'Nenhum arquivo integrável foi produzido pelo artefato final.',
        blockingIssues: ['Artefato final sem arquivos válidos para writeback.'],
      };
    }

    const analyzedEntries = rawEntries
      .filter(entry => entry && entry.path && typeof entry.content === 'string')
      .map(entry => ({
        ...entry,
        ...classifyEntry(entry.path, context, existingPaths),
      }));

    decision.analyzedEntries = analyzedEntries.map(({ content, ...entry }) => entry);
    decision.validatedPaths = analyzedEntries.map(entry => entry.path);

    for (const entry of analyzedEntries) {
      if (!entry.insideWorkspace) {
        decision.pathMismatches.push({
          generatedPath: entry.path,
          reason: 'Arquivo gerado fora dos workspaces válidos detectados para o repositório.',
        });
      }

      if (!entry.isTest && entry.seemsParallelEntrypoint) {
        decision.pathMismatches.push({
          generatedPath: entry.path,
          reason: `O artefato cria um entrypoint paralelo com o mesmo basename de um entrypoint real (${entry.basename}).`,
        });
      }

      if (!entry.isTest && entry.seemsParallelUiEntrypoint) {
        decision.pathMismatches.push({
          generatedPath: entry.path,
          reason: `O artefato cria uma superfície de UI paralela com o mesmo basename de um entrypoint de interface real (${entry.basename}).`,
        });
      }

      if (!entry.isTest && entry.suspiciousTopLevel) {
        decision.warnings.push(`Arquivo novo em superfície ainda não existente no repositório: ${entry.path}`);
      }
    }

    const functionalEntries = analyzedEntries.filter(entry => !entry.isTest);
    const backendConnections = functionalEntries.filter(entry => entry.touchesRuntimeEntrypoint || entry.touchesRouteMountFile || entry.inRuntimeDir || existingPaths.has(entry.path));
    const uiConnections = functionalEntries.filter(entry => entry.touchesUiEntrypoint || entry.inUiDir || entry.inServedDirectory);

    decision.entrypointConnections.push(...backendConnections.map(entry => ({ path: entry.path, type: 'backend-runtime' })));
    decision.entrypointConnections.push(...uiConnections.map(entry => ({ path: entry.path, type: 'ui-runtime' })));

    const intent = classifyChangeIntent(repositoryAnalysis, generatedCode);
    const stackProfile = context.stackProfile;
    const backendFramework = stackProfile.backendFramework || 'none';
    const frontendType = stackProfile.frontendType || 'none';
    const frontendFramework = stackProfile.frontendFramework || 'none';

    if (intent.expectsBackendConnection && backendFramework !== 'none' && backendConnections.length === 0) {
      decision.missingConnections.push({
        type: 'backend-runtime',
        reason: 'Nenhum arquivo funcional foi conectado ao entrypoint ou às rotas reais do backend detectado.',
      });
      decision.recommendedFixes.push('Integre a mudança ao servidor ativo, às rotas montadas ou aos arquivos principais já utilizados pelo backend.');
    }

    if (intent.expectsUiConnection && (frontendFramework !== 'none' || frontendType === 'static-web') && uiConnections.length === 0) {
      decision.missingConnections.push({
        type: 'ui-runtime',
        reason: 'Nenhum arquivo funcional foi conectado à interface realmente servida pelo projeto.',
      });
      decision.recommendedFixes.push('Aplique a mudança em arquivos de UI reais, como public/, App principal, páginas ou componentes já conectados ao runtime.');
    }

    if (backendFramework === 'express' && functionalEntries.some(entry => /(^|\/)(app|pages)\//i.test(entry.path)) && context.runtimeEntrypoints.length > 0 && !context.runtimeEntrypoints.some(item => /(^|\/)(app|pages)\//i.test(item))) {
      decision.blockingIssues.push('A mudança cria convenções típicas de frameworks SSR/SPA em um backend Express sem evidência dessa estrutura no runtime real.');
    }

    if (frontendType === 'static-web' && functionalEntries.some(entry => /\.(tsx|jsx)$/i.test(entry.path))) {
      decision.blockingIssues.push('O frontend detectado é estático, mas o artefato gera componentes JSX/TSX sem evidência de SPA ativa.');
    }

    if (context.repoShape === 'monorepo' && functionalEntries.some(entry => !entry.insideWorkspace)) {
      decision.blockingIssues.push('O artefato altera caminhos fora dos workspaces válidos do monorepo.');
    }

    decision.compatible = decision.blockingIssues.length === 0 && decision.pathMismatches.length === 0 && decision.missingConnections.length === 0;
    decision.severity = deriveSeverity(decision);
    decision.summary = this.buildSummary(decision, requirement, triggerType);

    return {
      ...decision,
      warnings: unique(decision.warnings),
      blockingIssues: unique(decision.blockingIssues),
      recommendedFixes: unique(decision.recommendedFixes),
      validatedPaths: unique(decision.validatedPaths),
    };
  }

  static buildSummary(decision, requirement, triggerType) {
    if (decision.severity === 'blocked') {
      return `Writeback estrutural bloqueado para ${triggerType}: o artefato não está conectado à superfície real do projeto para cumprir "${String(requirement || '').slice(0, 120)}".`;
    }
    if (decision.severity === 'approved_with_warnings') {
      return 'Writeback estrutural aprovado com ressalvas: a mudança é integrável, mas há sinais de ambiguidade estrutural que devem ser registrados.';
    }
    return 'Writeback estrutural aprovado: a mudança toca superfícies compatíveis com os entrypoints reais detectados.';
  }
}

export function validateWriteback(payload) {
  return WritebackValidator.validate(payload);
}

export default WritebackValidator;
