'use strict';

/**
 * @file env.js
 * @description Centralized environment variable validation and export.
 * Fails fast on startup if any required variable is missing or invalid.
 */

/* Load .env before anything else */
require('dotenv').config();

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'QR_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'SHARE_LINK_HMAC_SECRET',
  'FRONTEND_URL',
];

// Validate on import — server will not start with missing secrets
for (const key of REQUIRED_VARS) {
  if (key === 'FRONTEND_URL') {
    if (!process.env.FRONTEND_URL && !process.env.CLIENT_URL) {
      console.error('[FATAL] Missing required environment variable: FRONTEND_URL or CLIENT_URL');
      process.exit(1);
    }
    continue;
  }
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Validate ENCRYPTION_MASTER_KEY is exactly 32 bytes (64 hex chars)
if (process.env.ENCRYPTION_MASTER_KEY.length !== 64) {
  console.error('[FATAL] ENCRYPTION_MASTER_KEY must be exactly 64 hex characters (32 bytes).');
  process.exit(1);
}

module.exports = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',

  // MongoDB
  MONGODB_URI: process.env.MONGODB_URI,

  // JWT
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // QR
  QR_SECRET: process.env.QR_SECRET,

  // Encryption
  ENCRYPTION_MASTER_KEY: Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex'),
  SHARE_LINK_HMAC_SECRET: process.env.SHARE_LINK_HMAC_SECRET,

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',

  // Frontend
  FRONTEND_URL: process.env.CLIENT_URL || process.env.FRONTEND_URL,

  // File Upload
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50,
  MAX_FILE_SIZE_BYTES: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50) * 1024 * 1024,

  // Argon2 Params
  ARGON2_MEMORY_COST: parseInt(process.env.ARGON2_MEMORY_COST, 10) || 65536,
  ARGON2_TIME_COST: parseInt(process.env.ARGON2_TIME_COST, 10) || 3,
  ARGON2_PARALLELISM: parseInt(process.env.ARGON2_PARALLELISM, 10) || 4,

  // PBKDF2 Params
  PBKDF2_ITERATIONS: parseInt(process.env.PBKDF2_ITERATIONS, 10) || 600000,
  PBKDF2_KEYLEN: parseInt(process.env.PBKDF2_KEYLEN, 10) || 32,
  PBKDF2_DIGEST: process.env.PBKDF2_DIGEST || 'sha512',

  // Email
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT, 10) || 587,
  EMAIL_SECURE: process.env.EMAIL_SECURE === 'true',
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || '"VaultX Secure" <noreply@vaultx.io>',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  SHARE_RATE_LIMIT_MAX: parseInt(process.env.SHARE_RATE_LIMIT_MAX, 10) || 20,

  // Allowed MIME types whitelist
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
  ],
};
