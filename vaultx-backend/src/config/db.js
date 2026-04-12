'use strict';

/**
 * @file db.js
 * @description MongoDB connection using Mongoose.
 * Uses connection pooling optimized for production environments.
 */

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

let isConnected = false;

/**
 * Connects to MongoDB. Idempotent — safe to call multiple times.
 * @param {string} [uri] Optional override URI (useful for tests)
 * @returns {Promise<void>}
 */
const connectDB = async (uri) => {
  if (isConnected) {
    logger.debug('MongoDB: reusing existing connection');
    return;
  }

  const connectionString = uri || env.MONGODB_URI;

  try {
    const conn = await mongoose.connect(connectionString, {
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 to avoid DNS SRV resolution issues on some networks
      // Atlas recommended settings
      retryWrites: true,
    });

    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host} / ${conn.connection.name}`);
  } catch (err) {
    logger.error('MongoDB connection error', { 
      message: err.message, 
      code: err.code,
      reason: err.reason || 'Unknown selection error'
    });
    if (process.env.NODE_ENV === 'test') {
      throw err;
    }
    // Don't exit immediately in dev, let nodemon restart or developer see full trace
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Handle connection events for monitoring
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB error', { error: err.message });
});

/**
 * Gracefully closes the MongoDB connection.
 * @returns {Promise<void>}
 */
const disconnectDB = async () => {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB connection closed');
};

module.exports = { connectDB, disconnectDB };
