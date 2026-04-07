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
      
      // Fix line breaks in strings (escape them properly)
      cleaned = cleaned.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      
      return JSON.parse(cleaned);
    } catch (innerError) {
      // Last resort: try to fix unterminated strings
      // Find the position of the error and try to fix it
      const errorMatch = e.message.match(/position (\d+)/);
      if (errorMatch) {
        const pos = parseInt(errorMatch[1]);
        // Try to find and fix the unterminated string
        let fixedCleaned = cleaned;
        
        // Look for strings that might be unterminated
        const stringRegex = /"(?:[^"\\]|\\.)*(?:"|\n|$)/g;
        let match;
        let lastPos = 0;
        
        while ((match = stringRegex.exec(fixedCleaned)) !== null) {
          if (match[0].endsWith('\n') || match[0].endsWith('$')) {
            // This string is unterminated, add closing quote
            fixedCleaned = fixedCleaned.substring(0, match.index + match[0].length - 1) + 
                          '"' + 
                          fixedCleaned.substring(match.index + match[0].length);
            break;
          }
        }
        
        try {
          return JSON.parse(fixedCleaned);
        } catch (fixError) {
          console.error('❌ JSON extraction failed:', fixError.message);
          throw new Error(`Failed to parse JSON: ${e.message}`);
        }
      }
      
      throw e;
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
