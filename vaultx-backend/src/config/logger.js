'use strict';

/**
 * @file logger.js
 * @description Winston structured logger with file and console transports.
 * In production, logs are written to files only (no console output for perf).
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const env = require('./env');

const { combine, timestamp, errors, json, colorize, printf, splat } = format;

// Human-readable format for development
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    let log = `[${ts}] ${level}: ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length > 0) log += `\n${JSON.stringify(meta, null, 2)}`;
    return log;
  })
);

// Machine-readable JSON format for production
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json()
);

const loggerTransports = [];

if (env.IS_PRODUCTION) {
  // Production: JSON logs to files with rotation
  loggerTransports.push(
    new transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    }),
    new transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  );
} else {
  // Development: colorized console output
  loggerTransports.push(new transports.Console());
}

const logger = createLogger({
  level: env.IS_PRODUCTION ? 'info' : 'debug',
  format: env.IS_PRODUCTION ? prodFormat : devFormat,
  transports: loggerTransports,
  // Do not exit process on unhandled errors in logger
  exitOnError: false,
});

// Wraps Morgan HTTP log messages
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
