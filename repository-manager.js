import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import RepositoryAnalyzer from './repository-analyzer.js';

const execAsync = promisify(exec);

export function sanitizeGitUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/(https:\/\/)([^@\s]+)@/gi, '$1***@');
}

export class RepositoryManager {
  constructor(baseWorkspacePath = './workspaces') {
    this.baseWorkspacePath = baseWorkspacePath;
    this.ensureWorkspaceDirectory();
  }

  ensureWorkspaceDirectory() {
    if (!fs.existsSync(this.baseWorkspacePath)) {
      fs.mkdirSync(this.baseWorkspacePath, { recursive: true });
    }
  }

  /**
   * Gera um ID único para a execução
   */
  generateExecutionId() {
    return `exec-${Date.now()}-${uuidv4().substring(0, 8)}`;
  }

  /**
   * Cria um workspace para a execução
   */
  createWorkspace(executionId) {
    const workspacePath = path.join(this.baseWorkspacePath, executionId);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    return workspacePath;
  }

  /**
   * Clona um repositório GitHub
   */
  async cloneRepository(repoUrl, executionId, githubToken = null) {
    try {
      const workspacePath = this.createWorkspace(executionId);
      const repoPath = path.join(workspacePath, 'repo');

      // Adicionar token à URL se fornecido
      let cloneUrl = repoUrl;
      if (githubToken && repoUrl.includes('github.com')) {
        cloneUrl = repoUrl.replace('https://', `https://${githubToken}@`);
        logger.info('Usando autenticação com token para clone');
      }

      logger.info('Clonando repositório', { url: repoUrl });

      // Usar quotes para proteger caminhos com espaços
      const cloneCommand = process.platform === 'win32'
        ? `cd "${workspacePath}" && git clone "${cloneUrl}" repo`
        : `cd '${workspacePath}' && git clone '${cloneUrl}' repo`;

      await execAsync(cloneCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (githubToken && repoUrl.includes('github.com')) {
        const sanitizeRemoteCommand = process.platform === 'win32'
          ? `cd "${repoPath}" && git remote set-url origin "${repoUrl}"`
          : `cd '${repoPath}' && git remote set-url origin '${repoUrl}'`;
        await execAsync(sanitizeRemoteCommand, {
          shell: true,
          maxBuffer: 10 * 1024 * 1024,
        });
        logger.info('Remote origin sanitizado após clone autenticado');
      }

      logger.info('Repositório clonado com sucesso', { repoPath });
      return repoPath;
    } catch (error) {
      logger.error('Erro ao clonar repositório', { error: error.message });
      throw new Error(`Falha ao clonar repositório: ${error.message}`);
    }
  }

  /**
   * Faz commit das alterações
   */
  async commitChanges(repoPath, message) {
    try {
      logger.info('Fazendo commit das alterações');

      // Escapar a mensagem de commit para evitar problemas com caracteres especiais
      const escapedMessage = message.replace(/"/g, '\\"');

      // Configurar identidade git
      try {
        const configCommand = process.platform === 'win32'
          ? `cd "${repoPath}" && git config user.email "pipeline@executor.local" && git config user.name "Pipeline Executor"`
          : `cd '${repoPath}' && git config user.email "pipeline@executor.local" && git config user.name "Pipeline Executor"`;
        await execAsync(configCommand, { shell: true, maxBuffer: 10 * 1024 * 1024 });
      } catch (configError) {
        logger.warn('Erro ao configurar git user', { error: configError.message });
      }

      // git add .
      const addCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git add .`
        : `cd '${repoPath}' && git add .`;
      await execAsync(addCommand, { shell: true, maxBuffer: 10 * 1024 * 1024 });

      // git commit
      const commitCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git commit -m "${escapedMessage}"`
        : `cd '${repoPath}' && git commit -m "${escapedMessage}"`;
      await execAsync(commitCommand, { shell: true, maxBuffer: 10 * 1024 * 1024 });
      logger.info('Alterações comitadas com sucesso');
      return true;
    } catch (error) {
      // Se não há mudanças, não é um erro
      if (error.message.includes('nothing to commit')) {
        logger.info('Nenhuma alteração para comitar');
        return true;
      }
      logger.error('Erro ao fazer commit', { error: error.message });
      throw new Error(`Falha ao fazer commit: ${error.message}`);
    }
  }

  /**
   * Cria um novo branch no repositório
   */
  async createBranch(repoPath, branchName) {
    const cmd = process.platform === 'win32'
      ? `cd "${repoPath}" && git checkout -b "${branchName}"`
      : `cd '${repoPath}' && git checkout -b '${branchName}'`;
    await execAsync(cmd, { shell: true });
    logger.info('Branch criado', { branchName });
    return branchName;
  }

  /**
   * Obtém informações do repositório
   */
  getRepositoryInfo(repoPath) {
    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      let projectName = 'unknown';
      let projectVersion = '1.0.0';

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        projectName = packageJson.name || 'unknown';
        projectVersion = packageJson.version || '1.0.0';
      }

      const stackProfile = RepositoryAnalyzer.classifyProjectStack(repoPath);

      return {
        name: projectName,
        version: projectVersion,
        type: stackProfile.projectType,
        stackProfile,
        path: repoPath,
      };
    } catch (error) {
      logger.error('Erro ao obter informações do repositório', { error: error.message });
      return {
        name: 'unknown',
        version: '1.0.0',
        type: 'unknown',
        stackProfile: {
          projectType: 'unknown',
          primaryRuntime: 'unknown',
          primaryLanguage: 'unknown',
          backendFramework: 'none',
          frontendFramework: 'none',
          frontendType: 'none',
          uiTech: [],
          moduleType: 'commonjs',
          packageManager: 'unknown',
          repoShape: 'single-app',
          languages: [],
          testFrameworks: [],
          stackTags: [],
          evidence: { manifests: [], dependencies: [], indicators: {} },
        },
        path: repoPath,
      };
    }
  }

