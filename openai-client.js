import OpenAI from 'openai';

let openaiClient = null;

export function getOpenAIClient(agentName = 'Este agente') {
  if (openaiClient) return openaiClient;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(`OPENAI_API_KEY não configurada. ${agentName} só pode executar chamadas de IA quando a variável de ambiente estiver definida.`);
  }

  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openaiClient;
}

export function resetOpenAIClientForTests() {
  openaiClient = null;
}
