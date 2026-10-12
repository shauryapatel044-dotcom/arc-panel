/**
 * Arc Panel Daemon — Winston Logger
 *
 * Structured JSON logs in production, pretty-printed in development.
 */

import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Pretty format for development/local runs
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${ts}] ${level}: ${message}${extra}`;
  }),
);

// Structured JSON for production (ingested by log shippers)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

export const logger = winston.createLogger({
  level: config.logLevel,
  format: config.nodeEnv === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  // Add file transport in production if desired:
  // new winston.transports.File({ filename: 'error.log', level: 'error' }),
});

// Add an HTTP level for request logging
winston.addColors({ http: 'magenta' });
