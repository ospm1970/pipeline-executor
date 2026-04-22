import { withRetry } from './retry.js';
import logger from './logger.js';
import { loadSkill } from './skill-loader.js';
import { getOpenAIClient } from './openai-client.js';

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

function ensureArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return fallback;
  return [value];
}

function estimateEffortHours(analysis) {
  const storyCount = ensureArray(analysis?.user_stories).length;
  const requirementCount = ensureArray(analysis?.technical_requirements).length;
  const riskCount = ensureArray(analysis?.risks).length;
  return Math.max(4, (storyCount * 4) + (requirementCount * 2) + riskCount);
}

function normalizeAnalystOutput(analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  return {
    ...analysis,
    user_stories: ensureArray(analysis.user_stories),
    technical_requirements: ensureArray(analysis.technical_requirements),
    risks: ensureArray(analysis.risks),
    acceptance_criteria: ensureArray(analysis.acceptance_criteria),
    estimated_effort_hours: Number.isFinite(Number(analysis.estimated_effort_hours))
      ? Number(analysis.estimated_effort_hours)
      : estimateEffortHours(analysis),
  };
}

function normalizeDevopsOutput(deployment) {
  if (!deployment || typeof deployment !== 'object') return deployment;
  return {
    ...deployment,
    deployment_steps: ensureArray(deployment.deployment_steps, ['Revisar e executar o plano de deploy manualmente']),
    health_checks: ensureArray(deployment.health_checks, ['Validar health check principal da aplicação']),
    rollback_plan: ensureArray(deployment.rollback_plan, ['Executar rollback para a última versão estável']),
    environment: deployment.environment || 'development',
    estimated_deployment_time_minutes: Number.isFinite(Number(deployment.estimated_deployment_time_minutes))
      ? Number(deployment.estimated_deployment_time_minutes)
      : 30,
    deployment_approved: deployment.deployment_approved === true,
  };
}

function parseDeveloperSpecification(specification) {
  if (!specification) return null;
  if (typeof specification === 'object') return specification;
  if (typeof specification !== 'string') return null;
  try {
    return JSON.parse(specification);
  } catch {
    return null;
  }
}

