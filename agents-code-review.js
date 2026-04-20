import OpenAI from 'openai';
import { withRetry } from './retry.js';
import logger from './logger.js';
import { loadSkill } from './skill-loader.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

/**
 * Monta o texto de input para o code review agent a partir do output do developer agent.
 * @param {object} developerOutput - Resultado do developerAgent
 * @returns {string}
 */
export function buildReviewInput(developerOutput) {
  const sections = [];

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
export async function codeReviewAgent(developerOutput, triggerType = 'feature') {
  try {
    console.log('🔎 Code Review Agent: Reviewing generated code...');

    const skillContent = await loadSkill('code-review-agent', triggerType);
    const requiredFields = ['approved', 'blocking_issues', 'warnings', 'corrected_files', 'review_summary', 'quality_score'];

    const reviewInput = buildReviewInput(developerOutput);

    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: `Revise o código abaixo e retorne o resultado da revisão:\n\n${reviewInput}` },
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
    try { review = extractJSON(response.choices[0].message.content); } catch { /* fall through */ }

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
