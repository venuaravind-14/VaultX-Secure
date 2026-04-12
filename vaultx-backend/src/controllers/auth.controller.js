'use strict';

/**
 * @file auth.controller.js
 * @description Authentication controller — register, login, refresh, OAuth, PIN, password reset.
 */

const argon2 = require('argon2');
const crypto = require('crypto');
const { User, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} = require('../middleware/auth');
const {
  hashPassword,
  verifyPassword,
  generateSalt,
} = require('../services/cryptoService');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const logger = require('../config/logger');

// Lockout policy constants (moved from model logic to controller for explicit control)
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ── Audit Helper ───────────────────────────────────────────────────────────────
const audit = (action, userId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId || null,
    action,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Register ──────────────────────────────────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Check for duplicate email
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return sendError(res, { statusCode: 409, message: 'An account with this email already exists' });
  }

  // Hash password with argon2id via cryptoService
  const password_hash = await hashPassword(password);

  // Generate PBKDF2 salt for future master key derivations
  const pbkdf2_salt = await generateSalt();

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password_hash,
    pbkdf2_salt,
    is_verified: false,
  });

  audit(AUDIT_ACTIONS.REGISTER, user._id, req, true, { email });
  sendWelcomeEmail(email, name); // Non-blocking

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Store hashed refresh token in DB
  const refreshTokenHash = await hashPassword(refreshToken);
  await User.findByIdAndUpdate(user._id, { refresh_token_hash: refreshTokenHash });

  setAuthCookies(res, accessToken, refreshToken);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Account created successfully',
    data: {
      user: user.toJSON(),
      access_token: accessToken,
    },
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Fetch user WITH sensitive fields explicitly
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password_hash +failed_login_attempts +locked_until +refresh_token_hash');

  // ── Account Lockout Check ──────────────────────────────────────────────────
  if (user && user.locked_until && user.locked_until > new Date()) {
    audit(AUDIT_ACTIONS.LOGIN_FAILED, user._id, req, false, { reason: 'account_locked' });
    return sendError(res, {
      statusCode: 401,
      message: `Account locked. Try again after ${user.locked_until.toISOString()}`,
    });
  }

  // ── Constant-Time Password Verification ───────────────────────────────────
  // We always run argon2.verify even if user doesn't exist to prevent timing attacks.
  // A dummy hash is used for non-existent accounts.
  const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$dummysalt12345678901234$dummyhash123456789012345678901234567';
  const hashToVerify = user ? user.password_hash : DUMMY_HASH;

  let passwordValid = false;
  try {
    passwordValid = await verifyPassword(hashToVerify, password);
  } catch {
    passwordValid = false;
  }

  if (!user || !passwordValid) {
    // Increment failed attempts if user exists
    if (user) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const updateData = { failed_login_attempts: newAttempts };

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS);
        updateData.failed_login_attempts = 0;
        audit(AUDIT_ACTIONS.ACCOUNT_LOCKED, user._id, req, false, {
          locked_until: updateData.locked_until,
        });
      } else {
        audit(AUDIT_ACTIONS.LOGIN_FAILED, user._id, req, false, {
          attempts: newAttempts,
        });
      }

      await User.findByIdAndUpdate(user._id, updateData);
    }

    // Generic message to prevent user enumeration
    return sendError(res, { statusCode: 401, message: 'Invalid email or password' });
  }

  // ── Successful Login ───────────────────────────────────────────────────────
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Hash + store new refresh token, reset lockout counters
  const refreshTokenHash = await hashPassword(refreshToken);
  await User.findByIdAndUpdate(user._id, {
    refresh_token_hash: refreshTokenHash,
    failed_login_attempts: 0,
    locked_until: null,
  });

  audit(AUDIT_ACTIONS.LOGIN, user._id, req, true);
  setAuthCookies(res, accessToken, refreshToken);

  return sendSuccess(res, {
    message: 'Login successful',
    data: {
      user: user.toJSON(),
      access_token: accessToken,
    },
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  // Invalidate refresh token in DB
  await User.findByIdAndUpdate(req.user._id, { refresh_token_hash: null });
  audit(AUDIT_ACTIONS.LOGOUT, req.user._id, req, true);
  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Logged out successfully' });
});

// ── Token Refresh ─────────────────────────────────────────────────────────────
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refresh_token || req.body?.refresh_token;

  if (!token) {
    return sendError(res, { statusCode: 401, message: 'Refresh token required' });
  }

  const decoded = verifyRefreshToken(token);
  if (!decoded) {
    return sendError(res, { statusCode: 401, message: 'Invalid or expired refresh token' });
  }

  const user = await User.findById(decoded.sub).select('+refresh_token_hash');
  if (!user || !user.refresh_token_hash) {
    return sendError(res, { statusCode: 401, message: 'Session not found. Please login again.' });
  }

  // Verify the stored hash matches the provided token
  const isValid = await verifyPassword(user.refresh_token_hash, token);
  if (!isValid) {
    // Possible token theft — invalidate all sessions for this user
    await User.findByIdAndUpdate(user._id, { refresh_token_hash: null });
    logger.warn('Potential refresh token reuse detected', { userId: user._id, ip: req.ip });
    return sendError(res, { statusCode: 401, message: 'Invalid session. Please login again.' });
  }

  // Rotate: generate new pair, invalidate old refresh token
  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);
  const newRefreshHash = await hashPassword(newRefreshToken);

  await User.findByIdAndUpdate(user._id, { refresh_token_hash: newRefreshHash });
  audit(AUDIT_ACTIONS.TOKEN_REFRESHED, user._id, req, true);
  setAuthCookies(res, newAccessToken, newRefreshToken);

  return sendSuccess(res, {
    message: 'Token refreshed',
    data: { access_token: newAccessToken },
  });
});