  /**
   * Lista todos os workspaces
   */
  listWorkspaces() {
    try {
      if (!fs.existsSync(this.baseWorkspacePath)) {
        return [];
      }

      const workspaces = fs.readdirSync(this.baseWorkspacePath);
      return workspaces.map((ws) => ({
        id: ws,
        path: path.join(this.baseWorkspacePath, ws),
      }));
    } catch (error) {
      logger.error('Erro ao listar workspaces', { error: error.message });
      return [];
    }
  }

  /**
   * Faz push das alterações para o repositório remoto
   * Usa a URL remota original do repositório clonado
   */
  async pushChanges(repoPath, githubToken = null, branchName = null) {
    try {
      logger.info('Fazendo push das alterações');

      // Obter a URL remota original do repositório
      const getRemoteCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git config --get remote.origin.url`
        : `cd '${repoPath}' && git config --get remote.origin.url`;

      const { stdout: remoteUrlOutput } = await execAsync(getRemoteCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      const cleanRemoteUrl = remoteUrlOutput.trim();
      logger.info('URL remota do repositório', { url: sanitizeGitUrl(cleanRemoteUrl) });

      // Branch: use provided branchName or detect current branch
      let currentBranch = branchName;
      if (!currentBranch) {
        const { stdout: branchOut } = await execAsync(
          process.platform === 'win32' ? `cd "${repoPath}" && git branch --show-current` : `cd '${repoPath}' && git branch --show-current`,
          { shell: true, maxBuffer: 10 * 1024 * 1024 }
        );
        currentBranch = branchOut.trim();
      }
      logger.info('Branch para push', { branch: currentBranch });

      // Se token foi fornecido, adicionar credenciais à URL (somente se ainda não contiver @)
      let remoteUrl = cleanRemoteUrl;
      if (githubToken && remoteUrl.includes('github.com') && !remoteUrl.includes('@')) {
        remoteUrl = remoteUrl.replace('https://', `https://${githubToken}@`);
        logger.info('Usando autenticação com token para push', { url: sanitizeGitUrl(remoteUrl) });
      }

      // Construir comando de push usando o branch atual
      const pushCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git push ${remoteUrl} ${currentBranch}`
        : `cd '${repoPath}' && git push ${remoteUrl} ${currentBranch}`;

      await execAsync(pushCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      logger.info('Push realizado com sucesso', { branch: currentBranch });
      return true;
    } catch (error) {
      // Se falhar, pode ser porque não há mudanças ou permissão negada
      if (error.message.includes('nothing to push') || error.message.includes('up to date')) {
        logger.info('Nada para fazer push');
        return true;
      }
      logger.error('Erro ao fazer push', { error: error.message });
      throw new Error(`Falha ao fazer push: ${error.message}`);
    }
  }

  /**
   * Remove um workspace
   */
  removeWorkspace(executionId) {
    try {
      const workspacePath = path.join(this.baseWorkspacePath, executionId);
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
        logger.info('Workspace removido', { executionId });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Erro ao remover workspace', { error: error.message });
      return false;
    }
  }

  /**
   * Detecta o tipo de projeto
   */
  detectProjectType(repoPath) {
    try {
      return RepositoryAnalyzer.detectProjectType(repoPath);
    } catch (error) {
      return 'unknown';
    }
  }
}

export default RepositoryManager;
