import OpenAI from 'openai';
import { withRetry } from './retry.js';
import logger from './logger.js';

function logTokens(agent, usage) {
  if (!usage) return;
  logger.info('Token usage', { agent, prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens });
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Valida se um objeto JSON contém os campos obrigatórios
 * @param {object} data - Objeto a validar
 * @param {array} requiredFields - Campos obrigatórios
 * @returns {boolean} true se válido
 */
function validateJSON(data, requiredFields = []) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  for (const field of requiredFields) {
    if (!(field in data)) {
      console.warn(`⚠️ Missing required field: ${field}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Helper function to extract and parse JSON from LLM response
 * Handles cases where JSON is wrapped in markdown or text
 * Also fixes common JSON formatting issues
 */
function extractJSON(content) {
  try {
    // First, try direct parsing
    return JSON.parse(content);
  } catch (e) {
    let cleaned = content;
    
    // Remove markdown code blocks if present
    if (cleaned.includes('```json')) {
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/```\n?/g, '');
    }
    
    cleaned = cleaned.trim();
    
    // Strategy 1: Extract JSON object with balanced braces
    let jsonMatch = null;
    let braceCount = 0;
    let startIdx = -1;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      
      // Track escape sequences
      if (char === '\\' && !escaped) {
        escaped = true;
        continue;
      }
      
      // Track string state
      if (char === '"' && !escaped) {
        inString = !inString;
      }
      
      // Track braces only outside strings
      if (!inString) {
        if (char === '{') {
          if (startIdx === -1) startIdx = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && startIdx !== -1) {
            jsonMatch = cleaned.substring(startIdx, i + 1);
            break;
          }
        }
      }
      
      escaped = false;
    }
    
    if (jsonMatch) {
      cleaned = jsonMatch;
    }
    
    // Strategy 2: Fix common JSON issues
    try {
      // Remove trailing commas
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      
      // Fix unescaped newlines in strings
      cleaned = cleaned.replace(/([^\\])\n/g, '$1\\n');
      cleaned = cleaned.replace(/^\n/g, '\\n');
      
      // Remove control characters
      cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
      
      return JSON.parse(cleaned);
    } catch (innerError) {
      // Strategy 3: Close unterminated strings and braces
      let fixedCleaned = cleaned;
      let inStr = false;
      let esc = false;
      let braceStack = 0;
      let result = '';
      let lastValidJSON = null;
      
      for (let i = 0; i < fixedCleaned.length; i++) {
        const char = fixedCleaned[i];
        
        if (char === '\\' && !esc) {
          esc = true;
          result += char;
          continue;
        }
        
        if (char === '"' && !esc) {
          inStr = !inStr;
        }
        
        if (!inStr) {
          if (char === '{') braceStack++;
          if (char === '}') {
            braceStack--;
            // Save potential valid JSON at each closing brace
            if (braceStack === 0) {
              try {
                lastValidJSON = JSON.parse(result + char);
              } catch (e) {
                // Not valid yet
              }
            }
          }
        }
        
        result += char;
        esc = false;
      }
      
      // Close unterminated string
      if (inStr) {
        result += '"';
      }
      
      // Close unclosed braces
      while (braceStack > 0) {
        result += '}';
        braceStack--;
      }
      
      // Try to parse the fixed version
      try {
        return JSON.parse(result);
      } catch (fixError) {
        // If we found a valid JSON at some point, return that
        if (lastValidJSON) {
          return lastValidJSON;
        }
        
        // Strategy 4: Extract first valid complete object
        let attempts = [
          // Try to find any complete JSON object
          () => {
            let match = result.match(/{[^{}]*}/);
            return match ? JSON.parse(match[0]) : null;
          },
          // Try removing problematic characters
          () => {
            let cleaned = result.replace(/[^\x20-\x7E"{}\[\]:,]/g, '');
            return JSON.parse(cleaned);
          },
          // Try to extract from last valid closing brace
          () => {
            let lastBrace = result.lastIndexOf('}');
            if (lastBrace > 0) {
              let firstBrace = result.indexOf('{');
              if (firstBrace >= 0) {
                return JSON.parse(result.substring(firstBrace, lastBrace + 1));
              }
            }
            return null;
          }
        ];
        
        for (let attempt of attempts) {
          try {
            let result = attempt();
            if (result) return result;
          } catch (e) {
            // Continue to next attempt
          }
        }
        
        console.error('❌ JSON extraction failed:', fixError.message);
        console.error('❌ Attempted to parse:', result.substring(0, 300));
        throw new Error(`Failed to parse JSON: ${fixError.message}`);
      }
    }
  }
}

/**
 * Auto-corrige JSON malformado gerando uma nova requisição
 * @param {string} requirement - Requisição original
 * @param {string} agentType - Tipo de agente (analyst, developer, etc)
 * @param {array} requiredFields - Campos obrigatórios
 * @returns {object} JSON corrigido
 */
async function autoCorrectJSON(requirement, agentType, requiredFields = []) {
  console.log(`🔄 Auto-correcting JSON for ${agentType}...`);
  
  const correctionPrompt = `You MUST respond with ONLY valid JSON. No markdown, no explanations, no extra text.
  
The JSON MUST:
1. Be syntactically correct and parseable by JSON.parse()
2. Contain ALL these required fields: ${requiredFields.join(', ')}
3. Have NO trailing commas
4. Have NO unescaped newlines in strings
5. Have NO unclosed strings or braces
6. Have NO markdown code blocks

Original requirement: ${requirement}

Respond ONLY with the JSON object, nothing else.`;
  
  const response = await withRetry(
    (signal) => openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a JSON generator. Your ONLY job is to generate valid JSON that can be parsed.

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanations, no extra text whatsoever.`
        },
        {
          role: 'user',
          content: correctionPrompt
        }
      ]
    }, { signal }),
    { label: 'autoCorrectJSON' }
  );
  logTokens('autoCorrectJSON', response.usage);
  const content = response.choices[0].message.content;
  return extractJSON(content);
}