// ── Get Current User ──────────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, { data: { user: req.user.toJSON() } });
});

// ── Change Password ───────────────────────────────────────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const user = await User.findById(req.user._id).select('+password_hash +pbkdf2_salt');

  if (!user.password_hash) {
    return sendError(res, {
      statusCode: 400,
      message: 'Your account uses Google sign-in. Set a password in account settings first.',
    });
  }

  const isValid = await verifyPassword(user.password_hash, current_password);
  if (!isValid) {
    audit(AUDIT_ACTIONS.PASSWORD_CHANGED, user._id, req, false, { reason: 'wrong_current_password' });
    return sendError(res, { statusCode: 401, message: 'Current password is incorrect' });
  }

  const new_password_hash = await hashPassword(new_password);
  // Regenerate PBKDF2 salt — ensures old FEKs can't be decrypted with new password
  const new_pbkdf2_salt = await generateSalt();

  await User.findByIdAndUpdate(user._id, {
    password_hash: new_password_hash,
    pbkdf2_salt: new_pbkdf2_salt,
    refresh_token_hash: null, // Force re-login after password change
  });

  audit(AUDIT_ACTIONS.PASSWORD_CHANGED, user._id, req, true);
  clearAuthCookies(res);

  return sendSuccess(res, { message: 'Password changed. Please login again with your new password.' });
});

// ── Forgot Password ───────────────────────────────────────────────────────────
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Always return 200 to prevent email enumeration
  const successResponse = () =>
    sendSuccess(res, {
      message: 'If an account with that email exists, a reset link has been sent.',
    });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return successResponse();

  const { rawToken, tokenHash } = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await User.findByIdAndUpdate(user._id, {
    password_reset_token_hash: tokenHash,
    password_reset_expires: expiresAt,
  });

  audit(AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, user._id, req, true);

  try {
    await sendPasswordResetEmail(email, rawToken, user.name);
  } catch {
    // Email failure logged internally — don't expose to client
  }

  return successResponse();
});

// ── Reset Password ────────────────────────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res) => {
  const { token: rawToken } = req.params;
  const { new_password } = req.body;

  const tokenHash = hashPasswordResetToken(rawToken);

  const user = await User.findOne({
    password_reset_token_hash: tokenHash,
    password_reset_expires: { $gt: new Date() }, // Token not expired
  }).select('+password_reset_token_hash +password_reset_expires');

  if (!user) {
    return sendError(res, { statusCode: 400, message: 'Invalid or expired reset token' });
  }

  const new_password_hash = await hashPassword(new_password);
  const new_pbkdf2_salt = await generateSalt();

  // Consume token (single-use) and update password
  await User.findByIdAndUpdate(user._id, {
    password_hash: new_password_hash,
    pbkdf2_salt: new_pbkdf2_salt,
    password_reset_token_hash: null, // Invalidate after use
    password_reset_expires: null,
    refresh_token_hash: null,        // Force re-login
  });

  audit(AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED, user._id, req, true);

  return sendSuccess(res, { message: 'Password reset successful. Please login with your new password.' });
});

// ── Set PIN ───────────────────────────────────────────────────────────────────
const setPin = asyncHandler(async (req, res) => {
  const { pin } = req.body;

  const pinHash = await hashPassword(pin);
  await User.findByIdAndUpdate(req.user._id, { pin_hash: pinHash });

  audit(AUDIT_ACTIONS.PIN_SET, req.user._id, req, true);
  return sendSuccess(res, { message: 'PIN set successfully' });
});

// ── Verify PIN ────────────────────────────────────────────────────────────────
const verifyPin = asyncHandler(async (req, res) => {
  const { pin } = req.body;

  const user = await User.findById(req.user._id).select('+pin_hash');
  if (!user.pin_hash) {
    return sendError(res, { statusCode: 400, message: 'No PIN has been set for this account' });
  }

  const isValid = await verifyPassword(user.pin_hash, pin);
  audit(AUDIT_ACTIONS.PIN_VERIFIED, req.user._id, req, isValid);

  if (!isValid) {
    return sendError(res, { statusCode: 401, message: 'Incorrect PIN' });
  }

  return sendSuccess(res, { message: 'PIN verified successfully' });
});

// ── Google OAuth Callback Handler ─────────────────────────────────────────────
const googleCallback = asyncHandler(async (req, res) => {
  const user = req.user; // Set by Passport strategy
  if (!user) {
    return sendError(res, { statusCode: 401, message: 'Google authentication failed' });
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  const refreshTokenHash = await hashPassword(refreshToken);

  await User.findByIdAndUpdate(user._id, { refresh_token_hash: refreshTokenHash });
  audit(AUDIT_ACTIONS.GOOGLE_OAUTH, user._id, req, true);
  setAuthCookies(res, accessToken, refreshToken);

  // Redirect to frontend with access token in query (temporary, frontend should store in memory)
  return res.redirect(`${env.FRONTEND_URL}/oauth-callback?token=${accessToken}`);
});

module.exports = {
  register,
  login,
  logout,
  refresh,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  setPin,
  verifyPin,
  googleCallback,
};
