import fs from 'fs';
import path from 'path';

/**
 * Persiste artefatos operacionais e saídas do pipeline.
 */
export class CodePersister {
  static SECRET_KEY_PATTERN = /(token|api[_-]?key|authorization|password|secret)/i;
  static MAX_STRING_LENGTH = 20_000;

  static sanitizeForPersistence(value, depth = 0) {
    if (depth > 6) return '[MaxDepthReached]';
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      if (value.length <= this.MAX_STRING_LENGTH) return value;
      return `${value.slice(0, this.MAX_STRING_LENGTH)}...[truncated]`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeForPersistence(item, depth + 1));
    }

    if (typeof value === 'object') {
      const output = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        if (this.SECRET_KEY_PATTERN.test(key)) {
          output[key] = '[REDACTED]';
          continue;
        }
        output[key] = this.sanitizeForPersistence(nestedValue, depth + 1);
      }
      return output;
    }

    return String(value);
  }

  static ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  }

  static getExecutionRoot(pipelineId, executionsDir) {
    return path.join(executionsDir, pipelineId);
  }

  static getCheckpointDir(pipelineId, executionsDir) {
    return path.join(this.getExecutionRoot(pipelineId, executionsDir), 'checkpoints');
  }

  static getDerivedDir(pipelineId, executionsDir) {
    return path.join(this.getExecutionRoot(pipelineId, executionsDir), 'derived');
  }

  static getFailuresDir(pipelineId, executionsDir) {
    return path.join(this.getExecutionRoot(pipelineId, executionsDir), 'failures');
  }

  static ensureExecutionDirectories(execution, executionsDir) {
    const executionRoot = this.ensureDir(this.getExecutionRoot(execution.id, executionsDir));
    const checkpointDir = this.ensureDir(this.getCheckpointDir(execution.id, executionsDir));
    const derivedDir = this.ensureDir(this.getDerivedDir(execution.id, executionsDir));
    const failuresDir = this.ensureDir(this.getFailuresDir(execution.id, executionsDir));

    return {
      executionRoot,
      checkpointDir,
      derivedDir,
      failuresDir,
    };
  }

  static persistExecutionManifest(execution, executionsDir) {
    const dirs = this.ensureExecutionDirectories(execution, executionsDir);
    const sanitized = this.sanitizeForPersistence(execution);
    const rootFilePath = path.join(executionsDir, `${execution.id}.json`);
    const manifestFilePath = path.join(dirs.executionRoot, 'manifest.json');

    fs.writeFileSync(rootFilePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf-8');
    fs.writeFileSync(manifestFilePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf-8');

    return {
      success: true,
      rootFilePath,
      manifestFilePath,
      ...dirs,
    };
  }

  static persistCheckpoint(checkpoint, execution, executionsDir) {
    const dirs = this.ensureExecutionDirectories(execution, executionsDir);
    const safeCheckpoint = this.sanitizeForPersistence(checkpoint);
    const safeCheckpointId = String(checkpoint.checkpointId || `checkpoint-${Date.now()}`).replace(/[\\/:]/g, '-');
    const filePath = path.join(dirs.checkpointDir, `${safeCheckpointId}.json`);

    fs.writeFileSync(filePath, `${JSON.stringify(safeCheckpoint, null, 2)}\n`, 'utf-8');
    this.persistCheckpointIndex(execution.id, executionsDir);

    return {
      success: true,
      filePath,
      checkpointDir: dirs.checkpointDir,
    };
  }

  static persistDerivedState(execution, name, payload, executionsDir) {
    const dirs = this.ensureExecutionDirectories(execution, executionsDir);
    const safeName = String(name || 'state').replace(/[^a-zA-Z0-9._-]/g, '-');
    const filePath = path.join(dirs.derivedDir, `${safeName}.json`);
    const sanitized = this.sanitizeForPersistence(payload);

    fs.writeFileSync(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf-8');

    return {
      success: true,
      filePath,
      derivedDir: dirs.derivedDir,
    };
  }

  static persistFailureSnapshot(execution, payload, executionsDir) {
    const dirs = this.ensureExecutionDirectories(execution, executionsDir);
    const sanitized = this.sanitizeForPersistence(payload);
    const latestFilePath = path.join(dirs.failuresDir, 'latest.json');
    const historicalFilePath = path.join(dirs.failuresDir, `${new Date().toISOString().replace(/[.:]/g, '-')}.json`);

    fs.writeFileSync(latestFilePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf-8');
    fs.writeFileSync(historicalFilePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf-8');

    return {
      success: true,
      latestFilePath,
      historicalFilePath,
      failuresDir: dirs.failuresDir,
    };
  }

  static listExecutionCheckpoints(pipelineId, executionsDir) {
    const checkpointDir = this.getCheckpointDir(pipelineId, executionsDir);
    if (!fs.existsSync(checkpointDir)) return [];

    return fs.readdirSync(checkpointDir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .map(file => {
        const filePath = path.join(checkpointDir, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...parsed,
          filePath,
        };
      });
  }

  static persistCheckpointIndex(pipelineId, executionsDir) {
    const executionRoot = this.ensureDir(this.getExecutionRoot(pipelineId, executionsDir));
    const checkpoints = this.listExecutionCheckpoints(pipelineId, executionsDir).map(checkpoint => ({
      checkpointId: checkpoint.checkpointId,
      stage: checkpoint.stage,
      status: checkpoint.status,
      transition: checkpoint.transition,
      createdAt: checkpoint.createdAt,
      filePath: checkpoint.filePath,
    }));
    const indexPath = path.join(executionRoot, 'index.json');

    fs.writeFileSync(indexPath, `${JSON.stringify({ pipelineId, checkpoints }, null, 2)}\n`, 'utf-8');

    return {
      success: true,
      indexPath,
      checkpointCount: checkpoints.length,
    };
  }

  static readCheckpointIndex(pipelineId, executionsDir) {
    const indexPath = path.join(this.getExecutionRoot(pipelineId, executionsDir), 'index.json');
    if (!fs.existsSync(indexPath)) {
      return { pipelineId, checkpoints: [], indexPath, exists: false };
    }

    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      indexPath,
      exists: true,
    };
  }

  static readLatestFailureSnapshot(pipelineId, executionsDir) {
    const latestFilePath = path.join(this.getFailuresDir(pipelineId, executionsDir), 'latest.json');
    if (!fs.existsSync(latestFilePath)) {
      return null;
    }

    const raw = fs.readFileSync(latestFilePath, 'utf-8');
    return {
      ...JSON.parse(raw),
      filePath: latestFilePath,
    };
  }

  static readDerivedState(pipelineId, name, executionsDir) {
    const safeName = String(name || 'state').replace(/[^a-zA-Z0-9._-]/g, '-');
    const filePath = path.join(this.getDerivedDir(pipelineId, executionsDir), `${safeName}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    return {
      ...JSON.parse(raw),
      filePath,
    };
  }

  /**
   * Persiste o código gerado pelo pipeline no repositório clonado
   * @param {string} repoPath - Caminho do repositório clonado
   * @param {object} code - Objeto de código gerado pelo developer agent
   * @param {string} requirement - Requisição original
   */
  static async persistCode(repoPath, code, requirement) {
    try {
      console.log(`📝 Persistindo código gerado no repositório: ${repoPath}`);

      const srcDir = path.join(repoPath, 'src');
      if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir, { recursive: true });
        console.log('✅ Diretório src criado');
      }

      let fileName = 'generated-code.txt';
      if (code.code) {
        fileName = this.generateFileName(code.language || 'js');
        const filePath = path.join(srcDir, fileName);

        fs.writeFileSync(filePath, code.code, 'utf-8');
        console.log(`✅ Arquivo de código persistido: ${fileName}`);
      }

      const metadataPath = path.join(srcDir, 'code-metadata.json');
      const metadata = {
        requirement,
        language: code.language || 'javascript',
        functions: code.functions || [],
        dependencies: code.dependencies || [],
        code_quality_score: code.code_quality_score || 0,
        generated_at: new Date().toISOString(),
      };

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
      console.log('✅ Metadados persistidos: code-metadata.json');

      const readmePath = path.join(repoPath, 'GENERATED_CODE_README.md');
      const readmeContent = this.generateReadme(requirement, code, metadata);
      fs.writeFileSync(readmePath, readmeContent, 'utf-8');
      console.log('✅ README gerado: GENERATED_CODE_README.md');

      return {
        success: true,
        filesCreated: [fileName, 'code-metadata.json', 'GENERATED_CODE_README.md'],
        message: 'Código persistido com sucesso',
      };
    } catch (error) {
      console.error(`❌ Erro ao persistir código: ${error.message}`);
      throw new Error(`Falha ao persistir código: ${error.message}`);
    }
  }

  /**
   * Gera nome de arquivo baseado na linguagem
   */
  static generateFileName(language) {
    const now = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const extensions = {
      javascript: 'js',
      js: 'js',
      python: 'py',
      typescript: 'ts',
      java: 'java',
      go: 'go',
      rust: 'rs',
      csharp: 'cs',
      cpp: 'cpp',
      html: 'html',
    };

    const ext = extensions[language.toLowerCase()] || 'txt';
    return `generated-${now}.${ext}`;
  }

  /**
   * Gera conteúdo README com informações sobre o código gerado
   */
  static generateReadme(requirement, code, metadata) {
    return `# Código Gerado Automaticamente

## Requisição Original
\`\`\`
${requirement}
\`\`\`

## Informações do Código

- **Linguagem**: ${metadata.language}
- **Data de Geração**: ${metadata.generated_at}
- **Qualidade**: ${metadata.code_quality_score}/100

## Dependências
${metadata.dependencies.length > 0
  ? metadata.dependencies.map(dep => `- ${dep}`).join('\n')
  : '- Nenhuma dependência adicional'}

## Funções/Componentes
${metadata.functions.length > 0
  ? metadata.functions.map(func => `- ${func}`).join('\n')
  : '- Nenhuma função documentada'}

## Arquivos Gerados
- \`src/generated-*.${this.generateFileName(metadata.language).split('.')[1]}\` - Código principal
- \`src/code-metadata.json\` - Metadados do código
- \`GENERATED_CODE_README.md\` - Este arquivo

## Como Usar

1. Revise o código gerado em \`src/\`
2. Instale as dependências: \`npm install\` ou equivalente
3. Execute os testes
4. Faça as modificações necessárias
5. Commit e push as alterações

---
*Gerado pelo Pipeline Executor - Desenvolvimento Orientado por Agentes de IA*
`;
  }

  /**
   * Persiste toda a saída do pipeline (análise, design, QA, etc) em arquivos
   */
  static async persistPipelineOutput(repoPath, pipelineExecution) {
    try {
      console.log('📝 Persistindo saída completa do pipeline');

      const outputDir = path.join(repoPath, 'pipeline-output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const stages = ['specification', 'analysis', 'ux_design', 'development', 'code_review', 'security', 'qa', 'writeback_validation', 'deployment'];

      for (const stage of stages) {
        if (pipelineExecution.stages[stage]) {
          const stagePath = path.join(outputDir, `${stage}.json`);
          fs.writeFileSync(
            stagePath,
            JSON.stringify(this.sanitizeForPersistence(pipelineExecution.stages[stage]), null, 2),
            'utf-8'
          );
          console.log(`✅ Estágio ${stage} persistido`);
        }
      }

      const summaryPath = path.join(outputDir, 'pipeline-summary.json');
      const summary = {
        requirement: pipelineExecution.requirement,
        status: pipelineExecution.status,
        createdAt: pipelineExecution.createdAt,
        completedAt: pipelineExecution.completedAt,
        stages: Object.keys(pipelineExecution.stages).map(stage => ({
          name: stage,
          status: pipelineExecution.stages[stage].status,
          duration: pipelineExecution.stages[stage].duration,
        })),
      };

      fs.writeFileSync(summaryPath, JSON.stringify(this.sanitizeForPersistence(summary), null, 2), 'utf-8');
      console.log('✅ Resumo do pipeline persistido');

      return {
        success: true,
        outputDir,
        filesCreated: [...stages.map(s => `${s}.json`), 'pipeline-summary.json'],
      };
    } catch (error) {
      console.error(`❌ Erro ao persistir saída do pipeline: ${error.message}`);
      throw new Error(`Falha ao persistir saída: ${error.message}`);
    }
  }
}
