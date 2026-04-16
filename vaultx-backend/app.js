'use strict';

/**
 * @file app.js
 * @description Express application factory — all middleware and routes registered here.
 * Separated from server.js to enable clean integration testing.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const passport = require('passport');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');

const env = require('./src/config/env');
const logger = require('./src/config/logger');
const { 
  globalRateLimit, 
  errorHandler, 
  notFound, 
  initializePassport 
} = require('./src/middleware/auth');
const routes = require('./src/routes/index');

const app = express();

// ── Security: HTTP Headers (Helmet) ───────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: true,
    hsts: {
      maxAge: 31536000,        // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ── CORS: strict whitelist ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman) in development
      if (!origin && !env.IS_PRODUCTION) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin) || !origin) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request', { origin });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Cache preflight for 24h
  })
);

// ── Body Parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));           // Prevent payload flooding
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// ── NoSQL Injection Prevention ────────────────────────────────────────────────
// Strips $ and . from request body, query, and params
app.use(mongoSanitize({ replaceWith: '_' }));

// ── Global Rate Limiter ────────────────────────────────────────────────────────
app.use(globalRateLimit);

// ── Passport (Google OAuth) ───────────────────────────────────────────────────
initializePassport();
app.use(passport.initialize());

// ── Trust Proxy (for accurate IP behind Nginx/load balancer) ─────────────────
if (env.IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VaultX Secure API Gateway — Protection Active',
    version: '1.0.0',
    documentation: '/health'
  });
});

app.use('/api', routes);

// ── 404 Handler ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  logger.warn('Route not found', { path: req.path, method: req.method, ip: req.ip });
  notFound(req, res);
});

// ── Global Error Handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

module.exports = app;
