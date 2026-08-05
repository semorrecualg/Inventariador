/**
 * Logger estruturado para o ecossistema GBR KARDEK v24.50-PROD.
 *
 * Substitui console.log/warn/error diretamente por logger.info/warn/error.
 * Em produção (VITE_PRODUCTION=true ou VERCEL_ENV=production), suprime
 * logs abaixo do nível configurado (default: 'warn'), exceto em desenvolvimento.
 *
 * Uso:
 *   import { logger } from '../utils/logger';
 *   logger.info('>>> [App] Mensagem informativa');
 *   logger.warn('⚠️ [Module] Alerta');
 *   logger.error('❌ [Service] Erro:', err);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Nível mínimo de log baseado no ambiente.
 * Produção: só warn+error. Desenvolvimento: tudo.
 */
function getMinLevel(): LogLevel {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_PRODUCTION === 'true' || process.env.VERCEL_ENV === 'production') {
      return 'warn';
    }
  }
  // Verificar meta.env do Vite (build de produção)
  if (typeof import.meta !== 'undefined' && (import.meta as unknown as Record<string, unknown>).env) {
    const mode = (import.meta as unknown as Record<string, { PROD?: boolean; DEV?: boolean }>).env;
    if (mode?.PROD) return 'warn';
  }
  // Por padrão, loga tudo (desenvolvimento)
  return 'debug';
}

const MIN_LEVEL = getMinLevel();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/**
 * Logger compatível com console.* mas que respeita o nível mínimo.
 * Aceita múltiplos argumentos (mesma assinatura de console.log).
 */
function info(...args: unknown[]): void {
  if (shouldLog('info')) {
    console.log(...args);
  }
}

function warn(...args: unknown[]): void {
  if (shouldLog('warn')) {
    console.warn(...args);
  }
}

function error(...args: unknown[]): void {
  if (shouldLog('error')) {
    console.error(...args);
  }
}

function debug(...args: unknown[]): void {
  if (shouldLog('debug')) {
    console.debug(...args);
  }
}

export const logger = { info, warn, error, debug };
