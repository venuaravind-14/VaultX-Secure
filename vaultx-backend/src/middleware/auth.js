/**
 * VaultX Secure — Security Middleware
 * Clean version: JWT-only authentication, no Vault PIN gates.
 */

'use strict';

const jwt              = require('jsonwebtoken');
const rateLimit        = require('express-rate-limit');
const slowDown         = require('express-slow-down');
const { validationResult } = require('express-validator');
const fileType         = require('file-type');
const passport         = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { User } = require('../models/models');
const logger = require('../config/logger');

// ── JWT AUTHENTICATION ────────────────────────────────────────────────────────
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        data:    null,
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Session expired'
        : 'Invalid token';

      return res.status(401).json({
        success: false,
        message,
        data:    null,
      });
    }

    const user = await User.findById(decoded.sub).select('_id email role is_verified locked_until');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        data:    null,
      });
    }

    if (user.isLocked && user.isLocked()) {
      return res.status(403).json({
        success: false,
        message: 'Account locked',
        data:    null,
      });
    }

    req.user = {
      _id:         user._id,
      email:       user.email,
      role:        user.role,
      is_verified: user.is_verified,
    };

    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.sub).select('_id email role');

    if (user) req.user = { _id: user._id, email: user.email, role: user.role };
  } catch {
    // Silently ignore
  }
  next();
}

function initializePassport() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes('your-google-client-id')) return;

  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false, { message: 'email_not_provided' });

          let user = await User.findOne({ 
            $or: [{ google_id: profile.id }, { email }] 
          });

          if (!user) {
            user = await User.create({
              name: profile.displayName || email.split('@')[0],
              email,
              google_id: profile.id,
              is_verified: true,
            });
          } else {
            let updated = false;
            if (!user.google_id) { user.google_id = profile.id; updated = true; }
            if (!user.is_verified) { user.is_verified = true; updated = true; }
            if (updated) await user.save();
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

// ── RBAC & Ownership ───────────────────────────────────────────────────────────
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        data:    null,
      });
    }
    next();
  };
}

function requireOwnership(getOwnerId) {
  return async (req, res, next) => {
    try {
      const ownerId = await getOwnerId(req);
      if (!ownerId || ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          data:    null,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests' },
});

const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Rate limit exceeded' },
});

const shareLinkRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Rate limit exceeded' },
});

const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: (used, req) => (used - req.slowDown.limit) * 500,
});

// ── Validation Handler ────────────────────────────────────────────────────────
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

// ── Error Handler ─────────────────────────────────────────────────────────────
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = process.env.NODE_ENV === 'development';
  logger.error(`${err.name}: ${err.message}`, { stack: err.stack, path: req.path });

  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Resource already exists' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false, 
      message: 'Validation failed', 
      errors: Object.values(err.errors).map(e => ({ field: e.path, message: e.message }))
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
    errors: isDev ? [{ stack: err.stack }] : null,
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

// ── Token Helpers ─────────────────────────────────────────────────────────────
function generateAccessToken(userId) {
  return jwt.sign(
    { sub: userId.toString(), type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function generateRefreshToken(userId) {
  return jwt.sign(
    { sub: userId.toString(), type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
}

function setAuthCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.cookie('access_token', accessToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookies(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = { httpOnly: true, secure: isProd, sameSite: isProd ? 'None' : 'Lax', path: '/' };
  res.clearCookie('refresh_token', opts);
  res.clearCookie('access_token', { ...opts, httpOnly: false });
}

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = {
  protect,
  optionalAuth,
  restrictTo,
  requireOwnership,
  initializePassport,
  authRateLimit,
  globalRateLimit,
  shareLinkRateLimit,
  authSlowDown,
  handleValidationErrors,
  errorHandler,
  notFound,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
};