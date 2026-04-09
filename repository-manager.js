import { exec, execSync } from 'child_process';
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
      }

      console.log(`📦 Clonando repositório: ${repoUrl}`);
      
      // Usar quotes para proteger caminhos com espaços (Windows/Linux)
      const escapedRepoPath = process.platform === 'win32' ? `"${repoPath}"` : `'${repoPath}'`;
      const command = `git clone "${cloneUrl}" ${escapedRepoPath}`;
      
      await execAsync(command, { shell: true, maxBuffer: 10 * 1024 * 1024 });

      console.log(`✅ Repositório clonado em: ${repoPath}`);
      return repoPath;
    } catch (error) {
      console.error(`❌ Erro ao clonar repositório:`, error.message);
      throw new Error(`Falha ao clonar repositório: ${error.message}`);
    }
  }

  /**
   * Detecta o tipo de projeto
   */
  detectProjectType(repoPath) {
    const files = fs.readdirSync(repoPath);

    if (files.includes('package.json')) {
      return 'nodejs';
    }
    if (files.includes('requirements.txt')) {
      return 'python';
    }
    if (files.includes('pom.xml')) {
      return 'maven';
    }
    if (files.includes('build.gradle')) {
      return 'gradle';
    }
    if (files.includes('Gemfile')) {
      return 'ruby';
    }
    if (files.includes('go.mod')) {
      return 'golang';
    }

    return 'unknown';
  }

  /**
   * Obtém o comando de build para o tipo de projeto
   */
  getBuildCommand(projectType) {
    const commands = {
      nodejs: 'npm install',
      python: 'pip install -r requirements.txt',
      maven: 'mvn clean install',
      gradle: './gradlew build',
      ruby: 'bundle install',
      golang: 'go build',
    };

    return commands[projectType] || null;
  }

  /**
   * Obtém o comando de start para o tipo de projeto
   */
  getStartCommand(projectType, port) {
    const commands = {
      nodejs: `PORT=${port} npm start`,
      python: `PORT=${port} python app.py`,
      maven: `java -jar target/*.jar --server.port=${port}`,
      gradle: `./gradlew bootRun --args='--server.port=${port}'`,
      ruby: `rails server -p ${port}`,
      golang: `./app -port ${port}`,
    };

    return commands[projectType] || null;
  }

  /**
   * Faz commit das alterações no repositório clonado
   */
  async commitChanges(repoPath, message) {
    try {
      console.log(`📝 Fazendo commit das alterações...`);
      
      // Usar quotes para proteger caminhos com espaços
      const escapedRepoPath = process.platform === 'win32' ? `"${repoPath}"` : `'${repoPath}'`;
      const escapedMessage = message.replace(/"/g, '\\"');
      const command = process.platform === 'win32' 
        ? `cd "${repoPath}" && git add . && git commit -m "${escapedMessage}"`
        : `cd '${repoPath}' && git add . && git commit -m "${escapedMessage}"`;
      
      await execAsync(command, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });
      console.log(`✅ Alterações comitadas com sucesso`);
      return true;
    } catch (error) {
      // Se não há mudanças, não é um erro
      if (error.message.includes('nothing to commit')) {
        console.log(`ℹ️ Nenhuma alteração para comitar`);
        return true;
      }
      console.error(`❌ Erro ao fazer commit:`, error.message);
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
   */
  async pushChanges(repoPath, githubToken = null) {
    try {
      console.log(`📤 Fazendo push das alterações...`);
      
      // Usar quotes para proteger caminhos com espaços
      const escapedRepoPath = process.platform === 'win32' ? `"${repoPath}"` : `'${repoPath}'`;
      
      // Se token foi fornecido, adicionar credenciais
      let pushCommand = process.platform === 'win32'
        ? `cd "${repoPath}" && git push origin main`
        : `cd '${repoPath}' && git push origin main`;
      
      if (githubToken) {
        // Configurar credenciais temporárias para o push
        pushCommand = process.platform === 'win32'
          ? `cd "${repoPath}" && git config credential.helper store && echo "https://${githubToken}@github.com" | git credential approve && git push origin main`
          : `cd '${repoPath}' && git push "https://${githubToken}@github.com/$(git config --get remote.origin.url | sed 's/.*github.com\///').git" main`;
      }
      
      await execAsync(pushCommand, {
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });
      
      console.log(`✅ Push realizado com sucesso`);
      return true;
    } catch (error) {
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
}

export default RepositoryManager;
