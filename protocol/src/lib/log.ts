type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Named context for styled logs (emoji + color). */
export type LogContext =
  | 'controller'
  | 'service'
  | 'agent'
  | 'graph'
  | 'queue'
  | 'route'
  | 'server';

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const RESET = '\x1b[0m';

/** Whether to use ANSI color (TTY or FORCE_COLOR). */
function useColor(): boolean {
  if (process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true') return true;
  return Boolean(process.stdout?.isTTY);
}

/** Hex to ANSI 24-bit foreground (e.g. #ffc106 → RGB escape). */
function hexToAnsi(hex: string): string {
  const n = hex.replace(/^#/, '');
  if (n.length !== 6) return '';
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

const CONTEXT_STYLES: Record<LogContext, { emoji: string; color: string }> = {
  controller: { emoji: '📡', color: '#ffc106' },
  service: { emoji: '⚙️', color: '#17a2b8' },
  agent: { emoji: '🤖', color: '#6f42c1' },
  graph: { emoji: '🕸️', color: '#20c997' },
  queue: { emoji: '📬', color: '#fd7e14' },
  route: { emoji: '🛤️', color: '#e83e8c' },
  server: { emoji: '🌐', color: '#6c757d' },
};

function envLevel(): LogLevel {
  const v = (process.env.LOG_LEVEL || '').toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') return 'debug';
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

let currentLevel: LogLevel = envLevel();

export function setLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel) {
  return order[level] >= order[currentLevel];
}

function fmt(message: string, meta?: Record<string, unknown>) {
  if (!meta) return message;
  try {
    return `${message} ${JSON.stringify(meta)}`;
  } catch {
    return message;
  }
}

/** Wrap line with emoji + source + optional color. Format: "emoji source: message" (source required for consistency). */
function wrapWithContext(
  context: LogContext | undefined,
  source: string | undefined,
  line: string
): { start: string; end: string } {
  if (!context || !CONTEXT_STYLES[context])
    return { start: source ? `${source}: ` : '', end: '' };
  const { emoji, color } = CONTEXT_STYLES[context];
  const colorOn = useColor() && color;
  const ansi = colorOn ? hexToAnsi(color) : '';
  const reset = colorOn ? RESET : '';
  const prefix = source ? `${emoji} ${source}: ` : `${emoji} `;
  return { start: ansi ? `${ansi}${prefix}` : prefix, end: reset };
}

type LogMethod = (message: string, meta?: Record<string, unknown>) => void;

export type LoggerWithSource = {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
};

function createLogger(
  context: LogContext | undefined,
  source?: string
): LoggerWithSource {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('debug')) return;
      const line = fmt(message, meta);
      const { start, end } = wrapWithContext(context, source, line);
      console.debug(start + line + end);
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('info')) return;
      const line = fmt(message, meta);
      const { start, end } = wrapWithContext(context, source, line);
      console.info(start + line + end);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('warn')) return;
      const line = fmt(message, meta);
      const { start, end } = wrapWithContext(context, source, line);
      console.warn(start + line + end);
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('error')) return;
      const line = fmt(message, meta);
      const { start, end } = wrapWithContext(context, source, line);
      console.error(start + line + end);
    },
  };
}

function addFrom<T extends LogContext>(context: T): LoggerWithSource & { from: (source: string) => LoggerWithSource } {
  const logger = createLogger(context) as LoggerWithSource & { from: (source: string) => LoggerWithSource };
  logger.from = (source: string) => createLogger(context, source);
  return logger;
}

const base = createLogger(undefined, undefined);

/** Logger with optional context (emoji + color). Use .from('filename.ts') for consistent source in every line. */
export const log = {
  ...base,
  withContext(context: LogContext, source?: string) {
    return source ? createLogger(context, source) : addFrom(context);
  },
  /** Pre-bound logger for v2 controllers. Use log.controller.from('upload.controller.ts'). */
  controller: addFrom('controller'),
  service: addFrom('service'),
  agent: addFrom('agent'),
  graph: addFrom('graph'),
  queue: addFrom('queue'),
  route: addFrom('route'),
  server: addFrom('server'),
};

export type { LogLevel };

