import pino from 'pino';

/**
 * Root logger for the ai-music app.
 *
 * Outputs structured JSON to stdout so container log aggregators
 * (kubectl logs, Loki, etc.) can parse and query log fields directly.
 *
 * LOG_LEVEL env var defaults to "info" in production and "debug" otherwise.
 */
const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: 'ai-music' },
});

export default logger;
