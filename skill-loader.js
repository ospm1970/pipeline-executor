/**
 * skill-loader.js
 *
 * Carrega e compõe o system prompt de cada agente a partir da estrutura real do projeto:
 *
 *   skills/{agent}/SKILL.md              — prompt base (obrigatório)
 *   skills/{agent}/references/*.md       — referências técnicas (já existem: api_reference.md)
 *   skills/{agent}/context/*.md          — contexto Casarcom (a criar na Fase 3)
 *   skills/{agent}/migration/*.md        — guias PHP→NestJS (a criar na Fase 3)
 *   skills/{agent}/checklists/*.md       — checklists por tipo (a criar na Fase 3)
 *
 * Tipos de acionamento (triggerType):
 *   'feature'     — nova feature (padrão)
 *   'improvement' — melhoria incremental
 *   'bugfix'      — correção de bug
 *   'refactor'    — refatoração
 *   'migration'   — migração PHP → NestJS (carrega subdir migration/ quando disponível)
 *
 * Uso:
 *   import { loadSkill, loadAllSkills } from './skill-loader.js';
 *
 *   // Agentes com classe própria (spec, ui-ux, documenter):
 *   const prompt = await loadSkill('spec-agent');
 *
 *   // Pré-carregar todos no início do pipeline:
 *   const skills = await loadAllSkills('migration');
 *   skills.get('developer-agent'); // → string composta
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, 'skills');

// Cache em memória para evitar releituras durante uma mesma execução
const _cache = new Map();

/**
 * Verifica se um caminho existe sem lançar exceção.
 */
async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Lê todos os arquivos .md de um subdiretório (não recursivo), em ordem alfabética.
 * Retorna string vazia se o diretório não existir — nunca lança erro.
 */
async function readDirMarkdown(dirPath) {
  if (!(await exists(dirPath))) return '';
  try {
    const entries = await readdir(dirPath);
    const mdFiles = entries.filter(f => f.endsWith('.md')).sort();
    if (mdFiles.length === 0) return '';
    const contents = await Promise.all(
      mdFiles.map(f => readFile(join(dirPath, f), 'utf-8'))
    );
    return contents.join('\n\n---\n\n');
  } catch {
    return '';
  }
}

/**
 * Carrega e compõe o system prompt completo de um agente.
 *
 * @param {string} agentName   — ex: 'spec-agent', 'qa-agent', 'developer-agent'
 * @param {string} triggerType — 'feature' | 'improvement' | 'bugfix' | 'refactor' | 'migration'
 * @param {boolean} useCache   — usa cache em memória (padrão: true)
 * @returns {Promise<string>}  — prompt composto pronto para uso como system message
 */
export async function loadSkill(agentName, triggerType = 'feature', useCache = true) {
  const cacheKey = `${agentName}::${triggerType}`;
  if (useCache && _cache.has(cacheKey)) return _cache.get(cacheKey);

  const agentDir = join(SKILLS_DIR, agentName);

  // 1. Prompt base — obrigatório
  const skillPath = join(agentDir, 'SKILL.md');
  if (!(await exists(skillPath))) {
    throw new Error(
      `[skill-loader] SKILL.md não encontrado para "${agentName}" em: ${skillPath}`
    );
  }
  const basePrompt = await readFile(skillPath, 'utf-8');

  // 2. Referências técnicas — já existem (api_reference.md) para a maioria dos agentes
  const referencesContent = await readDirMarkdown(join(agentDir, 'references'));

  // 3. Contexto Casarcom — a ser criado na Fase 3
  //    (domínio de eventos, jornadas de casamento, fluxos críticos)
  const contextContent = await readDirMarkdown(join(agentDir, 'context'));

  // 4. Conteúdo condicional por tipo de acionamento
  //    migration/ carrega guias PHP→NestJS; outros triggerTypes podem ter subdir próprio futuramente
  let triggerContent = '';
  if (triggerType === 'migration') {
    triggerContent = await readDirMarkdown(join(agentDir, 'migration'));
  }

  // 5. Checklists obrigatórios — a ser criado na Fase 3
  //    (qa-agent: checklist por tipo de entrega; security-agent: Privacy/Security by Design)
  const checklistContent = await readDirMarkdown(join(agentDir, 'checklists'));

  // Composição final — seções ausentes não geram ruído no prompt
  const sections = [
    basePrompt,
    referencesContent && `\n\n## Referências técnicas\n\n${referencesContent}`,
    contextContent    && `\n\n## Contexto Casarcom\n\n${contextContent}`,
    triggerContent    && `\n\n## Diretrizes para migração PHP → NestJS\n\n${triggerContent}`,
    checklistContent  && `\n\n## Checklists obrigatórios\n\n${checklistContent}`,
  ].filter(Boolean);

  const composed = sections.join('');
  if (useCache) _cache.set(cacheKey, composed);
  return composed;
}

/**
 * Pré-carrega todos os agentes em paralelo.
 * Agentes ainda não criados (ex: security-agent) emitem warn e são ignorados.
 *
 * @param {string} triggerType
 * @returns {Promise<Map<string, string>>} map agentName → prompt composto
 */
export async function loadAllSkills(triggerType = 'feature') {
  const agentNames = [
    'spec-agent',
    'analyst-agent',
    'ui-ux-agent',
    'developer-agent',
    'qa-agent',
    'security-agent',   // ainda não existe — será ignorado com warn
    'devops-agent',
    'documenter-agent',
  ];

  const results = await Promise.allSettled(
    agentNames.map(async name => [name, await loadSkill(name, triggerType)])
  );

  const skills = new Map();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const [name, prompt] = result.value;
      skills.set(name, prompt);
    } else {
      // Não bloqueia — agentes ausentes (security-agent na Fase 3) são silenciosos
      console.warn('[skill-loader]', result.reason?.message);
    }
  }

  return skills;
}

/**
 * Limpa o cache em memória.
 * Útil em testes ou quando os arquivos SKILL.md são editados em runtime.
 */
export function clearSkillCache() {
  _cache.clear();
}
