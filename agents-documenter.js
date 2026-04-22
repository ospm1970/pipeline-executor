import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withRetry } from './retry.js';
import logger from './logger.js';
import { getOpenAIClient } from './openai-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DocumenterAgentWithSkill {
  constructor() {
    this.skillPath = path.join(__dirname, 'skills', 'documenter-agent', 'SKILL.md');
    this.skillContent = this.loadSkill();
  }

  loadSkill() {
    try {
      if (fs.existsSync(this.skillPath)) {
        return fs.readFileSync(this.skillPath, 'utf-8');
      } else {
        console.warn(`⚠️ Documenter Agent skill file not found at ${this.skillPath}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error loading Documenter Agent skill:`, error.message);
      return null;
    }
  }

  async generateDocumentation(pipelineData) {
    try {
      const { pipelineId, stage, requirement, input, output } = pipelineData;

      // Preparar o prompt com a skill
      let systemPrompt = `Você é um Agente Documentador especializado em gerar documentação de pipelines de desenvolvimento.`;
      
      if (this.skillContent) {
        systemPrompt += `\n\nAqui está sua Skill (instruções detalhadas):\n${this.skillContent}`;
      }

      const userPrompt = `
Gere a documentação para a seguinte etapa do pipeline:

**Pipeline ID:** ${pipelineId}
**Etapa:** ${stage}
**Requisito Original:** ${requirement}

**Entrada da Etapa:**
${JSON.stringify(input, null, 2)}

**Saída da Etapa:**
${JSON.stringify(output, null, 2)}

Gere um documento Markdown profissional e detalhado que explique o que foi executado nesta etapa.
`;

      const response = await withRetry(
        (signal) => getOpenAIClient('O Documenter Agent').chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }, { signal }),
        { label: 'documenterAgent', timeoutMs: 120_000 }
      );

      logger.info('Token usage', { agent: 'documenterAgent', prompt_tokens: response.usage?.prompt_tokens, completion_tokens: response.usage?.completion_tokens, total_tokens: response.usage?.total_tokens });
      const documentation = response.choices[0].message.content.trim();
      
      // Remover delimitadores de markdown se presentes
      const cleanedDoc = documentation
        .replace(/^```markdown\n/, '')
        .replace(/\n```$/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '');

      return cleanedDoc;
    } catch (error) {
      console.error(`❌ Documenter Agent Error:`, error.message);
      throw error;
    }
  }

  async saveDocumentation(pipelineId, stage, documentation) {
    try {
      // Criar estrutura de diretórios
      const docsDir = path.join(__dirname, 'docs', pipelineId);
      
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      // Mapear nome da etapa para nome de arquivo
      const stageFileNames = {
        'specification': '00-especificacao',
        'analysis': '01-analise',
        'ux_design': '02-design-ux',
        'development': '03-desenvolvimento',
        'code_review': '04-code-review',
        'security': '05-seguranca',
        'qa': '06-qa-testes',
        'deployment': '07-devops',
      };

      const fileName = stageFileNames[stage] || stage;
      const filePath = path.join(docsDir, `${fileName}.md`);

      fs.writeFileSync(filePath, documentation, 'utf-8');
      
      console.log(`✅ Documentation saved: ${filePath}`);
      
      return {
        success: true,
        path: filePath,
        relativePath: `docs/${pipelineId}/${fileName}.md`
      };
    } catch (error) {
      console.error(`❌ Error saving documentation:`, error.message);
      throw error;
    }
  }

  async generateAndSaveDocumentation(pipelineData) {
    try {
      const documentation = await this.generateDocumentation(pipelineData);
      const saveResult = await this.saveDocumentation(pipelineData.pipelineId, pipelineData.stage, documentation);
      
      return {
        documentation,
        saved: true,
        ...saveResult
      };
    } catch (error) {
      console.error(`❌ Error generating and saving documentation:`, error.message);
      throw error;
    }
  }

  async generateIndexDocument(pipelineId, stages) {
    try {
      const docsDir = path.join(__dirname, 'docs', pipelineId);
      
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const indexContent = `# 📚 Documentação do Pipeline - ${pipelineId}

**Data de Geração:** ${new Date().toLocaleString('pt-BR')}

## 📋 Índice de Etapas

${stages.map((stage, index) => {
  const stageNames = {
    'specification': '📝 Especificação',
    'analysis': '📊 Análise',
    'ux_design': '🎨 Design UI/UX',
    'development': '💻 Desenvolvimento',
    'code_review': '🔎 Code Review',
    'security': '🔒 Segurança',
    'qa': '🧪 QA/Testes',
    'deployment': '🚀 DevOps',
  };

  const stageFileNames = {
    'specification': '00-especificacao',
    'analysis': '01-analise',
    'ux_design': '02-design-ux',
    'development': '03-desenvolvimento',
    'code_review': '04-code-review',
    'security': '05-seguranca',
    'qa': '06-qa-testes',
    'deployment': '07-devops',
  };

  const stageName = stageNames[stage] || stage;
  const fileName = stageFileNames[stage] || stage;
  
  return `${index + 1}. [${stageName}](./${fileName}.md)`;
}).join('\n')}

---

## 📖 Como Usar Esta Documentação

Esta documentação foi gerada automaticamente pelo **Agente Documentador** durante a execução do pipeline de desenvolvimento. Cada seção corresponde a uma etapa do pipeline e contém:

- **Resumo da Etapa**: O que foi realizado e por quê
- **Entradas Processadas**: Os dados que a etapa recebeu
- **Ações Executadas**: As principais operações realizadas
- **Artefatos Gerados**: Os resultados produzidos
- **Decisões e Insights**: Decisões técnicas e recomendações

---

## 🎯 Estrutura do Pipeline

\`\`\`
Etapa 0: Especificação (Spec-Driven Development)
   ↓
Etapa 1: Análise
   ↓
Etapa 2: Design UI/UX
   ↓
Etapa 3: Desenvolvimento
   ↓
Etapa 4: Code Review
   ↓
Etapa 5: Segurança (Privacy & Security by Design)
   ↓
Etapa 6: QA/Testes (evidências reais de cobertura)
   ↓
Etapa 7: DevOps/Deployment
\`\`\`

---

**Gerado por:** Pipeline Executor — Agente Documentador
`;

      const indexPath = path.join(docsDir, 'README.md');
      fs.writeFileSync(indexPath, indexContent, 'utf-8');
      
      console.log(`✅ Index document created: ${indexPath}`);
      
      return indexPath;
    } catch (error) {
      console.error(`❌ Error generating index document:`, error.message);
      throw error;
    }
  }

  getDocumentationPath(pipelineId) {
    return path.join(__dirname, 'docs', pipelineId);
  }

  listDocumentation(pipelineId) {
    try {
      const docsDir = this.getDocumentationPath(pipelineId);
      
      if (!fs.existsSync(docsDir)) {
        return [];
      }

      const files = fs.readdirSync(docsDir)
        .filter(f => f.endsWith('.md'))
        .sort();

      return files.map(f => ({
        name: f,
        path: path.join(docsDir, f),
        relativePath: `docs/${pipelineId}/${f}`
      }));
    } catch (error) {
      console.error(`❌ Error listing documentation:`, error.message);
      return [];
    }
  }
}

export default DocumenterAgentWithSkill;
