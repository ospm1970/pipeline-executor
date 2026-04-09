import fs from 'fs';
import path from 'path';

/**
 * Integra código gerado nos arquivos originais do repositório
 */
export class CodeIntegrator {
  /**
   * Detecta os arquivos principais do repositório
   */
  static detectMainFiles(repoPath) {
    const mainFiles = [];
    
    try {
      // Arquivos principais por linguagem
      const patterns = {
        javascript: ['index.js', 'app.js', 'server.js', 'main.js', 'src/index.js', 'src/app.js'],
        typescript: ['index.ts', 'app.ts', 'server.ts', 'main.ts', 'src/index.ts', 'src/app.ts'],
        python: ['main.py', 'app.py', 'index.py', '__main__.py', 'src/main.py'],
        java: ['Main.java', 'App.java', 'Application.java'],
        go: ['main.go', 'app.go'],
        rust: ['main.rs', 'lib.rs'],
      };

      // Verificar cada padrão
      for (const [language, files] of Object.entries(patterns)) {
        for (const file of files) {
          const filePath = path.join(repoPath, file);
          if (fs.existsSync(filePath)) {
            mainFiles.push({
              path: filePath,
              relativePath: file,
              language,
              name: path.basename(file),
              ext: path.extname(file)
            });
          }
        }
      }

      // Se não encontrou padrões conhecidos, procurar por qualquer arquivo principal
      if (mainFiles.length === 0) {
        const srcDir = path.join(repoPath, 'src');
        if (fs.existsSync(srcDir)) {
          const files = fs.readdirSync(srcDir);
          for (const file of files) {
            if (['.js', '.ts', '.py', '.java', '.go', '.rs'].includes(path.extname(file))) {
              const filePath = path.join(srcDir, file);
              mainFiles.push({
                path: filePath,
                relativePath: `src/${file}`,
                language: this.detectLanguage(file),
                name: file,
                ext: path.extname(file)
              });
            }
          }
        }
      }

      console.log(`📁 Arquivos principais detectados: ${mainFiles.length}`);
      mainFiles.forEach(f => console.log(`   - ${f.relativePath} (${f.language})`));

      return mainFiles;
    } catch (error) {
      console.error(`❌ Erro ao detectar arquivos principais: ${error.message}`);
      return [];
    }
  }

