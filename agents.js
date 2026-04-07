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
    
    // Try to extract JSON object if wrapped in text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // Fix common JSON issues
    try {
      // Remove any trailing commas before closing braces/brackets
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      
      // Fix line breaks in strings (escape them properly) - BEFORE replacing newlines
      // This prevents breaking up multi-line strings
      cleaned = cleaned.replace(/([^\\])\n/g, '$1\\n');
      cleaned = cleaned.replace(/^\n/g, '\\n');
      
      return JSON.parse(cleaned);
    } catch (innerError) {
      // Advanced JSON repair: fix unterminated strings
      let fixedCleaned = cleaned;
      
      // Strategy 1: Find and close unterminated strings
      let inString = false;
      let escaped = false;
      let result = '';
      
      for (let i = 0; i < fixedCleaned.length; i++) {
        const char = fixedCleaned[i];
        const nextChar = fixedCleaned[i + 1];
        
        if (char === '\\' && !escaped) {
          escaped = true;
          result += char;
          continue;
        }
        
        if (char === '"' && !escaped) {
          inString = !inString;
        }
        
        result += char;
        escaped = false;
      }
      
      // If still in string at end, close it
      if (inString) {
        result += '"';
      }
      
      fixedCleaned = result;
      
      try {
        return JSON.parse(fixedCleaned);
      } catch (fixError) {
        // Strategy 2: Try removing problematic characters
        fixedCleaned = cleaned.replace(/[\x00-\x1F]/g, ' '); // Remove control characters
        
        try {
          return JSON.parse(fixedCleaned);
        } catch (fixError2) {
          console.error('❌ JSON extraction failed:', fixError2.message);
          console.error('❌ Attempted to parse:', fixedCleaned.substring(0, 200));
          throw new Error(`Failed to parse JSON: ${e.message}`);
        }
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
