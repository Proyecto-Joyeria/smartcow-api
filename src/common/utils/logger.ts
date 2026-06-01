import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const LOG_LEVEL  = process.env['LOG_LEVEL']  ?? 'info';
const LOG_PRETTY = process.env['LOG_PRETTY'] === 'true';

// Formato legible para desarrollo (colores + alineación)
const prettyFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${ts} [${level}] ${message}${metaStr}${stackStr}`;
  }),
);

// Formato JSON para staging/producción (parseable por Datadog, CloudWatch, etc.)
const jsonFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: LOG_PRETTY ? prettyFormat : jsonFormat,
  defaultMeta: { service: 'smartcow-api' },
  transports: [
    new winston.transports.Console(),
  ],
  // En producción los errores no capturados llegan al proceso, no aquí.
  // El errorHandler middleware los loguea antes de responder al cliente.
  exceptionHandlers: [
    new winston.transports.Console(),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
  ],
});
