import logger from './logger.js';

export async function withRetry(fn, { retries = 3, baseDelayMs = 1000, timeoutMs = 30000, label = 'operation' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const isAborted = error.name === 'AbortError';
      const isRetryable = isAborted || error.status === 429 || error.status >= 500 || error.code === 'ECONNRESET';
      if (!isRetryable || attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`Retrying ${label}`, { attempt, nextRetryMs: delay, error: error.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}
