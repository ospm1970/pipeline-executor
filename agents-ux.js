/**
 * UI/UX Agent - Design and User Experience Specialist
 * Transforms user stories into design specifications
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load UI/UX Skill
 */
function loadUIUXSkill() {
  try {
    const skillPath = join(__dirname, 'skills', 'ui-ux-agent', 'SKILL.md');
    const skillContent = readFileSync(skillPath, 'utf-8');
    return {
      loaded: true,
      content: skillContent,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.warn('⚠️ UI/UX Skill not found:', error.message);
    return {
      loaded: false,
      content: '',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * UI/UX Agent Service
 * Specializes in creating design specifications
 */
export class UIUXAgent {
  constructor() {
    this.skill = loadUIUXSkill();
    this.name = 'UI/UX Agent';
    this.role = 'Design and User Experience Specialist';
  }

  /**
   * Create design specifications from user stories
   */
  async createDesignSpecifications(userStories, requirements) {
    console.log('\n🎨 UI/UX Agent: Creating design specifications...');
    
    const prompt = `
You are an expert UI/UX Designer. Your role is to transform user stories and requirements into clear, actionable design specifications.

User Stories:
${userStories.map((story, i) => `${i + 1}. ${story}`).join('\n')}

Requirements:
${requirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}

Based on these user stories and requirements, create comprehensive design specifications including:

1. **User Journey Mapping**
   - Define personas
   - Map key user flows
   - Identify friction points

2. **Information Architecture**
   - Define content hierarchy
   - Plan navigation structure
   - Specify categorization

3. **Layout & Wireframes**
   - Describe the layout structure (e.g., two-column, three-column)
   - Specify component placement
   - Define responsive behaviors (mobile, tablet, desktop)

4. **Design System Requirements**
   - Typography specifications
   - Color palette requirements
   - Spacing and sizing scales
   - Component specifications

5. **Accessibility Requirements**
   - WCAG compliance level (AA or AAA)
   - Keyboard navigation requirements
   - Screen reader considerations
   - Color contrast requirements

6. **Interaction Design**
   - Define interaction states (default, hover, active, disabled, error)
   - Specify animations and transitions
   - Define loading and empty states

Return the response as a valid JSON object with the following structure:
{
  "user_journey": {
    "personas": ["persona1", "persona2"],
    "key_flows": ["flow1", "flow2"],
    "friction_points": ["point1", "point2"]
  },
  "information_architecture": {
    "hierarchy": "description",
    "navigation": ["nav1", "nav2"],
    "categorization": ["category1", "category2"]
  },
  "layout_structure": {
    "type": "layout type",
    "components": ["component1", "component2"],
    "responsive": {
      "mobile": "description",
      "tablet": "description",
      "desktop": "description"
    }
  },
  "design_system": {
    "typography": "specifications",
    "colors": "palette description",
    "spacing": "scale description",
    "components": ["component1", "component2"]
  },
  "accessibility": {
    "wcag_level": "AA",
    "keyboard_nav": "description",
    "screen_reader": "description",
    "contrast_ratio": "4.5:1"
  },
  "interactions": {
    "states": ["default", "hover", "active", "disabled", "error"],
    "animations": "description",
    "loading_state": "description",
    "empty_state": "description"
  }
}
`;

    try {
      // Call LLM to generate design specifications
      const response = await this.callLLM(prompt);
      
      // Parse and validate JSON response
      let designSpecs;
      try {
        // Extract JSON from response if wrapped in markdown
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          designSpecs = JSON.parse(jsonMatch[0]);
        } else {
          designSpecs = JSON.parse(response);
        }
      } catch (parseError) {
        console.warn('⚠️ Failed to parse design specs as JSON, returning as text');
        designSpecs = { raw_response: response };
      }

      return {
        status: 'completed',
        design_specifications: designSpecs,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error creating design specifications:', error.message);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate design against accessibility standards
   */
  async validateAccessibility(designSpecs) {
    console.log('\n♿ UI/UX Agent: Validating accessibility...');
    
    const prompt = `
You are an accessibility expert. Review the following design specifications and validate them against WCAG 2.1 AA standards.

Design Specifications:
${JSON.stringify(designSpecs, null, 2)}

Provide an accessibility validation report including:
1. Compliance level (Pass/Fail)
2. Issues found (if any)
3. Recommendations for improvement
4. Contrast ratio validation
5. Keyboard navigation assessment
6. Screen reader compatibility

Return as JSON:
{
  "compliance_level": "AA" or "AAA",
  "status": "pass" or "fail",
  "issues": [
    {
      "category": "category",
      "severity": "critical/high/medium/low",
      "description": "description",
      "recommendation": "recommendation"
    }
  ],
  "contrast_validation": {
    "status": "pass/fail",
    "details": "details"
  },
  "keyboard_navigation": {
    "status": "pass/fail",
    "details": "details"
  },
  "screen_reader": {
    "status": "pass/fail",
    "details": "details"
  }
}
`;

    try {
      const response = await this.callLLM(prompt);
      
      let validationReport;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          validationReport = JSON.parse(jsonMatch[0]);
        } else {
          validationReport = JSON.parse(response);
        }
      } catch (parseError) {
        validationReport = { raw_response: response };
      }

      return {
        status: 'completed',
        accessibility_report: validationReport,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error validating accessibility:', error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Generate component specifications
   */
  async generateComponentSpecs(componentName, requirements) {
    console.log(`\n🧩 UI/UX Agent: Generating specs for ${componentName}...`);
    
    const prompt = `
You are a component design specialist. Create detailed specifications for the following component:

Component: ${componentName}
Requirements: ${requirements}

Provide specifications including:
1. Visual design (colors, typography, sizing)
2. States (default, hover, active, disabled, error)
3. Responsive behavior
4. Accessibility requirements
5. Usage guidelines

Return as JSON:
{
  "name": "${componentName}",
  "visual_design": {
    "colors": "description",
    "typography": "description",
    "sizing": "description"
  },
  "states": {
    "default": "description",
    "hover": "description",
    "active": "description",
    "disabled": "description",
    "error": "description"
  },
  "responsive": {
    "mobile": "description",
    "tablet": "description",
    "desktop": "description"
  },
  "accessibility": "requirements",
  "usage_guidelines": "guidelines"
}
`;

    try {
      const response = await this.callLLM(prompt);
      
      let componentSpecs;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          componentSpecs = JSON.parse(jsonMatch[0]);
        } else {
          componentSpecs = JSON.parse(response);
        }
      } catch (parseError) {
        componentSpecs = { raw_response: response };
      }

      return {
        status: 'completed',
        component_specifications: componentSpecs,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error generating component specs:', error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Call LLM API
   */
  async callLLM(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const openai = new OpenAI({ apiKey });

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert UI/UX Designer. Provide detailed, actionable design specifications. Always respond with valid JSON when requested.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      return response.choices[0].message.content;
    } catch (error) {
      throw new Error(`LLM API error: ${error.message}`);
    }
  }
}

/**
 * UI/UX Agent with Skill Integration
 */
export class UIUXAgentWithSkill extends UIUXAgent {
  constructor() {
    super();
    this.skillContent = this.skill.content;
  }

  /**
   * Get skill guidelines
   */
  getSkillGuidelines() {
    if (!this.skill.loaded) {
      return 'UI/UX Skill not available';
    }
    return this.skillContent;
  }

  /**
   * Apply skill to design process
   */
  async applySkillToDesign(userStories, requirements) {
    console.log('\n📚 Applying UI/UX Skill guidelines...');
    
    if (!this.skill.loaded) {
      console.warn('⚠️ Skill not loaded, proceeding without skill guidelines');
    }

    return this.createDesignSpecifications(userStories, requirements);
  }
}

export default UIUXAgent;