// Analyst Agent - Analyzes requirements and creates specifications
export async function analystAgent(requirement) {
  try {
    console.log('🔍 Analyst Agent: Analyzing requirement...');
    
    const requiredFields = ['user_stories', 'technical_requirements', 'estimated_effort_hours', 'risks', 'acceptance_criteria'];
    
    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          {
            role: 'system',
            content: `You are a senior software analyst. Your job is to analyze requirements and create detailed technical specifications.

CRITICAL: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.

Respond in JSON format with the following structure:
{
  "user_stories": ["story1", "story2", "story3"],
  "technical_requirements": ["req1", "req2", "req3"],
  "estimated_effort_hours": 40,
  "risks": ["risk1", "risk2"],
  "acceptance_criteria": ["criteria1", "criteria2"]
}`
          },
          {
            role: 'user',
            content: `Analyze this requirement: ${requirement}`
          }
        ]
      }, { signal }),
      { label: 'analystAgent' }
    );
    logTokens('analystAgent', response.usage);
    let analysis = extractJSON(response.choices[0].message.content);
    
    // Validar JSON
    if (!validateJSON(analysis, requiredFields)) {
      console.warn('⚠️ Analyst Agent: JSON validation failed, attempting auto-correction...');
      analysis = await autoCorrectJSON(requirement, 'analyst', requiredFields);
      
      // Validar novamente
      if (!validateJSON(analysis, requiredFields)) {
        throw new Error('Analyst Agent: Failed to generate valid JSON after auto-correction');
      }
    }
    
    console.log('✅ Analyst Agent: JSON validated successfully');
    return analysis;
  } catch (error) {
    console.error('❌ Analyst Agent Error:', error.message);
    throw error;
  }
}

