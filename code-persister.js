import fs from 'fs';
import path from 'path';

/**
 * Persiste o código gerado pelo pipeline no repositório clonado
 */
export class CodePersister {
  /**
   * Persiste o código gerado em arquivos do repositório
   * @param {string} repoPath - Caminho do repositório clonado
   * @param {object} code - Objeto de código gerado pelo developer agent
   * @param {string} requirement - Requisição original
   */
  static async persistCode(repoPath, code, requirement) {
    try {
      console.log(`📝 Persistindo código gerado no repositório: ${repoPath}`);
      
      // Criar diretório src se não existir
      const srcDir = path.join(repoPath, 'src');
      if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir, { recursive: true });
        console.log(`✅ Diretório src criado`);
      }
      
      // Se o código tem um campo 'code' com o código real
      let fileName = 'generated-code.txt';
      if (code.code) {
        fileName = this.generateFileName(code.language || 'js');
        const filePath = path.join(srcDir, fileName);
        
        fs.writeFileSync(filePath, code.code, 'utf-8');
        console.log(`✅ Arquivo de código persistido: ${fileName}`);
      }
      
      // Persistir metadados do código em um arquivo JSON
      const metadataPath = path.join(srcDir, 'code-metadata.json');
      const metadata = {
        requirement,
        language: code.language || 'javascript',
        functions: code.functions || [],
        dependencies: code.dependencies || [],
        code_quality_score: code.code_quality_score || 0,
        generated_at: new Date().toISOString()
      };
      
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
      console.log(`✅ Metadados persistidos: code-metadata.json`);
      
      // Persistir README com instruções
      const readmePath = path.join(repoPath, 'GENERATED_CODE_README.md');
      const readmeContent = this.generateReadme(requirement, code, metadata);
      fs.writeFileSync(readmePath, readmeContent, 'utf-8');
      console.log(`✅ README gerado: GENERATED_CODE_README.md`);
      
      return {
        success: true,
        filesCreated: [fileName, 'code-metadata.json', 'GENERATED_CODE_README.md'],
        message: 'Código persistido com sucesso'
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
      'javascript': 'js',
      'js': 'js',
      'python': 'py',
      'typescript': 'ts',
      'java': 'java',
      'go': 'go',
      'rust': 'rs',
      'csharp': 'cs',
      'cpp': 'cpp',
      'html': 'html'
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
      console.log(`📝 Persistindo saída completa do pipeline`);
      
      // Criar diretório pipeline-output
      const outputDir = path.join(repoPath, 'pipeline-output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Persistir cada estágio
      const stages = ['specification', 'analysis', 'ux_design', 'development', 'qa', 'deployment'];
      
      for (const stage of stages) {
        if (pipelineExecution.stages[stage]) {
          const stagePath = path.join(outputDir, `${stage}.json`);
          fs.writeFileSync(
            stagePath,
            JSON.stringify(pipelineExecution.stages[stage], null, 2),
            'utf-8'
          );
          console.log(`✅ Estágio ${stage} persistido`);
        }
      }
      
      // Persistir resumo do pipeline
      const summaryPath = path.join(outputDir, 'pipeline-summary.json');
      const summary = {
        requirement: pipelineExecution.requirement,
        status: pipelineExecution.status,
        createdAt: pipelineExecution.createdAt,
        completedAt: pipelineExecution.completedAt,
        stages: Object.keys(pipelineExecution.stages).map(stage => ({
          name: stage,
          status: pipelineExecution.stages[stage].status,
          duration: pipelineExecution.stages[stage].duration
        }))
      };
      
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
      console.log(`✅ Resumo do pipeline persistido`);
      
      return {
        success: true,
        outputDir,
        filesCreated: [...stages.map(s => `${s}.json`), 'pipeline-summary.json']
      };
    } catch (error) {
      console.error(`❌ Erro ao persistir saída do pipeline: ${error.message}`);
      throw new Error(`Falha ao persistir saída: ${error.message}`);
    }
  }
}
