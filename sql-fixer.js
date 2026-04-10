export async function fixSQL(query) {
  if (!query || typeof query !== 'string') {
    return { query: '', fixed: false, changes: ['Input was empty or not a string'] };
  }

  let fixed = query.trim();
  const changes = [];

  // Remove trailing semicolons (sql.js doesn't need them and they can cause issues)
  if (fixed.endsWith(';')) {
    fixed = fixed.slice(0, -1).trimEnd();
    changes.push('Removed trailing semicolon');
  }

  // Collapse multiple whitespace/newlines into single spaces
  const collapsed = fixed.replace(/\s+/g, ' ');
  if (collapsed !== fixed) {
    fixed = collapsed;
    changes.push('Normalized whitespace');
  }

  // Fix unquoted string literals in WHERE clauses that should be quoted
  // Pattern: = word (not a number, not already quoted, not a column reference)
  fixed = fixed.replace(/=\s*([A-Za-z][A-Za-z0-9_]*)\b(?!\s*\.)/g, (match, word) => {
    // Skip SQL keywords and boolean values
    const keywords = new Set(['NULL', 'TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE', 'BETWEEN', 'EXISTS']);
    if (keywords.has(word.toUpperCase())) return match;
    changes.push(`Quoted unquoted string literal: ${word}`);
    return `= '${word}'`;
  });

  return {
    query: fixed,
    fixed: changes.length > 0,
    changes
  };
}
