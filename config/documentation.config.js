/**
 * Configuração de Geração Automática de Documentação
 */
export const documentationConfig = {
  enabled: true,
  baseDir: './docs',
  pipelineDirectoryPattern: 'pipeline-{timestamp}',
  stageFilePattern: '{stageIndex:02d}-{stageName}.md',
  stageMapping: {
    'specification': { index: 0, name: 'especificacao', label: '📝 Especificação' },
    'analysis': { index: 1, name: 'analise', label: '📊 Análise' },
    'ux_design': { index: 2, name: 'design-ux', label: '🎨 Design UI/UX' },
    'development': { index: 3, name: 'desenvolvimento', label: '💻 Desenvolvimento' },
    'code_review': { index: 4, name: 'code-review', label: '🔎 Code Review' },
    'security': { index: 5, name: 'seguranca', label: '🔒 Segurança' },
    'qa': { index: 6, name: 'qa-testes', label: '🧪 QA/Testes' },
    'deployment': { index: 7, name: 'devops', label: '🚀 DevOps' }
  },
  generation: {
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    temperature: 0.7,
    maxTokens: 2000,
    generateIndex: true,
    includeTimestamps: true,
    includeMetadata: true
  },
  storage: {
    cacheInMemory: true,
    compressAfterDays: 30,
    archiveAfterDays: 90,
    archiveDir: './docs/archive'
  },
  access: {
    allowDownload: true,
    allowHtmlView: true,
    allowSharing: true,
    sharingLinkExpiration: 24
  },
  notifications: {
    notifyOnGeneration: true,
    notifyOnError: true,
    channels: ['console']
  }
};
export default documentationConfig;
