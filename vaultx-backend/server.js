'use strict';

/**
 * @file server.js
 * @version 2026-04-15.1
 * @description HTTP server entry point.
 * Connects to MongoDB, then starts Express. Handles graceful shutdown.
 */

const app = require('./app');
const { connectDB, disconnectDB } = require('./src/config/db');
const env = require('./src/config/env');
const logger = require('./src/config/logger');

let server;

const startServer = async () => {
  try {
    // Connect to MongoDB before accepting requests
    await connectDB();

    server = app.listen(env.PORT, () => {
      logger.info(`VaultX Secure API running`, {
        port: env.PORT,
        environment: env.NODE_ENV,
        pid: process.pid,
      });
    });

    // Set timeouts to mitigate slow-loris attacks
    server.keepAliveTimeout = 65_000;   // > ALB timeout of 60s
    server.headersTimeout   = 66_000;

  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

// ── Graceful Shutdown ──────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDB();
      logger.info('Database connections closed. Exiting.');
      process.exit(0);
    });

    // Force exit after 30s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30_000);
  } else {
    process.exit(0);
  }
};

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Handle uncaught errors — log and exit so process manager can restart
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — shutting down', {
    error: err.message,
    stack: err.stack,
  });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection — shutting down', {
    reason: reason?.message || reason,
  });
  shutdown('unhandledRejection');
});

startServer();