  /**
   * Detecta a linguagem do arquivo
   */
  static detectLanguage(filename) {
    const ext = path.extname(filename).toLowerCase();
    const extMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
    };
    return extMap[ext] || 'unknown';
  }

  /**
   * Integra código gerado no arquivo principal
   */
  static integrateCode(filePath, generatedCode, language) {
    try {
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      let integratedContent = originalContent;

      console.log(`📝 Integrando código em ${path.basename(filePath)}...`);

      // Extrair apenas o código (sem JSON wrapper)
      let codeToIntegrate = generatedCode;
      if (typeof generatedCode === 'object' && generatedCode.code) {
        codeToIntegrate = generatedCode.code;
      }

      // Integrar baseado na linguagem
      switch (language) {
        case 'javascript':
        case 'typescript':
          integratedContent = this.integrateJavaScript(originalContent, codeToIntegrate);
          break;
        case 'python':
          integratedContent = this.integratePython(originalContent, codeToIntegrate);
          break;
        case 'java':
          integratedContent = this.integrateJava(originalContent, codeToIntegrate);
          break;
        default:
          // Para outras linguagens, adicionar no final
          integratedContent = this.appendCode(originalContent, codeToIntegrate);
      }

      // Verificar se houve mudança
      if (integratedContent !== originalContent) {
        fs.writeFileSync(filePath, integratedContent, 'utf-8');
        console.log(`✅ Código integrado com sucesso em ${path.basename(filePath)}`);
        return true;
      } else {
        console.log(`ℹ️ Nenhuma mudança necessária em ${path.basename(filePath)}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Erro ao integrar código: ${error.message}`);
      throw new Error(`Falha ao integrar código: ${error.message}`);
    }
  }

  /**
   * Integra código JavaScript/TypeScript
   */
  static integrateJavaScript(originalContent, generatedCode) {
    // Se o arquivo está vazio ou é um template, adicionar o código
    if (originalContent.trim().length === 0 || originalContent.trim() === '{}') {
      return generatedCode;
    }

    // Procurar por export default ou module.exports no final
    if (originalContent.includes('export default') || originalContent.includes('module.exports')) {
      // Adicionar antes do export
      const exportMatch = originalContent.match(/(export default|module\.exports)/);
      if (exportMatch) {
        const index = originalContent.indexOf(exportMatch[0]);
        return originalContent.slice(0, index) + '\n' + generatedCode + '\n\n' + originalContent.slice(index);
      }
    }

    // Se não há export, adicionar no final
    return originalContent + '\n\n' + generatedCode;
  }

  /**
   * Integra código Python
   */
  static integratePython(originalContent, generatedCode) {
    // Se o arquivo está vazio, adicionar o código
    if (originalContent.trim().length === 0) {
      return generatedCode;
    }

    // Procurar por if __name__ == '__main__':
    if (originalContent.includes("if __name__ == '__main__':")) {
      const mainMatch = originalContent.match(/if __name__ == '__main__':/);
      if (mainMatch) {
        const index = originalContent.indexOf(mainMatch[0]);
        return originalContent.slice(0, index) + generatedCode + '\n\n' + originalContent.slice(index);
      }
    }

    // Se não há main, adicionar no final
    return originalContent + '\n\n' + generatedCode;
  }

  /**
   * Integra código Java
   */
  static integrateJava(originalContent, generatedCode) {
    // Procurar pela última chave de fechamento da classe
    const lastBraceIndex = originalContent.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      return originalContent.slice(0, lastBraceIndex) + '\n' + generatedCode + '\n' + originalContent.slice(lastBraceIndex);
    }

    // Se não encontrar, adicionar no final
    return originalContent + '\n\n' + generatedCode;
  }

  /**
   * Adiciona código no final do arquivo
   */
  static appendCode(originalContent, generatedCode) {
    return originalContent + '\n\n' + generatedCode;
  }

  /**
   * Integra código gerado em todos os arquivos principais
   */
  static async integrateIntoRepository(repoPath, generatedCode, language) {
    try {
      console.log(`🔧 Integrando código gerado no repositório...`);

      const mainFiles = this.detectMainFiles(repoPath);

      if (mainFiles.length === 0) {
        console.warn(`⚠️ Nenhum arquivo principal encontrado`);
        return {
          success: false,
          message: 'Nenhum arquivo principal encontrado no repositório',
          filesModified: 0
        };
      }

      let filesModified = 0;

      // Integrar em cada arquivo principal
      for (const file of mainFiles) {
        try {
          const modified = this.integrateCode(file.path, generatedCode, file.language);
          if (modified) {
            filesModified++;
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao integrar em ${file.relativePath}: ${error.message}`);
        }
      }

      console.log(`✅ Integração concluída: ${filesModified} arquivo(s) modificado(s)`);

      return {
        success: true,
        message: `Código integrado em ${filesModified} arquivo(s)`,
        filesModified,
        files: mainFiles
      };
    } catch (error) {
      console.error(`❌ Erro ao integrar código: ${error.message}`);
      throw new Error(`Falha ao integrar código: ${error.message}`);
    }
  }

  /**
   * Cria um backup dos arquivos antes de modificar
   */
  static createBackup(repoPath) {
    try {
      const backupDir = path.join(repoPath, '.pipeline-backup');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const mainFiles = this.detectMainFiles(repoPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      for (const file of mainFiles) {
        const backupPath = path.join(backupDir, `${file.name}.${timestamp}.backup`);
        fs.copyFileSync(file.path, backupPath);
        console.log(`💾 Backup criado: ${file.name}`);
      }

      return {
        success: true,
        backupDir,
        filesBackedUp: mainFiles.length
      };
    } catch (error) {
      console.warn(`⚠️ Erro ao criar backup: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default CodeIntegrator;
