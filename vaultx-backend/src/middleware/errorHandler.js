'use strict';

/**
 * @file errorHandler.js
 * @description Global Express error-handling middleware.
 * - Catches all errors forwarded via next(err)
 * - Sanitizes stack traces in production
 * - Maps known error types to correct HTTP status codes
 */

const logger = require('../config/logger');
const { sendError } = require('../utils/apiResponse');
const env = require('../config/env');

/**
 * Centralized error handler. Must have 4 parameters for Express to recognize it.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Default to 500
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // ── Mongoose Validation Error ──────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // ── Mongoose Duplicate Key (unique constraint violation) ───────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `An account with this ${field} already exists`;
  }

  // ── Mongoose CastError (invalid ObjectId / UUID format) ───────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }

  // ── JWT Errors ─────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired';
  }
  if (err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Token not yet active';
  }

  // ── Multer File Errors ─────────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = `File too large. Maximum size is ${env.MAX_FILE_SIZE_MB}MB`;
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected file field in upload';
  }

  // ── Log all server errors (5xx) ────────────────────────────────────────────
  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  } else {
    logger.warn('Client error', {
      statusCode,
      message,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  }

  return sendError(res, {
    statusCode,
    message,
    errors,
    // Expose stack trace in development only
    ...(env.NODE_ENV === 'development' && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
};

/**
 * 404 handler — must be placed AFTER all routes.
 */
const notFound = (req, res) => {
  return sendError(res, {
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

module.exports = { errorHandler, notFound };
