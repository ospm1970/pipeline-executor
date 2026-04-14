import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { withRetry } from './retry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class SpecAgentWithSkill {
  constructor() {
    this.skillContent = this.loadSkill();
  }

  loadSkill() {
    try {
      const skillPath = path.join(__dirname, 'skills', 'spec-agent', 'SKILL.md');
      return fs.readFileSync(skillPath, 'utf8');
    } catch (error) {
      console.warn('⚠️ Spec Agent skill file not found. Using fallback behavior.');
      return `You are a Spec-Driven Development expert. Create a detailed specification from the requirement.`;
    }
  }

  async generateSpecification(requirement) {
    try {
      console.log('📝 Spec Agent: Generating specification...');
      
      const response = await withRetry(
        (signal) => openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          temperature: 0.3,
          max_tokens: 2500,
          messages: [
            {
              role: 'system',
              content: `${this.skillContent}\n\nRespond strictly in JSON format as specified in the skill.`
            },
            {
              role: 'user',
              content: `Create a comprehensive specification for this requirement: ${requirement}`
            }
          ]
        }, { signal }),
        { label: 'specAgent' }
      );

      const content = response.choices[0].message.content;
      
      // Extract JSON from content
      let jsonContent = content;
      
      // Remove markdown code blocks
      jsonContent = jsonContent.replace(/```json\n/g, '').replace(/\n```/g, '').replace(/```/g, '').trim();
      
      // Try to find JSON object if wrapped in text
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);  
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      try {
        const parsed = JSON.parse(jsonContent);
        return parsed;
      } catch (parseError) {
        console.error('Failed to parse Spec Agent output:', jsonContent.substring(0, 200));
        // Return a minimal valid specification as fallback
        return {
          metadata: { generated_at: new Date().toISOString() },
          specification: {
            title: 'Specification',
            description: requirement,
            objectives: [requirement]
          },
          principles: [],
          technical_plan: {},
          task_breakdown: [],
          success_criteria: []
        };
      }
    } catch (error) {
      console.error('❌ Spec Agent Error:', error.message);
      throw error;
    }
  }
}
