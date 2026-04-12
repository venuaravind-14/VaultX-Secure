'use strict';

/**
 * @file rateLimit.js
 * @description Rate limiting middleware using express-rate-limit + express-slow-down.
 * Uses tiered limits: global, auth-specific, and share-link-specific.
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const env = require('../config/env');
const { sendError } = require('../utils/apiResponse');

// ── Shared Rate-Limit Error Handler ───────────────────────────────────────────
const rateLimitHandler = (req, res) => {
  return sendError(res, {
    statusCode: 429,
    message: 'Too many requests. Please try again later.',
  });
};

// ── Global Rate Limiter (100 req / 15 min per IP) ─────────────────────────────
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,   // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,     // Disable `X-RateLimit-*` headers
  handler: rateLimitHandler,
  // Bypass health-check endpoint
  skip: (req) => req.path === '/health',
});

// ── Auth Route Limiter (10 req / 15 min per IP) ───────────────────────────────
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  // Track by IP + route to prevent cross-endpoint bypasses
  keyGenerator: (req) => `auth:${req.ip}:${req.path}`,
});

// ── Share Link Access Limiter (20 req / 15 min per IP) ────────────────────────
const shareLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.SHARE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `share:${req.ip}`,
});

// ── Auth Slow-Down (progressively delays after 5 requests) ───────────────────
// After 5 requests, each subsequent request is delayed by 500ms (max 5s).
// This adds friction to brute-force attempts without hard-blocking.
const authSlowDown = slowDown({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  delayAfter: 5,
  delayMs: (hits) => (hits - 5) * 500,
  maxDelayMs: 5000,
  keyGenerator: (req) => `slow:${req.ip}`,
});

module.exports = {
  globalLimiter,
  authLimiter,
  authSlowDown,
  shareLimiter,
};
