/**
 * Centralized logger — replaces direct console.error / console.warn calls.
 * Swap implementation here to wire up a real logger (e.g. pino) without touching call sites.
 */

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, ...args: unknown[]): void {
  const prefix = '[LOGGER]';
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export const logger = {
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
