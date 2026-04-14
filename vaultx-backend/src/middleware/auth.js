/**
 * VaultX Secure — Security Middleware
 *
 * Covers:
 *  1. JWT authentication (access token from Authorization header)
 *  2. Role-based access control
 *  3. PIN verification gate
 *  4. Rate limiters (auth routes, global, share link access)
 *  5. Input sanitization
 *  6. MIME type validation for uploads
 *  7. Centralized error handler
 */

'use strict';

const jwt              = require('jsonwebtoken');
const rateLimit        = require('express-rate-limit');
const slowDown         = require('express-slow-down');
const { validationResult } = require('express-validator');
const fileType         = require('file-type');
const passport         = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { User, AuditLog } = require('../models/models');
const { verifyPassword } = require('../services/cryptoService');
const logger = require('../config/logger');

// ─────────────────────────────────────────────
// 1. JWT AUTHENTICATION MIDDLEWARE
// ─────────────────────────────────────────────

/**
 * Protect routes — verify JWT access token.
 * Token must be in Authorization header as: Bearer <token>
 *
 * Attaches req.user = { _id, email, role } on success.
 */
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        data:    null,
        errors:  null,
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Session expired — please log in again'
        : 'Invalid authentication token';

      return res.status(401).json({
        success: false,
        message,
        data:    null,
        errors:  null,
      });
    }

    // Confirm user still exists (not deleted between token issue and now)
    const user = await User.findById(decoded.sub).select('_id email role is_verified locked_until');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
        data:    null,
        errors:  null,
      });
    }

    if (user.isLocked && user.isLocked()) {
      return res.status(403).json({
        success: false,
        message: 'Account is temporarily locked due to suspicious activity',
        data:    null,
        errors:  null,
      });
    }

    // Attach minimal user info to request — never attach sensitive fields
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

/**
 * Optional auth — attach req.user if token present, don't fail if not.
 * Use for public routes that behave differently for logged-in users.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.sub).select('_id email role');

    if (user) req.user = { _id: user._id, email: user.email, role: user.role };
  } catch {
    // Silently ignore invalid token for optional auth
  }
  next();
}

/**
 * Initialize Passport Google Strategy if credentials exist.
 * Prevents application crash if GOOGLE_CLIENT_ID/SECRET are missing.
 */
function initializePassport() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes('your-google-client-id')) {
    console.warn('[AUTH] Google OAuth credentials missing or default. OAuth login will be disabled.');
    return;
  }

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
          
          if (!email) {
            logger.error('[AUTH] Google OAuth failed: No email returned', { profileId: profile.id });
            return done(null, false, { message: 'email_not_provided' });
          }

          let user = await User.findOne({ 
            $or: [{ google_id: profile.id }, { email }] 
          });

          if (!user) {
            logger.info('[AUTH] Creating new Google user', { email });
            user = await User.create({
              name: profile.displayName || email.split('@')[0],
              email,
              google_id: profile.id,
              is_verified: true,
            });
          } else {
            // Found user, check if we need to link google_id
            let updated = false;
            
            if (!user.google_id) {
              logger.info('[AUTH] Linking Google ID to existing email account', { email });
              user.google_id = profile.id;
              updated = true;
            }
            
            // Auto-verify if they just logged in with Google
            if (!user.is_verified) {
              user.is_verified = true;
              updated = true;
            }

            if (updated) await user.save();
          }

          return done(null, user);
        } catch (err) {
          logger.error('[AUTH] Error in Google verify callback', { error: err.message, stack: err.stack });
          return done(err, null);
        }
      }
    )
  );
}



// ─────────────────────────────────────────────
// 2. ROLE-BASED ACCESS CONTROL
// ─────────────────────────────────────────────

/**
 * Restrict route to specific roles.
 * Must be used AFTER protect() middleware.
 *
 * Usage: router.get('/admin', protect, restrictTo('admin'), handler)
 *
 * @param {...string} roles  allowed roles
 */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
        data:    null,
        errors:  null,
      });
    }
    next();
  };
}

/**
 * Ensure the authenticated user owns the resource.
 * Expects req.resource to be set by the controller before this middleware,
 * or pass a getter function.
 *
 * Usage: check ownership of a file before allowing download/delete.
 *
 * @param {Function} getOwnerId  async fn(req) → ownerId string
 */
