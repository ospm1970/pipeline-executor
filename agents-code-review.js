import { withRetry } from './retry.js';
import logger from './logger.js';
import { loadSkill } from './skill-loader.js';
import { getOpenAIClient } from './openai-client.js';

const JSON_SUFFIX = `

---

## Instrução de formato (obrigatória)

CRÍTICO: Responda EXCLUSIVAMENTE com JSON válido. Sem blocos markdown (\`\`\`json), sem texto introdutório, sem texto de encerramento. Apenas o objeto JSON puro.`;

function extractJSON(content) {
  try {
    return JSON.parse(content);
  } catch {
    let cleaned = content;
    if (cleaned.includes('```json')) {
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/```\n?/g, '');
    }
    cleaned = cleaned.trim();

    let braceCount = 0;
    let startIdx = -1;
    let inString = false;
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (char === '"' && cleaned[i - 1] !== '\\') inString = !inString;
      if (!inString) {
        if (char === '{') { if (startIdx === -1) startIdx = i; braceCount++; }
        if (char === '}') { braceCount--; if (braceCount === 0 && startIdx !== -1) {
          try { return JSON.parse(cleaned.substring(startIdx, i + 1)); } catch { break; }
        }}
      }
    }
    throw new Error('Could not extract valid JSON from response');
  }
}

function normalizeReviewResult(review = {}) {
  const blockingIssues = [...new Set((review.blocking_issues || [])
    .map(issue => String(issue || '').trim())
    .filter(Boolean))];
  const warnings = [...new Set((review.warnings || [])
    .map(issue => String(issue || '').trim())
    .filter(Boolean))];
  const correctedFiles = Array.isArray(review.corrected_files) ? review.corrected_files : [];
  const approved = review.approved === true && blockingIssues.length === 0;

  return {
    ...review,
    approved,
    blocking_issues: blockingIssues,
    warnings,
    corrected_files: correctedFiles,
    review_status: approved ? 'approved' : 'blocked',
  };
}

/**
 * Monta o texto de input para o code review agent a partir do output do developer agent.
 * @param {object} developerOutput - Resultado do developerAgent
 * @returns {string}
 */
export function buildReviewGuidance(reviewContext = {}, triggerType = 'feature') {
  const rules = [
    'Revise o código de acordo com a stack detectada no repositório alvo, e não com padrões genéricos de outras stacks.',
    'Só bloqueie por incompatibilidade arquitetural quando houver conflito real com a stack detectada, com o padrão existente ou com o requisito.',
  ];

  const stackProfile = reviewContext?.stackProfile || {};
  const backendFramework = stackProfile.backendFramework || 'none';
  const frontendFramework = stackProfile.frontendFramework || 'none';
  const frontendType = stackProfile.frontendType || 'none';
  const repoShape = stackProfile.repoShape || 'single-app';

  if (reviewContext?.projectType === 'nodejs-express' || backendFramework === 'express') {
    rules.push('O projeto alvo é nodejs-express/express. Não exija decorators, modules, pipes, guards, DTOs, HttpException ou filtros de exceção NestJS, exceto em migração explícita.');
    rules.push('Prefira critérios compatíveis com Express: routers, middlewares, serviços utilitários, validação compatível com Express, tratamento de erro por middleware e dependências coerentes com Express.');
  }

  if (backendFramework === 'nestjs') {
    rules.push('O backend detectado usa NestJS. Considere módulos, controllers, providers, DTOs e validação estruturada como padrões esperados; não penalize essa organização quando ela já fizer parte da stack alvo.');
  }

  if (frontendType === 'none') {
    rules.push('O repositório alvo não possui frontend detectado. Trate a introdução de componentes React, páginas Next.js ou camadas visuais novas como expansão arquitetural, não como requisito implícito.');
  }

  if (frontendType === 'static-web') {
    rules.push('O frontend detectado é estático. Não considere ausência de React, JSX/TSX, bundlers SPA ou componentização moderna como problema por si só. Bloqueie apenas se a entrega introduzir frontend reativo incompatível sem justificativa arquitetural explícita.');
  }

  if (frontendType === 'spa' || frontendFramework === 'react') {
    rules.push('O frontend detectado é SPA/React. Avalie componentes, hooks, organização por telas e testes de interface com critérios compatíveis com esse ecossistema, sem exigir SSR ou APIs de framework inexistentes.');
  }

  if (frontendFramework === 'nextjs' || frontendType === 'ssr-web') {
    rules.push('O frontend detectado usa Next.js/SSR. Não bloqueie o uso de páginas, app router, server components ou handlers próprios do framework quando coerentes com o padrão existente.');
  }

  if (repoShape === 'monorepo') {
    rules.push('O repositório é um monorepo. Revise a aderência considerando o pacote ou app afetado, evitando bloquear a entrega por padrões legítimos de outro workspace não relacionado.');
  }

  if (triggerType === 'feature' || triggerType === 'bugfix' || triggerType === 'refactor') {
    rules.push('Avalie a solução como mudança incremental compatível: preserve convenções, contratos, organização e dependências existentes sempre que possível.');
  }

  if (Number(reviewContext?.fileCount || 0) > 0 && Number(reviewContext.fileCount) <= 20) {
    rules.push('O repositório é pequeno. Considere sobregeração arquitetural e expansão desnecessária como sinal de baixa aderência técnica.');
  }

  rules.push('Se a entrega introduzir nova arquitetura, nova camada, frontend inexistente ou stack diferente, exija justificativa explícita em implementation_summary com o prefixo "Justificativa arquitetural:".');

  return rules.map(rule => `- ${rule}`).join('\n');
}

export function buildReviewInput(developerOutput, reviewContext = {}, triggerType = 'feature') {
  const sections = [];

  sections.push(`## Regras obrigatórias da revisão\n\n${buildReviewGuidance(reviewContext, triggerType)}`);

  if (Object.keys(reviewContext || {}).length > 0) {
    sections.push(`## Contexto do repositório alvo\n\n${JSON.stringify(reviewContext, null, 2)}`);
  }

  if (developerOutput.implementation_summary) {
    sections.push(`## Resumo da implementação\n\n${developerOutput.implementation_summary}`);
  }

  if (developerOutput.files?.length > 0) {
    const files = developerOutput.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n');
    sections.push(`## Arquivos de implementação\n\n${files}`);
  }

  if (developerOutput.tests?.length > 0) {
    const tests = developerOutput.tests.map(f => `// ${f.path}\n${f.content}`).join('\n\n');
    sections.push(`## Arquivos de teste\n\n${tests}`);
  }

  if (developerOutput.security_notes) {
    sections.push(`## Notas de segurança do developer\n\n${developerOutput.security_notes}`);
  }

  if (developerOutput.privacy_notes) {
    sections.push(`## Notas de privacidade do developer\n\n${developerOutput.privacy_notes}`);
  }

  return sections.join('\n\n') || JSON.stringify(developerOutput);
}

/**
 * Code Review Agent — valida o código gerado pelo Developer Agent.
 * Retorna { approved, blocking_issues, warnings, corrected_files, review_summary, quality_score }.
 * Se approved=false, o orchestrator deve reenviar ao developer com os blocking_issues.
 *
 * @param {object} developerOutput - Output completo do developerAgent
 * @param {string} triggerType
 */
export async function codeReviewAgent(developerOutput, triggerType = 'feature', reviewContext = {}) {
  try {
    console.log('🔎 Code Review Agent: Reviewing generated code...');

    const skillContent = await loadSkill('code-review-agent', triggerType);
    const requiredFields = ['approved', 'blocking_issues', 'warnings', 'corrected_files', 'review_summary', 'quality_score'];

    const reviewInput = buildReviewInput(developerOutput, reviewContext, triggerType);

    const response = await withRetry(
      (signal) => getOpenAIClient('O Code Review Agent').chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: `Revise o código abaixo e retorne o resultado da revisão. Aplique os critérios de forma estritamente compatível com a stack detectada do repositório alvo e com política de mudança mínima compatível.\n\n${reviewInput}` },
        ],
      }, { signal }),
      { label: 'codeReviewAgent', timeoutMs: 120_000 }
    );

    logger.info('Token usage', {
      agent: 'codeReviewAgent',
      prompt_tokens: response.usage?.prompt_tokens,
      completion_tokens: response.usage?.completion_tokens,
      total_tokens: response.usage?.total_tokens,
    });

    let review = null;
    try { review = normalizeReviewResult(extractJSON(response.choices[0].message.content)); } catch { /* fall through */ }

    if (!review || typeof review.approved !== 'boolean') {
      console.warn('⚠️ Code Review Agent: JSON inválido ou campo approved ausente — aprovando com aviso');
      return {
        approved: true,
        blocking_issues: [],
        warnings: ['Code Review Agent retornou resposta inválida — revisão manual recomendada'],
        corrected_files: [],
        review_summary: 'Revisão automática indisponível',
        quality_score: 0,
      };
    }

    const status = review.approved ? '✅' : '❌';
    console.log(`${status} Code Review Agent: ${review.approved ? 'Aprovado' : 'Reprovado'} (score: ${review.quality_score ?? 'N/A'})`);
    if (review.blocking_issues?.length > 0) {
      review.blocking_issues.forEach(issue => console.warn(`  ⛔ ${issue}`));
    }

    return review;
  } catch (error) {
    console.error('❌ Code Review Agent Error:', error.message);
    throw error;
  }
}
