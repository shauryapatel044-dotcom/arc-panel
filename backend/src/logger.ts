/**
 * src/logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Winston logger with console + file transports.
 * Logs are colorized in development and JSON in production.
 */

import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;
const isDev = process.env.NODE_ENV !== 'production';

// ─── Custom dev format ────────────────────────────────────────────────────────
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  let log = `${ts} [${level}] ${message}`;
  if (stack) log += `\n${stack}`;
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return log + metaStr;
});

// ─── Transports ───────────────────────────────────────────────────────────────
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isDev
      ? combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), devFormat)
      : combine(timestamp(), errors({ stack: true }), json()),
  }),
];

// In production also log to rotating files
if (!isDev) {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 20 * 1024 * 1024, // 20 MB
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  transports,
  // Prevents Winston from exiting on uncaught exceptions (handled manually)
  exitOnError: false,
});

export default logger;