function requireOwnership(getOwnerId) {
  return async (req, res, next) => {
    try {
      const ownerId = await getOwnerId(req);

      if (!ownerId || ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          data:    null,
          errors:  null,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}


// ─────────────────────────────────────────────
// 3. PIN VERIFICATION GATE
// ─────────────────────────────────────────────

/**
 * Require PIN verification for sensitive actions.
 * PIN must be sent in request body as { pin: "123456" }.
 * Must be used AFTER protect().
 *
 * @param {boolean} required  if false, skip gate when user has no PIN set
 */
function requirePin(required = true) {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select('pin_hash');

      // If user has no PIN set and it's not strictly required, let through
      if (!user.pin_hash && !required) return next();

      if (!user.pin_hash) {
        return res.status(403).json({
          success: false,
          message: 'PIN not configured. Please set a PIN in settings.',
          data:    null,
          errors:  null,
        });
      }

      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({
          success: false,
          message: 'PIN is required for this action',
          data:    null,
          errors:  null,
        });
      }

      const valid = await verifyPassword(user.pin_hash, pin);

      await AuditLog.log({
        user_id:    req.user._id,
        action:     valid ? 'pin_verify' : 'pin_verify_failed',
        ip_address: getClientIP(req),
        user_agent: req.headers['user-agent'],
        success:    valid,
      });

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect PIN',
          data:    null,
          errors:  null,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}


// ─────────────────────────────────────────────
// 4. RATE LIMITERS
// ─────────────────────────────────────────────

/** Auth endpoints: 10 requests per 15 minutes per IP */
const authRateLimit = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Too many requests — please try again in 15 minutes',
    data:    null,
    errors:  null,
  },
  // Skip rate limit for test environment
  skip: () => process.env.NODE_ENV === 'test',
});

/** Global API rate limit: 100 requests per 15 minutes per IP */
const globalRateLimit = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              100,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Rate limit exceeded',
    data:    null,
    errors:  null,
  },
  skip: () => process.env.NODE_ENV === 'test',
});

/** Share link access: 20 requests per 15 minutes per IP */
const shareLinkRateLimit = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Too many access attempts for this link',
    data:    null,
    errors:  null,
  },
});

/**
 * Progressive slowdown on auth routes after 5 requests:
 * Each subsequent request adds 500ms delay (up to 10s max).
 */
const authSlowDown = slowDown({
  windowMs:        15 * 60 * 1000,
  delayAfter:      5,
  delayMs:         (used, req) => {
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  },
  maxDelayMs:      10_000,
  skip:            () => process.env.NODE_ENV === 'test',
  validate:        { delayMs: false },
});


// ─────────────────────────────────────────────
// 5. INPUT VALIDATION HANDLER
// ─────────────────────────────────────────────

/**
 * Run after express-validator chains.
 * Returns 400 with field-level errors if validation fails.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      data:    null,
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}


// ─────────────────────────────────────────────
// 6. MIME TYPE VALIDATION FOR FILE UPLOADS
// ─────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
]);

const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50) * 1024 * 1024;

/**
 * Validate uploaded file MIME type by inspecting file magic bytes.
 * Rejects files where declared Content-Type doesn't match actual bytes.
 * Must be used AFTER multer middleware.
 */
