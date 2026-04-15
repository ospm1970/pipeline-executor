import logger from './logger.js';

/**
 * Detecta se um erro é causado por abort/timeout.
 *
 * O SDK da OpenAI (v4.x) lança `APIUserAbortError` ao receber um AbortSignal
 * cancelado. Esse erro tem `constructor.name === 'APIUserAbortError'` e
 * `error.name === 'Error'` — NÃO é o padrão `AbortError` do browser/Node.
 * Por isso verificamos tanto o `constructor.name` quanto o `error.name`.
 */
function isAbortError(error) {
  return (
    error.name === 'AbortError' ||
    error.constructor?.name === 'APIUserAbortError' ||
    error.message?.includes('Request was aborted')
  );
}

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
      const isAborted = isAbortError(error);
      const isRetryable = isAborted || error.status === 429 || error.status >= 500 || error.code === 'ECONNRESET';
      if (!isRetryable || attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`Retrying ${label}`, { attempt, nextRetryMs: delay, error: error.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}