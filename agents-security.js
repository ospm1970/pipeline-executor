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

    let braceCount = 0, startIdx = -1, inString = false;
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (char === '"' && cleaned[i - 1] !== '\\') inString = !inString;
      if (!inString) {
        if (char === '{') { if (startIdx === -1) startIdx = i; braceCount++; }
        if (char === '}') {
          braceCount--;
          if (braceCount === 0 && startIdx !== -1) {
            try { return JSON.parse(cleaned.substring(startIdx, i + 1)); } catch { break; }
          }
        }
      }
    }
    throw new Error('Could not extract valid JSON from security agent response');
  }
}

/**
 * Monta o input de segurança a partir do output do developer agent.
 * @param {object} developerOutput
 * @returns {string}
 */
export function buildSecurityInput(developerOutput) {
  const sections = [];

  if (developerOutput.implementation_summary) {
    sections.push(`## Resumo da implementação\n\n${developerOutput.implementation_summary}`);
  }

  if (developerOutput.files?.length > 0) {
    const files = developerOutput.files
      .map(f => `// ${f.path}\n${f.content}`)
      .join('\n\n');
    sections.push(`## Arquivos de implementação\n\n${files}`);
  }

  if (developerOutput.tests?.length > 0) {
    const tests = developerOutput.tests
      .map(f => `// ${f.path}\n${f.content}`)
      .join('\n\n');
    sections.push(`## Arquivos de teste\n\n${tests}`);
  }

  if (developerOutput.security_notes) {
    sections.push(`## Notas de segurança do developer\n\n${developerOutput.security_notes}`);
  }

  if (developerOutput.privacy_notes) {
    sections.push(`## Notas de privacidade do developer\n\n${developerOutput.privacy_notes}`);
  }

  if (developerOutput.dependencies?.length > 0) {
    sections.push(`## Dependências adicionadas\n\n${developerOutput.dependencies.join(', ')}`);
  }

  return sections.join('\n\n') || JSON.stringify(developerOutput);
}

/**
 * Security Agent — executa checklist de Privacy by Design e Security by Design
 * no código gerado antes do estágio de DevOps.
 *
 * Retorna { security_status, privacy_by_design, security_by_design,
 *           vulnerabilities, lgpd_compliance, approved, recommendations }.
 *
 * @param {object} developerOutput - Output do developerAgent (após code review)
 * @param {string} triggerType
 */
export async function securityAgent(developerOutput, triggerType = 'feature') {
  try {
    console.log('🔒 Security Agent: Checking security and privacy...');

    const skillContent = await loadSkill('security-agent', triggerType);
    const requiredFields = [
      'security_status', 'privacy_by_design', 'security_by_design',
      'vulnerabilities', 'lgpd_compliance', 'approved', 'recommendations',
    ];

    const securityInput = buildSecurityInput(developerOutput);

    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          {
            role: 'user',
            content: `Execute o checklist completo de segurança e privacidade no código abaixo e retorne o resultado:\n\n${securityInput}`,
          },
        ],
      }, { signal }),
      { label: 'securityAgent', timeoutMs: 120_000 }
    );

    logger.info('Token usage', {
      agent: 'securityAgent',
      prompt_tokens: response.usage?.prompt_tokens,
      completion_tokens: response.usage?.completion_tokens,
      total_tokens: response.usage?.total_tokens,
    });

    let review = null;
    try { review = extractJSON(response.choices[0].message.content); } catch { /* fall through */ }

    if (!review || typeof review.approved !== 'boolean') {
      console.warn('⚠️ Security Agent: JSON inválido ou campo approved ausente — aprovando com aviso');
      return {
        security_status: 'approved_with_warnings',
        block_reason: null,
        privacy_by_design: { issues: [] },
        security_by_design: { issues: [] },
        vulnerabilities: [],
        lgpd_compliance: { issues: [] },
        approved: true,
        recommendations: [{ priority: 'Alta', recommendation: 'Security Agent retornou resposta inválida — revisão manual de segurança obrigatória antes do deploy' }],
      };
    }

    const status = review.approved ? '✅' : '❌';
    const vulnCount = review.vulnerabilities?.length ?? 0;
    console.log(`${status} Security Agent: ${review.security_status} — ${vulnCount} vulnerabilidade(s) encontrada(s)`);

    const blocking = (review.vulnerabilities || []).filter(v => {
      const sev = (v.severity || '').toLowerCase();
      return sev === 'critical' || sev === 'crítico' || sev === 'high' || sev === 'alto';
    });
    if (blocking.length > 0) {
      blocking.forEach(v => console.warn(`  ⛔ [${v.severity}] ${v.category}: ${v.description}`));
    }

    return review;
  } catch (error) {
    console.error('❌ Security Agent Error:', error.message);
    throw error;
  }
}
