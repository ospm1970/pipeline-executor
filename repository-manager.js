import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

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
        console.log(`🔐 Usando autenticação com token para clone`);
      }

      console.log(`📥 Clonando repositório: ${repoUrl}`);

      // Usar quotes para proteger caminhos com espaços
      const cloneCommand = process.platform === 'win32'
        ? `cd "${workspacePath}" && git clone "${cloneUrl}" repo`
        : `cd '${workspacePath}' && git clone '${cloneUrl}' repo`;

      await execAsync(cloneCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      console.log(`✅ Repositório clonado com sucesso em: ${repoPath}`);
      return repoPath;
    } catch (error) {
      console.error(`❌ Erro ao clonar repositório:`, error.message);
      throw new Error(`Falha ao clonar repositório: ${error.message}`);
    }
  }

  /**
   * Faz commit das alterações
   */
  async commitChanges(repoPath, message) {
    try {
      console.log(`📝 Fazendo commit das alterações...`);

      // Escapar a mensagem de commit para evitar problemas com caracteres especiais
      const escapedMessage = message.replace(/"/g, '\\"');

      // Configurar identidade git
      try {
        const configCommand = process.platform === 'win32'
          ? `cd "${repoPath}" && git config user.email "pipeline@executor.local" && git config user.name "Pipeline Executor"`
          : `cd '${repoPath}' && git config user.email "pipeline@executor.local" && git config user.name "Pipeline Executor"`;
        await execAsync(configCommand, { shell: true, maxBuffer: 10 * 1024 * 1024 });
      } catch (configError) {
        console.warn(`⚠️ Erro ao configurar git user: ${configError.message}`);
      }

      // git add .
      const addCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git add .`
        : `cd '${repoPath}' && git add .`;
      await execAsync(addCommand, { shell: true, maxBuffer: 10 * 1024 * 1024 });

      // Diagnóstico: status
      const { stdout: statusOut } = await execAsync(
        process.platform === 'win32' ? `cd "${repoPath}" && git status` : `cd '${repoPath}' && git status`,
        { shell: true, maxBuffer: 10 * 1024 * 1024 }
      );
      console.log(`🔍 Git status:\n${statusOut}`);

      // Diagnóstico: arquivos staged
      const { stdout: diffOut } = await execAsync(
        process.platform === 'win32' ? `cd "${repoPath}" && git diff --cached --name-only` : `cd '${repoPath}' && git diff --cached --name-only`,
        { shell: true, maxBuffer: 10 * 1024 * 1024 }
      );
      console.log(`🔍 Arquivos staged:\n${diffOut || '(nenhum)'}`);

      // Diagnóstico: identidade configurada
      const { stdout: emailOut } = await execAsync(
        process.platform === 'win32' ? `cd "${repoPath}" && git config user.email` : `cd '${repoPath}' && git config user.email`,
        { shell: true, maxBuffer: 10 * 1024 * 1024 }
      ).catch(() => ({ stdout: 'NÃO CONFIGURADO' }));
      console.log(`🔍 Git user.email: ${emailOut.trim()}`);

      // git commit
      const commitCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git commit -m "${escapedMessage}"`
        : `cd '${repoPath}' && git commit -m "${escapedMessage}"`;
      const { stdout, stderr } = await execAsync(commitCommand, { shell: true, maxBuffer: 10 * 1024 * 1024 });
      if (stdout) console.log(`Commit stdout: ${stdout}`);
      if (stderr) console.log(`Commit stderr: ${stderr}`);
      console.log(`✅ Alterações comitadas com sucesso`);
      return true;
    } catch (error) {
      console.error(`❌ ERRO COMPLETO: ${JSON.stringify({ message: error.message, stderr: error.stderr, stdout: error.stdout, code: error.code }, null, 2)}`);

      // Se não há mudanças, não é um erro
      if (error.message.includes('nothing to commit')) {
        console.log(`ℹ️ Nenhuma alteração para comitar`);
        return true;
      }
      throw new Error(`Falha ao fazer commit: ${error.message}`);
    }
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

      return {
        name: projectName,
        version: projectVersion,
        type: this.detectProjectType(repoPath),
        path: repoPath,
      };
    } catch (error) {
      console.error(`❌ Erro ao obter informações do repositório:`, error.message);
      return {
        name: 'unknown',
        version: '1.0.0',
        type: 'unknown',
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
      console.error(`❌ Erro ao listar workspaces:`, error.message);
      return [];
    }
  }

  /**
   * Faz push das alterações para o repositório remoto
   * Usa a URL remota original do repositório clonado
   */
  async pushChanges(repoPath, githubToken = null) {
    try {
      console.log(`📤 Fazendo push das alterações...`);

      // Obter a URL remota original do repositório
      const getRemoteCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git config --get remote.origin.url`
        : `cd '${repoPath}' && git config --get remote.origin.url`;

      const { stdout: remoteUrlOutput } = await execAsync(getRemoteCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      const cleanRemoteUrl = remoteUrlOutput.trim();
      console.log(`📍 URL remota do repositório: ${cleanRemoteUrl}`);

      // Diagnóstico: branch atual
      const { stdout: branchOut } = await execAsync(
        process.platform === 'win32' ? `cd "${repoPath}" && git branch --show-current` : `cd '${repoPath}' && git branch --show-current`,
        { shell: true, maxBuffer: 10 * 1024 * 1024 }
      );
      console.log(`🔍 Branch atual: ${branchOut.trim()}`);
      const currentBranch = branchOut.trim();

      // Diagnóstico: últimos commits
      const { stdout: logOut } = await execAsync(
        process.platform === 'win32' ? `cd "${repoPath}" && git log --oneline -3` : `cd '${repoPath}' && git log --oneline -3`,
        { shell: true, maxBuffer: 10 * 1024 * 1024 }
      ).catch(() => ({ stdout: '(sem commits)' }));
      console.log(`🔍 Últimos commits:\n${logOut}`);

      // Diagnóstico: remotes configurados
      const { stdout: remoteOut } = await execAsync(
        process.platform === 'win32' ? `cd "${repoPath}" && git remote -v` : `cd '${repoPath}' && git remote -v`,
        { shell: true, maxBuffer: 10 * 1024 * 1024 }
      );
      console.log(`🔍 Remotes:\n${remoteOut}`);

      // Se token foi fornecido, adicionar credenciais à URL (somente se ainda não contiver @)
      let remoteUrl = cleanRemoteUrl;
      if (githubToken && remoteUrl.includes('github.com') && !remoteUrl.includes('@')) {
        remoteUrl = remoteUrl.replace('https://', `https://${githubToken}@`);
        console.log(`🔐 Usando autenticação com token`);
      }

      // Construir comando de push usando o branch atual
      const pushCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git push ${remoteUrl} ${currentBranch}`
        : `cd '${repoPath}' && git push ${remoteUrl} ${currentBranch}`;

      const { stdout, stderr } = await execAsync(pushCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stdout) console.log(`Push stdout: ${stdout}`);
      if (stderr) console.log(`Push stderr: ${stderr}`);

      console.log(`✅ Push realizado com sucesso`);
      return true;
    } catch (error) {
      console.error(`❌ ERRO COMPLETO: ${JSON.stringify({ message: error.message, stderr: error.stderr, stdout: error.stdout, code: error.code }, null, 2)}`);
      // Se falhar, pode ser porque não há mudanças ou permissão negada
      if (error.message.includes('nothing to push') || error.message.includes('up to date')) {
        console.log(`ℹ️ Nada para fazer push`);
        return true;
      }
      console.error(`❌ Erro ao fazer push:`, error.message);
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
        console.log(`✅ Workspace removido: ${executionId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`❌ Erro ao remover workspace:`, error.message);
      return false;
    }
  }

  /**
   * Detecta o tipo de projeto
   */
  detectProjectType(repoPath) {
    try {
      if (fs.existsSync(path.join(repoPath, 'package.json'))) {
        return 'nodejs';
      }
      if (fs.existsSync(path.join(repoPath, 'requirements.txt')) || 
          fs.existsSync(path.join(repoPath, 'setup.py'))) {
        return 'python';
      }
      if (fs.existsSync(path.join(repoPath, 'pom.xml')) || 
          fs.existsSync(path.join(repoPath, 'build.gradle'))) {
        return 'java';
      }
      if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
        return 'go';
      }
      if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) {
        return 'rust';
      }
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }
}

export default RepositoryManager;
