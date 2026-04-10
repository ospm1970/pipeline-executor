import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateSQLQuery(requirement, schema) {
  const schemaDescription = Object.entries(schema)
    .map(([table, columns]) => {
      const cols = columns.map(c => `${c.name} ${c.type}`).join(', ');
      return `Table "${table}": (${cols})`;
    })
    .join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0.1,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are a SQL expert. Generate a single valid SQLite SELECT query based on the user's requirement and the available schema.
Respond ONLY with a JSON object containing:
- "query": the SQL string
- "description": a brief description of what the query does

No markdown, no extra text.`
      },
      {
        role: 'user',
        content: `Requirement: ${requirement}\n\nSchema:\n${schemaDescription || 'No tables available'}`
      }
    ]
  });

  const content = response.choices[0].message.content.trim();

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (match) {
      parsed = { query: match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'), description: 'Generated SQL query' };
    } else {
      throw new Error(`Failed to parse SQL generator response: ${content.substring(0, 200)}`);
    }
  }

  if (!parsed.query || typeof parsed.query !== 'string') {
    throw new Error('SQL generator returned invalid query');
  }

  return {
    query: parsed.query.trim(),
    description: parsed.description || 'Generated SQL query',
    success: true
  };
}

export async function validateSQL(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Empty or invalid SQL query');
  }

  const upper = query.trim().toUpperCase();

  // Only allow SELECT statements for safety
  if (!upper.startsWith('SELECT')) {
    throw new Error('Only SELECT statements are allowed');
  }

  // Check for basic structural completeness
  const openParens = (query.match(/\(/g) || []).length;
  const closeParens = (query.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    throw new Error('Unbalanced parentheses in SQL query');
  }

  // Detect obviously dangerous patterns
  const forbidden = /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)/i;
  if (forbidden.test(query)) {
    throw new Error('Potentially dangerous SQL detected');
  }

  return { valid: true, errors: [] };
}
