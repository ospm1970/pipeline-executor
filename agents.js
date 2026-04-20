import OpenAI from 'openai';
import { withRetry } from './retry.js';
import logger from './logger.js';
import { loadSkill } from './skill-loader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente OpenAI
// ─────────────────────────────────────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos (sem alteração de lógica)
// ─────────────────────────────────────────────────────────────────────────────
function logTokens(agent, usage) {
  if (!usage) return;
  logger.info('Token usage', {
    agent,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  });
}

function validateJSON(data, requiredFields = []) {
  if (!data || typeof data !== 'object') return false;
  for (const field of requiredFields) {
    if (!(field in data)) {
      console.warn(`⚠️ Missing required field: ${field}`);
      return false;
    }
  }
  return true;
}

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

    // Extrai objeto JSON com chaves balanceadas
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

async function autoCorrectJSON(requirement, agentType, requiredFields) {
  const response = await withRetry(
    (signal) => openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are a JSON formatter. Return ONLY valid JSON with these fields: ${requiredFields.join(', ')}. No markdown, no extra text.`,
        },
        {
          role: 'user',
          content: `Fix and return valid JSON for a ${agentType} agent response.\nOriginal requirement: ${requirement}`,
        },
      ],
    }, { signal }),
    { label: `autoCorrect_${agentType}` }
  );
  return extractJSON(response.choices[0].message.content);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suffix JSON obrigatório adicionado ao final de cada SKILL.md
// Garante que o agente sempre retorne JSON puro, independente do conteúdo do SKILL
// ─────────────────────────────────────────────────────────────────────────────
const JSON_SUFFIX = `

---

## Instrução de formato (obrigatória)

CRÍTICO: Responda EXCLUSIVAMENTE com JSON válido. Sem blocos markdown (\`\`\`json), sem texto introdutório, sem texto de encerramento. Apenas o objeto JSON puro.`;

// ─────────────────────────────────────────────────────────────────────────────
// Analyst Agent
// ─────────────────────────────────────────────────────────────────────────────
export async function analystAgent(requirement, triggerType = 'feature') {
  try {
    console.log('🔍 Analyst Agent: Analyzing requirement...');

    const skillContent = await loadSkill('analyst-agent', triggerType);
    const requiredFields = [
      'user_stories', 'technical_requirements',
      'estimated_effort_hours', 'risks', 'acceptance_criteria',
    ];

    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: `Analise este requisito: ${requirement}` },
        ],
      }, { signal }),
      { label: 'analystAgent', timeoutMs: 120_000 }
    );

    logTokens('analystAgent', response.usage);
    let analysis = null;
    try { analysis = extractJSON(response.choices[0].message.content); } catch { /* fall through to autoCorrect */ }

    if (!analysis || !validateJSON(analysis, requiredFields)) {
      console.warn('⚠️ Analyst Agent: JSON inválido, tentando auto-correção...');
      analysis = await autoCorrectJSON(requirement, 'analyst', requiredFields);
      if (!validateJSON(analysis, requiredFields)) {
        throw new Error('Analyst Agent: falha ao gerar JSON válido após auto-correção');
      }
    }

    console.log('✅ Analyst Agent: JSON validado com sucesso');
    return analysis;
  } catch (error) {
    console.error('❌ Analyst Agent Error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Developer Agent
// ─────────────────────────────────────────────────────────────────────────────
export async function developerAgent(specification, triggerType = 'feature') {
  try {
    console.log('💻 Developer Agent: Generating code...');

    const skillContent = await loadSkill('developer-agent', triggerType);
    const requiredFields = ['files', 'code_quality_score', 'dependencies'];

    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.5,
        max_tokens: 2500,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: `Gere código para esta especificação: ${specification}` },
        ],
      }, { signal }),
      { label: 'developerAgent', timeoutMs: 120_000 }
    );

    logTokens('developerAgent', response.usage);
    let code = null;
    try { code = extractJSON(response.choices[0].message.content); } catch { /* fall through to autoCorrect */ }

    if (!code || !validateJSON(code, requiredFields)) {
      console.warn('⚠️ Developer Agent: JSON inválido, tentando auto-correção...');
      code = await autoCorrectJSON(specification, 'developer', requiredFields);
      if (!validateJSON(code, requiredFields)) {
        throw new Error('Developer Agent: falha ao gerar JSON válido após auto-correção');
      }
    }

    console.log('✅ Developer Agent: JSON validado com sucesso');
    return code;
  } catch (error) {
    console.error('❌ Developer Agent Error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QA Agent
// ─────────────────────────────────────────────────────────────────────────────
export async function qaAgent(code, triggerType = 'feature') {
  try {
    console.log('🧪 QA Agent: Testing and validating...');

    const skillContent = await loadSkill('qa-agent', triggerType);
    const requiredFields = [
      'test_cases', 'issues_found', 'coverage_percentage', 'approved', 'recommendations',
    ];

    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: `Teste e valide este código: ${code}` },
        ],
      }, { signal }),
      { label: 'qaAgent', timeoutMs: 120_000 }
    );

    logTokens('qaAgent', response.usage);
    let testResult = null;
    try { testResult = extractJSON(response.choices[0].message.content); } catch { /* fall through to autoCorrect */ }

    if (!testResult || !validateJSON(testResult, requiredFields)) {
      console.warn('⚠️ QA Agent: JSON inválido, tentando auto-correção...');
      testResult = await autoCorrectJSON(code, 'qa', requiredFields);
      if (!validateJSON(testResult, requiredFields)) {
        throw new Error('QA Agent: falha ao gerar JSON válido após auto-correção');
      }
    }

    console.log('✅ QA Agent: JSON validado com sucesso');
    return testResult;
  } catch (error) {
    console.error('❌ QA Agent Error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DevOps Agent
// ─────────────────────────────────────────────────────────────────────────────
export async function devopsAgent(code, triggerType = 'feature') {
  try {
    console.log('🚀 DevOps Agent: Planning deployment...');

    const skillContent = await loadSkill('devops-agent', triggerType);
    const requiredFields = [
      'deployment_steps', 'environment', 'health_checks',
      'rollback_plan', 'estimated_deployment_time_minutes', 'deployment_approved',
    ];

    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: `Planeje o deploy para este código: ${code}` },
        ],
      }, { signal }),
      { label: 'devopsAgent', timeoutMs: 120_000 }
    );

    logTokens('devopsAgent', response.usage);
    let deployment = null;
    try { deployment = extractJSON(response.choices[0].message.content); } catch { /* fall through to autoCorrect */ }

    if (!deployment || !validateJSON(deployment, requiredFields)) {
      console.warn('⚠️ DevOps Agent: JSON inválido, tentando auto-correção...');
      deployment = await autoCorrectJSON(code, 'devops', requiredFields);
      if (!validateJSON(deployment, requiredFields)) {
        throw new Error('DevOps Agent: falha ao gerar JSON válido após auto-correção');
      }
    }

    console.log('✅ DevOps Agent: JSON validado com sucesso');
    return deployment;
  } catch (error) {
    console.error('❌ DevOps Agent Error:', error.message);
    throw error;
  }
}

export default { analystAgent, developerAgent, qaAgent, devopsAgent };