async function validateFileMime(req, res, next) {
  try {
    if (!req.file) return next();

    // Validate size
    if (req.file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 50}MB`,
        data:    null,
        errors:  null,
      });
    }

    // Detect actual MIME from magic bytes
    const detected = await fileType.fromBuffer(req.file.buffer);

    // For plain text files, file-type returns undefined — allow it
    const detectedMime = detected?.mime || 'text/plain';

    if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
      return res.status(400).json({
        success: false,
        message: 'File type not allowed',
        data:    null,
        errors:  [{ field: 'file', message: `${detectedMime} is not a supported file type` }],
      });
    }

    // Check declared MIME matches detected MIME
    if (detected && req.file.mimetype !== detectedMime) {
      return res.status(400).json({
        success: false,
        message: 'File content does not match declared file type',
        data:    null,
        errors:  null,
      });
    }

    // Overwrite multer's declared MIME with the verified one
    req.file.mimetype = detectedMime;
    next();
  } catch (err) {
    next(err);
  }
}


// ─────────────────────────────────────────────
// 7. CENTRALIZED ERROR HANDLER
// ─────────────────────────────────────────────

/**
 * Express error handling middleware (must have 4 params).
 * Maps known errors to appropriate HTTP status codes.
 * NEVER exposes stack traces or internal details in production.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = process.env.NODE_ENV === 'development';

  // Use winston logger
  logger.error(`[ERROR] ${err.name}: ${err.message}`, { 
    stack: err.stack,
    path: req.path,
    method: req.method 
  });

  // Mongoose: duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      data:    null,
      errors:  [{ field, message: `${field} already exists` }],
    });
  }

  // Mongoose: validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      data:    null,
      errors,
    });
  }

  // Mongoose: invalid ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(404).json({
      success: false,
      message: 'Resource not found',
      data:    null,
      errors:  null,
    });
  }

  // AES-GCM auth tag failure (data tampered)
  if (err.message && err.message.includes('unable to authenticate data')) {
    return res.status(422).json({
      success: false,
      message: 'File integrity check failed — data may be corrupted',
      data:    null,
      errors:  null,
    });
  }

  // JWT errors (shouldn't reach here normally but just in case)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      data:    null,
      errors:  null,
    });
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large',
      data:    null,
      errors:  null,
    });
  }

  // Default 500
  res.status(err.statusCode || 500).json({
    success: false,
    message: isDev ? err.message : 'An unexpected error occurred',
    data:    null,
    errors:  isDev ? [{ stack: err.stack }] : null,
  });
}


// ─────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────

/**
 * Extract real client IP, respecting proxy headers.
 * In production, ensure Express trust proxy is set correctly.
 */
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Async wrapper — catches errors in async route handlers
 * so you don't need try/catch in every controller.
 *
 * Usage: router.get('/route', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for missing routes.
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    data: null,
    errors: null,
  });
}



// ─────────────────────────────────────────────
// 8. JWT TOKEN GENERATION & COOKIE HELPERS
// ─────────────────────────────────────────────

const env = require('../config/env');

/**
 * Generate a short-lived JWT access token (15 min).
 * @param {string} userId  MongoDB _id as string
 * @returns {string} signed JWT
 */
function generateAccessToken(userId) {
  return jwt.sign(
    { sub: userId.toString(), type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

/**
 * Generate a long-lived JWT refresh token (7 days).
 * Only the HASH of this is stored in the DB.
 * @param {string} userId
 * @returns {string} signed JWT
 */
function generateRefreshToken(userId) {
  return jwt.sign(
    { sub: userId.toString(), type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

/**
 * Verify a refresh token and return decoded payload, or null on failure.
 * @param {string} token
 * @returns {object|null}
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
}

/**
 * Set both access and refresh token cookies on the response.
 * Access token: short-lived, readable by JS (needed for Authorization header).
 * Refresh token: httpOnly, not readable by JS (CSRF-safe long-term session).
 */
function setAuthCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';

  // Refresh token — httpOnly, secure in production
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });

  // Access token cookie (for convenience; frontend also uses Authorization header)
  res.cookie('access_token', accessToken, {
    httpOnly: false, // JS-readable so frontend can read and set Authorization header
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });
}

/**
 * Clear both auth cookies (on logout or password change).
 */
function clearAuthCookies(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = { httpOnly: true, secure: isProd, sameSite: isProd ? 'None' : 'Lax', path: '/' };
  res.clearCookie('refresh_token', opts);
  res.clearCookie('access_token', { ...opts, httpOnly: false });
}

// ─────────────────────────────────────────────
// 9. PASSWORD RESET TOKEN HELPERS
// ─────────────────────────────────────────────

const crypto = require('crypto');
const RESET_SECRET = process.env.JWT_ACCESS_SECRET; // reuse access secret for HMAC

/**
 * Generate a raw password reset token and its HMAC-SHA256 hash.
 * Only the hash is stored in the DB. Raw token goes in the email link.
 * @returns {{ rawToken: string, tokenHash: string }}
 */
function generatePasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto
    .createHmac('sha256', RESET_SECRET)
    .update(rawToken)
    .digest('hex');
  return { rawToken, tokenHash };
}

/**
 * Hash a raw reset token for DB lookup.
 * @param {string} rawToken
 * @returns {string} hex hash
 */
function hashPasswordResetToken(rawToken) {
  return crypto
    .createHmac('sha256', RESET_SECRET)
    .update(rawToken)
    .digest('hex');
}


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  // Auth
  protect,
  optionalAuth,
  restrictTo,
  requireOwnership,
  requirePin,
  initializePassport,

  // JWT & Cookies
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,

  // Password Reset
  generatePasswordResetToken,
  hashPasswordResetToken,

  // Rate limiting
  authRateLimit,
  globalRateLimit,
  shareLinkRateLimit,
  authSlowDown,

  // Validation
  handleValidationErrors,
  validateFileMime,

  // Error handling
  errorHandler,
  notFound,

  // Utilities
  getClientIP,
  asyncHandler,
};