// Developer Agent - Generates code based on specifications
export async function developerAgent(specification) {
  try {
    console.log('💻 Developer Agent: Generating code...');
    
    const requiredFields = ['code', 'language', 'functions', 'dependencies', 'code_quality_score'];
    
    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.5,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: `You are a senior software developer. Your job is to write clean, well-structured code.

CRITICAL: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.

Respond in JSON format with the following structure:
{
  "code": "function example() { return 'hello'; }",
  "language": "javascript",
  "functions": ["function1", "function2"],
  "dependencies": ["dep1", "dep2"],
  "code_quality_score": 85
}`
          },
          {
            role: 'user',
            content: `Generate code for this specification: ${specification}`
          }
        ]
      }, { signal }),
      { label: 'developerAgent' }
    );
    logTokens('developerAgent', response.usage);
    let code = extractJSON(response.choices[0].message.content);
    
    // Validar JSON
    if (!validateJSON(code, requiredFields)) {
      console.warn('⚠️ Developer Agent: JSON validation failed, attempting auto-correction...');
      code = await autoCorrectJSON(specification, 'developer', requiredFields);
      
      // Validar novamente
      if (!validateJSON(code, requiredFields)) {
        throw new Error('Developer Agent: Failed to generate valid JSON after auto-correction');
      }
    }
    
    console.log('✅ Developer Agent: JSON validated successfully');
    return code;
  } catch (error) {
    console.error('❌ Developer Agent Error:', error.message);
    throw error;
  }
}

// QA Agent - Tests and validates code
export async function qaAgent(code) {
  try {
    console.log('🧪 QA Agent: Testing and validating...');
    
    const requiredFields = ['test_cases', 'issues_found', 'coverage_percentage', 'approved', 'recommendations'];
    
    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          {
            role: 'system',
            content: `You are a QA engineer. Your job is to test code and identify issues.

CRITICAL: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.

Respond in JSON format with the following structure:
{
  "test_cases": ["test1", "test2"],
  "issues_found": ["issue1"],
  "coverage_percentage": 85,
  "approved": true,
  "recommendations": ["rec1"]
}`
          },
          {
            role: 'user',
            content: `Test and validate this code: ${code}`
          }
        ]
      }, { signal }),
      { label: 'qaAgent' }
    );
    logTokens('qaAgent', response.usage);
    let testResult = extractJSON(response.choices[0].message.content);
    
    // Validar JSON
    if (!validateJSON(testResult, requiredFields)) {
      console.warn('⚠️ QA Agent: JSON validation failed, attempting auto-correction...');
      testResult = await autoCorrectJSON(code, 'qa', requiredFields);
      
      // Validar novamente
      if (!validateJSON(testResult, requiredFields)) {
        throw new Error('QA Agent: Failed to generate valid JSON after auto-correction');
      }
    }
    
    console.log('✅ QA Agent: JSON validated successfully');
    return testResult;
  } catch (error) {
    console.error('❌ QA Agent Error:', error.message);
    throw error;
  }
}

// DevOps Agent - Plans and executes deployment
export async function devopsAgent(code) {
  try {
    console.log('🚀 DevOps Agent: Planning deployment...');
    
    const requiredFields = ['deployment_steps', 'environment', 'health_checks', 'rollback_plan', 'estimated_deployment_time_minutes', 'deployment_approved'];
    
    const response = await withRetry(
      (signal) => openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          {
            role: 'system',
            content: `You are a DevOps engineer. Your job is to plan and execute deployments.

CRITICAL: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.

Respond in JSON format with the following structure:
{
  "deployment_steps": ["step1", "step2"],
  "environment": "production",
  "health_checks": ["check1"],
  "rollback_plan": "description",
  "estimated_deployment_time_minutes": 15,
  "deployment_approved": true
}`
          },
          {
            role: 'user',
            content: `Plan deployment for this code: ${code}`
          }
        ]
      }, { signal }),
      { label: 'devopsAgent' }
    );
    logTokens('devopsAgent', response.usage);
    let deployment = extractJSON(response.choices[0].message.content);
    
    // Validar JSON
    if (!validateJSON(deployment, requiredFields)) {
      console.warn('⚠️ DevOps Agent: JSON validation failed, attempting auto-correction...');
      deployment = await autoCorrectJSON(code, 'devops', requiredFields);
      
      // Validar novamente
      if (!validateJSON(deployment, requiredFields)) {
        throw new Error('DevOps Agent: Failed to generate valid JSON after auto-correction');
      }
    }
    
    console.log('✅ DevOps Agent: JSON validated successfully');
    return deployment;
  } catch (error) {
    console.error('❌ DevOps Agent Error:', error.message);
    throw error;
  }
}

export default {
  analystAgent,
  developerAgent,
  qaAgent,
  devopsAgent
};
