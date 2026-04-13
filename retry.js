import logger from './logger.js';

export async function withRetry(fn, { retries = 3, baseDelayMs = 1000, label = 'operation' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = error.status >= 500 || error.code === 'ECONNRESET' || error.message?.includes('timeout');
      if (!isRetryable || attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`Retrying ${label}`, { attempt, nextRetryMs: delay, error: error.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}