export function buildDeveloperPrompt(specification, triggerType = 'feature') {
  const parsedSpec = parseDeveloperSpecification(specification);
  const repositoryContext = parsedSpec?.repositoryContext || null;
  const analysis = parsedSpec?.analysis || parsedSpec;
  const retryContext = parsedSpec?.retry_context || null;
  const previousFiles = ensureArray(parsedSpec?.previous_files);
  const blockingIssues = ensureArray(parsedSpec?.blocking_issues || retryContext?.review_blocking_issues);
  const warnings = ensureArray(parsedSpec?.warnings || retryContext?.review_warnings);
  const instruction = parsedSpec?.instruction || null;
  const stackConstraints = repositoryContext?.stackConstraints || {};
  const isExpress = repositoryContext?.projectType === 'nodejs-express';
  const isSmallRepo = Number(repositoryContext?.fileCount || 0) > 0 && Number(repositoryContext.fileCount) <= 20;
  const isIncremental = triggerType === 'feature' || triggerType === 'bugfix' || triggerType === 'refactor';
  const isQARetry = retryContext?.source_stage === 'qa';

  const rules = [
    'Responda exclusivamente com JSON válido e completo no schema esperado.',
    'Gere código com conteúdo real em todos os arquivos; não retorne placeholders, TODOs ou arquivos vazios.',
    'Siga rigorosamente a stack detectada do repositório quando ela for informada no contexto.',
  ];

  if (isExpress) {
    rules.push('O repositório alvo é nodejs-express. Use apenas padrões compatíveis com Express, middlewares, routers, services utilitários e bibliotecas já coerentes com esse ecossistema.');
    rules.push('Não gere módulos, decorators, pipes, guards, exceptions, DTOs ou estrutura típica de NestJS, exceto se o triggerType for migration e houver justificativa arquitetural explícita.');
    rules.push('Não gere arquivos .tsx/.jsx, pastas frontend/components nem qualquer camada React para este projeto, exceto em migração explícita devidamente justificada.');
    rules.push('Se receber issues de stack no contexto, trate-as como bloqueantes e remova da resposta qualquer arquivo incompatível em vez de mantê-lo com pequenas adaptações.');
  }

  if (isIncremental) {
    rules.push('Trate esta entrega como mudança incremental compatível: preserve convenções, dependências, nomes, organização e contratos já existentes.');
    rules.push('Prefira a menor alteração viável que satisfaça o requisito, evitando criar camadas, pastas ou componentes não necessários.');
  }

  if (isSmallRepo) {
    rules.push('O repositório é pequeno. Minimize o número de novos arquivos e preserve ao máximo o padrão existente antes de introduzir nova arquitetura.');
  }

  if (stackConstraints?.allowCrossStackGenerationOnlyForMigration) {
    rules.push('Qualquer expansão arquitetural fora da stack detectada só é aceitável em migração explícita.');
  }

  if (isQARetry) {
    rules.push('Esta é uma iteração de retrabalho após bloqueio do QA; trate o feedback recebido como prioritário e obrigatório.');
    rules.push('Corrija explicitamente as issues altas/críticas reportadas, tente recuperar a cobertura para pelo menos o baseline real quando houver baseline e ajuste ou crie testes automatizados suficientes para aprovação no próximo ciclo.');
    rules.push('Se ainda restar pequena regressão de cobertura após o retry, mantenha a mudança mínima compatível e priorize a eliminação de issues bloqueantes; o gateway pode tolerar até 2 pontos percentuais abaixo do baseline como warning, mas isso não elimina a obrigação de melhorar os testes sempre que viável.');
    rules.push('Não reinvente a solução do zero sem necessidade: preserve os arquivos anteriores e altere apenas o necessário para resolver o bloqueio do QA e manter compatibilidade com a stack detectada.');
  }

  rules.push('Se for realmente inevitável introduzir nova dependência, nova camada ou nova arquitetura, explique de forma explícita no início de implementation_summary com o prefixo exato: "Justificativa arquitetural:".');
  rules.push('Liste em dependencies apenas dependências realmente necessárias e compatíveis com o projeto alvo.');

  const contextPayload = {
    analysis,
    repositoryContext,
    retry_context: retryContext || undefined,
    previous_files: previousFiles.length > 0 ? previousFiles : undefined,
    blocking_issues: blockingIssues.length > 0 ? blockingIssues : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    instruction: instruction || undefined,
  };

  const retryGuidance = isQARetry
    ? [
        '## Contexto obrigatório de retrabalho QA → Developer',
        `- Origem do bloqueio: ${retryContext.source_stage}`,
        `- Iteração de retrabalho: ${retryContext.iteration || 'N/A'}`,
        `- Motivo do bloqueio do QA: ${retryContext.qa_gateway_reason || 'não informado'}`,
        `- Cobertura medida: ${retryContext.measured_coverage ?? 'N/A'}%`,
        `- Cobertura baseline: ${retryContext.baseline_coverage ?? 'N/A'}%`,
        `- Delta de cobertura: ${retryContext.coverage_delta ?? 'N/A'}`,
        `- Houve regressão de cobertura: ${retryContext.coverage_regression === true ? 'sim' : 'não'}`,
        `- Política atual de retry: após o primeiro retry, regressão de até -2% do baseline pode seguir como warning, sem dispensar melhoria de testes quando viável`,
        `- Issues do QA: ${ensureArray(retryContext.qa_issues_found).length > 0 ? JSON.stringify(retryContext.qa_issues_found) : 'nenhuma informada'}`,
        `- Recomendações do QA: ${ensureArray(retryContext.qa_recommendations).length > 0 ? JSON.stringify(retryContext.qa_recommendations) : 'nenhuma informada'}`,
        `- Arquivos anteriores a revisar: ${previousFiles.length > 0 ? JSON.stringify(previousFiles) : 'nenhum informado'}`,
        instruction ? `- Instrução adicional obrigatória: ${instruction}` : null,
        retryContext?.iteration > 1 ? '- Aplique a menor correção compatível que elimine bloqueios reais; se a única diferença remanescente for regressão de cobertura dentro da tolerância de -2%, trate como warning residual e siga reforçando os testes.' : null,
        '',
      ].filter(Boolean)
    : [];

  return [
    'Gere código para a especificação abaixo.',
    '',
    '## Regras obrigatórias de implementação',
    ...rules.map(rule => `- ${rule}`),
    '',
    ...retryGuidance,
    '## Contexto recebido',
    JSON.stringify(contextPayload, null, 2),
  ].join('\n');
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

async function autoCorrectJSON(requirement, agentType, requiredFields, maxTokens = 4000) {
  const response = await withRetry(
    (signal) => getOpenAIClient('Este agente').chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      max_tokens: maxTokens,
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
  try { return extractJSON(response.choices[0].message.content); } catch {
    throw new Error('Could not extract valid JSON from response');
  }
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
      (signal) => getOpenAIClient('Este agente').chat.completions.create({
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
    try { analysis = normalizeAnalystOutput(extractJSON(response.choices[0].message.content)); } catch { /* fall through to autoCorrect */ }

    if (!analysis || !validateJSON(analysis, requiredFields)) {
      console.warn('⚠️ Analyst Agent: JSON inválido, tentando auto-correção...');
      analysis = normalizeAnalystOutput(await autoCorrectJSON(requirement, 'analyst', requiredFields));
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

    const developerPrompt = buildDeveloperPrompt(specification, triggerType);

    const response = await withRetry(
      (signal) => getOpenAIClient('Este agente').chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 16000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: developerPrompt },
        ],
      }, { signal }),
      { label: 'developerAgent', timeoutMs: 120_000 }
    );

    logTokens('developerAgent', response.usage);
    let code = null;
    try { code = extractJSON(response.choices[0].message.content); } catch { /* fall through to autoCorrect */ }

    // Detectar schema inválido: files como array de strings (sem content) ou com content vazio
    if (code && Array.isArray(code.files)) {
      const hasStringFiles = code.files.some(f => typeof f === 'string');
      const hasEmptyContent = code.files.some(f => typeof f === 'object' && (!f.content || f.content.trim() === ''));
      if (hasStringFiles || hasEmptyContent || code.files.length === 0) {
        console.warn('⚠️ Developer Agent: files[] sem conteúdo real — forçando auto-correção');
        code = null;
      }
    }

    if (!code || !validateJSON(code, requiredFields)) {
      console.warn('⚠️ Developer Agent: JSON inválido, tentando auto-correção...');
      code = await autoCorrectJSON(specification, 'developer', requiredFields, 16000);
      if (!validateJSON(code, requiredFields)) {
        throw new Error('Developer Agent: falha ao gerar JSON válido após auto-correção');
      }
    }

    // Validação final: garantir que há ao menos um arquivo com conteúdo real
    if (!Array.isArray(code.files) || code.files.length === 0 ||
        code.files.every(f => typeof f === 'string' || !f.content || f.content.trim() === '')) {
      throw new Error('Developer Agent: nenhum arquivo com conteúdo gerado — verifique o SKILL.md do developer-agent');
    }

    console.log(`✅ Developer Agent: ${code.files.length} arquivo(s) gerado(s)`);
    return code;
  } catch (error) {
    console.error('❌ Developer Agent Error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QA Agent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formata as evidências reais do QARunner como seção de texto para o prompt.
 * @param {object} runnerResults
 * @returns {string}
 */
function buildRunnerSection(runnerResults) {
  if (!runnerResults) return '';
  const lines = ['## Evidências reais de execução (QA Runner)\n'];

  lines.push(`**Framework detectado:** ${runnerResults.framework || 'não detectado'}`);

  if (runnerResults.errors?.length > 0) {
    lines.push(`**Erros de execução:** ${runnerResults.errors.join('; ')}`);
  }

    if (!runnerResults.ran) {
      lines.push('**Status:** testes não foram executados ou não geraram evidência real suficiente.');
      lines.push('');
      lines.push('**INSTRUÇÃO IMPORTANTE:** Sem evidência real de execução, o QA deve tratar a entrega como não aprovada.');
      lines.push('Registre explicitamente a ausência de evidência real em `issues_found` e recomende a configuração do framework');
      lines.push('ou da cobertura antes de liberar o gateway. Não estime cobertura como suficiente para aprovação.');
      return lines.join('\n');
    }


  if (runnerResults.testResults) {
    const tr = runnerResults.testResults;
    const status = tr.success ? '✅ passou' : '❌ falhou';
    lines.push(`**Resultado dos testes:** ${status} — ${tr.passed ?? 0} passaram, ${tr.failed ?? 0} falharam, ${tr.pending ?? 0} pendentes (total: ${tr.total ?? 0}, suites: ${tr.suites ?? 0})`);
  }

  if (runnerResults.coverage) {
    const c = runnerResults.coverage;
    lines.push(`**Cobertura real medida:**`);
    lines.push(`  - Linhas: ${c.lines}%`);
    lines.push(`  - Funções: ${c.functions}%`);
    lines.push(`  - Branches: ${c.branches}%`);
    lines.push(`  - Statements: ${c.statements}%`);
  } else {
    lines.push('**Cobertura:** não foi possível coletar (coverage reporter não configurado ou testes falharam antes)');
  }

  if (runnerResults.baseline) {
    lines.push(`**Cobertura baseline (repo antes das mudanças):** ${runnerResults.baseline.overall}%`);
  }

  if (runnerResults.coverageRegression) {
    lines.push(`**⚠️ REGRESSÃO DE COBERTURA DETECTADA:** cobertura caiu ${Math.abs(runnerResults.coverageDelta ?? 0).toFixed(1)}% abaixo do baseline`);
  } else if (runnerResults.coverageDelta !== null && runnerResults.coverageDelta !== undefined) {
    const sign = runnerResults.coverageDelta >= 0 ? '+' : '';
    lines.push(`**Delta de cobertura:** ${sign}${runnerResults.coverageDelta}%`);
  }

  if (runnerResults.lintResults?.ran) {
    const lr = runnerResults.lintResults;
    const status = lr.errors === 0 ? '✅ sem erros' : `❌ ${lr.errors} erros`;
    lines.push(`**Lint (ESLint):** ${status}, ${lr.warnings} avisos em ${lr.files} arquivos`);
  }

  return lines.join('\n');
}

export function buildQAStackGuidance(repositoryContext = {}, triggerType = 'feature') {
  const stackProfile = repositoryContext?.stackProfile || {};
  const backendFramework = stackProfile.backendFramework || 'none';
  const frontendFramework = stackProfile.frontendFramework || 'none';
  const frontendType = stackProfile.frontendType || 'none';
  const repoShape = stackProfile.repoShape || 'single-app';
  const rules = [
    'Avalie a entrega de QA de acordo com a stack detectada no repositório alvo e com as evidências reais de execução disponíveis.',
    'Não trate ausência de testes de outra stack como falha automática quando o repositório não usar essa stack.',
  ];

  if (backendFramework === 'express' || repositoryContext?.projectType === 'nodejs-express') {
    rules.push('Para backend Express/API, priorize testes unitários e de integração de endpoints, middlewares, validação, integrações externas e tratamento de erro. Não trate ausência de testes de componentes React como bloqueio quando não houver frontend reativo detectado.');
  }

  if (backendFramework === 'nestjs') {
    rules.push('Para backend NestJS, considere controllers, services, módulos, providers e testes de integração de endpoints como evidência natural da stack.');
  }

  if (frontendType === 'none') {
    rules.push('Nenhum frontend foi detectado. Não cobre testes de interface ou browser como obrigatórios, salvo quando a mudança efetivamente introduzir uma interface visual nova.');
  }

  if (frontendType === 'static-web') {
    rules.push('O frontend detectado é estático. Prefira validar fluxos HTML, assets, scripts progressivos e integração com backend; não bloqueie por ausência de testes de componente SPA.');
  }

  if (frontendType === 'spa' || frontendFramework === 'react') {
    rules.push('O frontend detectado é SPA/React. Quando a mudança tocar fluxos críticos de interface, considere testes de componente, comportamento e integração visual como expectativa relevante.');
  }

  if (frontendFramework === 'nextjs' || frontendType === 'ssr-web') {
    rules.push('O frontend detectado usa Next.js/SSR. Avalie páginas, rotas, rendering server-side e handlers do framework com critérios compatíveis, sem exigir convenções de backend separadas inexistentes.');
  }

  if (repoShape === 'monorepo') {
    rules.push('O repositório é um monorepo. Avalie cobertura e impacto no pacote ou app alterado, evitando conclusões globais sobre workspaces não tocados pela entrega.');
  }

  if (triggerType === 'feature' || triggerType === 'bugfix' || triggerType === 'refactor') {
    rules.push('Para mudanças incrementais, compare a necessidade de novos testes com o escopo real do diff e com a baseline de cobertura existente.');
  }

  return `## Regras mínimas de QA por stack\n\n${rules.map(rule => `- ${rule}`).join('\n')}`;
}

/**
 * QA Agent — analisa e valida o código gerado.
 *
 * @param {string|object} input
 *   - string: código como texto (legacy)
 *   - object: { code: string, runnerResults: object, repositoryContext: object }
 * @param {string} triggerType
 */
export async function qaAgent(input, triggerType = 'feature') {
  try {
    console.log('🧪 QA Agent: Testing and validating...');

    let codeSection, runnerResults, repositoryContext;
    if (typeof input === 'string') {
      codeSection = input;
    } else {
      codeSection = input?.code ?? JSON.stringify(input);
      runnerResults = input?.runnerResults ?? null;
      repositoryContext = input?.repositoryContext ?? null;
    }

    const skillContent = await loadSkill('qa-agent', triggerType);
    const requiredFields = [
      'test_cases', 'issues_found', 'coverage_percentage', 'approved', 'recommendations',
    ];

    const runnerSection = buildRunnerSection(runnerResults);
    const stackGuidance = repositoryContext ? buildQAStackGuidance(repositoryContext, triggerType) : '';
    const repositorySection = repositoryContext
      ? `## Contexto do repositório alvo\n\n${JSON.stringify(repositoryContext, null, 2)}`
      : '';
    const contextualSections = [stackGuidance, repositorySection].filter(Boolean).join('\n\n---\n\n');
    const codeBlock = `## Código submetido\n\n${codeSection}`;
    const userContent = [runnerSection, contextualSections, codeBlock].filter(Boolean).join('\n\n---\n\n');

    const response = await withRetry(
      (signal) => getOpenAIClient('Este agente').chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 3000,
        messages: [
          { role: 'system', content: skillContent + JSON_SUFFIX },
          { role: 'user', content: userContent },
        ],
      }, { signal }),
      { label: 'qaAgent', timeoutMs: 120_000 }
    );

    logTokens('qaAgent', response.usage);
    let testResult = null;
    try { testResult = extractJSON(response.choices[0].message.content); } catch { /* fall through to autoCorrect */ }

    if (!testResult || !validateJSON(testResult, requiredFields)) {
      console.warn('⚠️ QA Agent: JSON inválido, tentando auto-correção...');
      testResult = await autoCorrectJSON(userContent, 'qa', requiredFields);
      if (!validateJSON(testResult, requiredFields)) {
        throw new Error('QA Agent: falha ao gerar JSON válido após auto-correção');
      }
    }

    // Se o runner coletou cobertura real, substituir o valor estimado pelo LLM
    if (runnerResults?.coverage?.overall !== undefined) {
      testResult.coverage_percentage = runnerResults.coverage.overall;
      testResult.coverage_real = runnerResults.coverage;
      testResult.coverage_baseline = runnerResults.baseline ?? null;
      testResult.coverage_regression = runnerResults.coverageRegression ?? false;
      testResult.coverage_delta = runnerResults.coverageDelta ?? null;
    }

    testResult.evidence_real = runnerResults?.ran === true && !!runnerResults?.testResults;
    if (runnerResults?.ran === false) {
      testResult.approved = false;
      testResult.coverage_percentage = runnerResults?.coverage?.overall ?? 0;
      testResult.issues_found = ensureArray(testResult.issues_found);
      testResult.issues_found.push('Sem evidência real de execução de testes e cobertura');
    }

    if (runnerResults?.testResults) {
      testResult.test_execution = runnerResults.testResults;
    }

    if (runnerResults?.lintResults) {
      testResult.lint_results = runnerResults.lintResults;
    }

    console.log(`✅ QA Agent: JSON validado — cobertura: ${testResult.coverage_percentage}%, aprovado: ${testResult.approved}`);
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
      (signal) => getOpenAIClient('Este agente').chat.completions.create({
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
    try { deployment = normalizeDevopsOutput(extractJSON(response.choices[0].message.content)); } catch { /* fall through to autoCorrect */ }

    if (!deployment || !validateJSON(deployment, requiredFields)) {
      console.warn('⚠️ DevOps Agent: JSON inválido, tentando auto-correção...');
      deployment = normalizeDevopsOutput(await autoCorrectJSON(code, 'devops', requiredFields));
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

export default { analystAgent, developerAgent, qaAgent, devopsAgent, buildDeveloperPrompt };
