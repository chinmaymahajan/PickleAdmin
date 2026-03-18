/**
 * Lightweight frontend logger with category prefixes and log levels.
 * Filter in DevTools console by category prefix, e.g. "[APP]", "[API]", "[ROUND]".
 *
 * Log level is controlled by localStorage key "logLevel":
 *   "debug" | "info" | "warn" | "error" | "none"
 * Defaults to "debug" (everything visible).
 *
 * Errors are also forwarded to Sentry when the SDK is active.
 */
import * as Sentry from '@sentry/react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 99,
};

function getLogLevel(): LogLevel {
  try {
    const saved = localStorage.getItem('logLevel');
    if (saved && saved in LEVEL_PRIORITY) return saved as LogLevel;
  } catch { /* SSR / test safety */ }
  return 'debug';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getLogLevel()];
}

function createLogger(category: string) {
  const prefix = `[${category}]`;
  const attrs = { log_source: category.toLowerCase() };

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.debug(prefix, ...args);
      Sentry.logger.debug(`${prefix} ${args.map(String).join(' ')}`, attrs);
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.log(prefix, ...args);
      Sentry.logger.info(`${prefix} ${args.map(String).join(' ')}`, attrs);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(prefix, ...args);
      Sentry.logger.warn(`${prefix} ${args.map(String).join(' ')}`, attrs);
      Sentry.addBreadcrumb({
        category,
        message: args.map(String).join(' '),
        level: 'warning',
      });
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error(prefix, ...args);
      Sentry.logger.error(`${prefix} ${args.map(String).join(' ')}`, attrs);
      // Also capture errors as Sentry events for alerting
      const errorArg = args.find(a => a instanceof Error);
      if (errorArg instanceof Error) {
        Sentry.captureException(errorArg, {
          tags: { category },
          extra: { logArgs: args.map(String) },
        });
      } else {
        Sentry.captureMessage(`${prefix} ${args.map(String).join(' ')}`, {
          level: 'error',
          tags: { category },
        });
      }
    },
  };
}

export const log = {
  app: createLogger('APP'),
  api: createLogger('API'),
  league: createLogger('LEAGUE'),
  player: createLogger('PLAYER'),
  court: createLogger('COURT'),
  round: createLogger('ROUND'),
  display: createLogger('DISPLAY'),
  tv: createLogger('TV'),
  dev: createLogger('DEV'),
  timer: createLogger('TIMER'),
};

export default log;
