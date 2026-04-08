import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Analyst Agent - Analyzes requirements and creates specifications
export async function analystAgent(requirement) {
  try {
    console.log('🔍 Analyst Agent: Analyzing requirement...');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are a senior software analyst. Your job is to analyze requirements and create detailed technical specifications.
          
          IMPORTANT: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.
          
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
    });

    const content = response.choices[0].message.content;
    const analysis = extractJSON(content);
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
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.5,
      max_tokens: 2500,
      messages: [
        {
          role: 'system',
          content: `You are a senior software developer. Your job is to write clean, well-structured code.
          
          IMPORTANT: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.
          
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
    });

    const content = response.choices[0].message.content;
    const code = extractJSON(content);
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
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are a QA engineer. Your job is to test code and identify issues.
          
          IMPORTANT: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.
          
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
    });

    const content = response.choices[0].message.content;
    const testResult = extractJSON(content);
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
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are a DevOps engineer. Your job is to plan and execute deployments.
          
          IMPORTANT: Always respond with VALID JSON only. No markdown code blocks, no extra text, just pure JSON.
          
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
    });

    const content = response.choices[0].message.content;
    const deployment = extractJSON(content);
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
