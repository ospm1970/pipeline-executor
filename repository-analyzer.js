import fs from 'fs';
import path from 'path';

/**
 * Analisa repositórios para extrair contexto e estrutura
 */
export class RepositoryAnalyzer {
  /**
   * Analisa o repositório e extrai informações estruturais
   */
  static async analyzeRepository(repoPath) {
    try {
      console.log(`🔍 Analisando repositório: ${repoPath}`);

      const analysis = {
        path: repoPath,
        type: this.detectProjectType(repoPath),
        structure: this.analyzeStructure(repoPath),
        mainFiles: this.findMainFiles(repoPath),
        dependencies: this.extractDependencies(repoPath),
        endpoints: [],
        functions: [],
        codePatterns: [],
        description: ''
      };

      // Analisar arquivos principais
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

      // Ler README se existir
      const readmePath = path.join(repoPath, 'README.md');
      if (fs.existsSync(readmePath)) {
        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        analysis.readme = readmeContent.substring(0, 1000); // Primeiros 1000 caracteres
      }

      console.log(`✅ Análise completa:`);
      console.log(`   - Tipo: ${analysis.type}`);
      console.log(`   - Arquivos: ${analysis.mainFiles.length}`);
      console.log(`   - Endpoints: ${analysis.endpoints.length}`);
      console.log(`   - Funções: ${analysis.functions.length}`);

      return analysis;
    } catch (error) {
      console.error(`❌ Erro ao analisar repositório: ${error.message}`);
      throw new Error(`Falha ao analisar repositório: ${error.message}`);
    }
  }

  /**
   * Detecta o tipo de projeto
   */
  static detectProjectType(repoPath) {
    const packageJsonPath = path.join(repoPath, 'package.json');
    const pyprojectPath = path.join(repoPath, 'pyproject.toml');
    const pomPath = path.join(repoPath, 'pom.xml');
    const goModPath = path.join(repoPath, 'go.mod');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      if (packageJson.dependencies?.express) {
        return 'nodejs-express';
      }
      if (packageJson.dependencies?.react) {
        return 'react';
      }
      if (packageJson.dependencies?.next) {
        return 'nextjs';
      }
      return 'nodejs';
    }

    if (fs.existsSync(pyprojectPath)) {
      return 'python';
    }

    if (fs.existsSync(pomPath)) {
      return 'java-maven';
    }

    if (fs.existsSync(goModPath)) {
      return 'golang';
    }

