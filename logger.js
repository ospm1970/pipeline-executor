const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function log(level, message, meta = {}) {
  if (levels[level] > levels[LOG_LEVEL]) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'pipeline-executor',
    ...meta
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  info:  (msg, meta = {}) => log('info',  msg, meta),
  warn:  (msg, meta = {}) => log('warn',  msg, meta),
  error: (msg, meta = {}) => log('error', msg, meta),
  debug: (msg, meta = {}) => log('debug', msg, meta),
  child: (defaultMeta = {}) => ({
    info:  (msg, meta = {}) => log('info',  msg, { ...defaultMeta, ...meta }),
    warn:  (msg, meta = {}) => log('warn',  msg, { ...defaultMeta, ...meta }),
    error: (msg, meta = {}) => log('error', msg, { ...defaultMeta, ...meta }),
    debug: (msg, meta = {}) => log('debug', msg, { ...defaultMeta, ...meta }),
  })
};

export default logger;