    return 'unknown';
  }

  /**
   * Analisa a estrutura de diretórios
   */
  static analyzeStructure(repoPath) {
    const structure = {
      directories: [],
      files: []
    };

    try {
      const items = fs.readdirSync(repoPath);
      
      for (const item of items) {
        if (item.startsWith('.')) continue;
        
        const itemPath = path.join(repoPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          structure.directories.push(item);
        } else if (['.js', '.ts', '.py', '.java', '.go', '.json'].includes(path.extname(item))) {
          structure.files.push(item);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao analisar estrutura: ${error.message}`);
    }

    return structure;
  }

  /**
   * Encontra os arquivos principais
   */
  static findMainFiles(repoPath) {
    const mainFiles = [];
    
    const patterns = {
      javascript: ['index.js', 'app.js', 'server.js', 'main.js', 'src/index.js', 'src/app.js'],
      typescript: ['index.ts', 'app.ts', 'server.ts', 'main.ts', 'src/index.ts', 'src/app.ts'],
      python: ['main.py', 'app.py', 'index.py', '__main__.py', 'src/main.py'],
    };

    for (const [language, files] of Object.entries(patterns)) {
      for (const file of files) {
        const filePath = path.join(repoPath, file);
        if (fs.existsSync(filePath)) {
          mainFiles.push({
            path: filePath,
            relativePath: file,
            language,
            name: path.basename(file)
          });
        }
      }
    }

    return mainFiles;
  }

  /**
   * Extrai dependências do package.json
   */
  static extractDependencies(repoPath) {
    const dependencies = {
      runtime: [],
      dev: []
    };

    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        
        if (packageJson.dependencies) {
          dependencies.runtime = Object.keys(packageJson.dependencies);
        }
        
        if (packageJson.devDependencies) {
          dependencies.dev = Object.keys(packageJson.devDependencies);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao extrair dependências: ${error.message}`);
    }

    return dependencies;
  }

  /**
   * Analisa um arquivo específico
   */
  static async analyzeFile(filePath, language) {
    const analysis = {
      endpoints: [],
      functions: [],
      patterns: [],
      description: ''
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

      // Extrair comentário descritivo do início do arquivo
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
   * Extrai endpoints Express
   */
  static extractEndpoints(content) {
    const endpoints = [];
    
    // Padrão: app.get/post/put/delete/patch('/path', ...)
    const endpointRegex = /app\.(get|post|put|delete|patch|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = endpointRegex.exec(content)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        line: content.substring(0, match.index).split('\n').length
      });
    }

    return endpoints;
  }

  /**
   * Extrai funções JavaScript
   */
  static extractFunctions(content) {
    const functions = [];
    
    // Padrão: function name(...) ou const name = (...) =>
    const functionRegex = /(async\s+)?function\s+(\w+)\s*\(([^)]*)\)|const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[2] || match[4];
      const params = (match[3] || match[6] || '').split(',').map(p => p.trim()).filter(p => p);
      const isAsync = !!match[1] || !!match[5];

      functions.push({
        name,
        params,
        isAsync,
        line: content.substring(0, match.index).split('\n').length
      });
    }

    return functions;
  }

  /**
   * Extrai funções Python
   */
  static extractPythonFunctions(content) {
    const functions = [];
    
    // Padrão: def name(...):
    const functionRegex = /def\s+(\w+)\s*\(([^)]*)\):/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(p => p);

      functions.push({
        name,
        params,
        isAsync: false,
        line: content.substring(0, match.index).split('\n').length
      });
    }

    return functions;
  }

  /**
   * Detecta padrões de código
   */
  static detectPatterns(content) {
    const patterns = [];

    // Detectar uso de middleware
    if (content.includes('app.use(')) {
      patterns.push('middleware');
    }

    // Detectar validação
    if (content.includes('validate') || content.includes('validation')) {
      patterns.push('validation');
    }

    // Detectar tratamento de erro
    if (content.includes('try') && content.includes('catch')) {
      patterns.push('error-handling');
    }

    // Detectar autenticação
    if (content.includes('auth') || content.includes('token') || content.includes('jwt')) {
      patterns.push('authentication');
    }

    // Detectar banco de dados
    if (content.includes('database') || content.includes('db') || content.includes('query')) {
      patterns.push('database');
    }

    // Detectar API externa
    if (content.includes('fetch') || content.includes('axios') || content.includes('http')) {
      patterns.push('external-api');
    }

    return patterns;
  }

  /**
   * Gera um resumo legível da análise
   */
  static generateSummary(analysis) {
    let summary = `## Análise do Repositório\n\n`;
    
    summary += `**Tipo de Projeto**: ${analysis.type}\n\n`;
    
    if (analysis.structure.directories.length > 0) {
      summary += `**Diretórios**: ${analysis.structure.directories.join(', ')}\n\n`;
    }
    
    if (analysis.dependencies.runtime.length > 0) {
      summary += `**Dependências Principais**: ${analysis.dependencies.runtime.slice(0, 5).join(', ')}\n\n`;
    }
    
    if (analysis.endpoints.length > 0) {
      summary += `**Endpoints Encontrados**:\n`;
      for (const endpoint of analysis.endpoints) {
        summary += `- ${endpoint.method} ${endpoint.path}\n`;
      }
      summary += '\n';
    }
    
    if (analysis.functions.length > 0) {
      summary += `**Funções Principais**:\n`;
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
