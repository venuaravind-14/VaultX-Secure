'use strict';

/**
 * @file auth.controller.js
 * @description Authentication controller — delegates business logic to AuthService.
 */

const { User, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} = require('../middleware/auth');
const { hashPassword } = require('../services/cryptoService');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const authService = require('../services/auth.service');

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

  try {
    const user = await authService.registerUser({ name, email, password });
    
    audit(AUDIT_ACTIONS.REGISTER, user._id, req, true, { email });
    sendWelcomeEmail(email, name);

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refresh_token_hash = await hashPassword(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Secure account created successfully',
      data: { user: user.toJSON(), access_token: accessToken },
    });
  } catch (err) {
    if (err.message === 'ALREADY_EXISTS') {
      return sendError(res, { statusCode: 409, message: 'An account with this email already exists' });
    }
    throw err;
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await authService.validateCredentials(email, password);
    
    if (!user) {
      audit(AUDIT_ACTIONS.LOGIN_FAIL, null, req, false, { email, reason: 'invalid_credentials' });
      return sendError(res, { statusCode: 401, message: 'Invalid email or password' });
    }

    audit(AUDIT_ACTIONS.LOGIN, user._id, req, true);

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refresh_token_hash = await hashPassword(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, {
      message: 'Login successful',
      data: { user: user.toJSON(), access_token: accessToken },
    });
  } catch (err) {
    if (err.message === 'ACCOUNT_LOCKED') {
      audit(AUDIT_ACTIONS.LOGIN_FAIL, null, req, false, { email, reason: 'account_locked' });
      return sendError(res, { 
        statusCode: 423, 
        message: 'Account temporarily locked due to many failed attempts. Try again in 15 minutes.' 
      });
    }
    throw err;
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { refresh_token_hash: null });
    audit(AUDIT_ACTIONS.LOGOUT, req.user._id, req, true);
  }
  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Logged out successfully' });
});

// ── Token Refresh ─────────────────────────────────────────────────────────────
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refresh_token || req.body?.refresh_token;

  if (!token) return sendError(res, { statusCode: 401, message: 'Refresh token required' });

  const decoded = verifyRefreshToken(token);
  if (!decoded) return sendError(res, { statusCode: 401, message: 'Invalid or expired' });

  const user = await User.findById(decoded.sub).select('+refresh_token_hash');
  if (!user || !user.refresh_token_hash) return sendError(res, { statusCode: 401, message: 'Session expired' });

  // Rotate tokens logic simplified in controller, ideally could move to service too
  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);
  const newRefreshHash = await hashPassword(newRefreshToken);

  await User.findByIdAndUpdate(user._id, { refresh_token_hash: newRefreshHash });
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
  const { oldPassword, newPassword } = req.body;

  try {
    await authService.changeUserPassword(req.user._id, oldPassword, newPassword);
    audit(AUDIT_ACTIONS.PASSWORD_CHANGED, req.user._id, req, true);
    return sendSuccess(res, { message: 'Password changed successfully' });
  } catch (err) {
    if (err.message === 'INVALID_CURRENT_PASSWORD') {
      audit(AUDIT_ACTIONS.PASSWORD_CHANGE_FAIL, req.user._id, req, false);
      return sendError(res, { statusCode: 401, message: 'Invalid current password' });
    }
    throw err;
  }
});

// ── Forgot Password ───────────────────────────────────────────────────────────
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const successMsg = 'If an account exists, a reset link has been sent.';

  const result = await authService.initiatePasswordReset(email);
  if (result) {
    audit(AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, null, req, true, { email });
    await sendPasswordResetEmail(email, result.rawToken, result.name);
  }

  return sendSuccess(res, { message: successMsg });
});

// ── Reset Password ────────────────────────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { new_password } = req.body;

  try {
    const user = await authService.completePasswordReset(token, new_password);
    audit(AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED, user._id, req, true);
    return sendSuccess(res, { message: 'Password reset successfully' });
  } catch (err) {
    return sendError(res, { statusCode: 400, message: 'Invalid or expired token' });
  }
});

// ── Unlock Vault ──────────────────────────────────────────────────────────────
const unlockVault = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const vaultToken = await authService.unlockVault(req.user._id, password);
  audit(vaultToken ? AUDIT_ACTIONS.VAULT_UNLOCK : AUDIT_ACTIONS.VAULT_UNLOCK_FAILED, req.user._id, req, !!vaultToken);

  if (!vaultToken) {
    return sendError(res, { statusCode: 401, message: 'Incorrect password' });
  }

  return sendSuccess(res, { 
    message: 'Vault unlocked',
    data: { vault_token: vaultToken }
  });
});

// ── Google OAuth Callback ─────────────────────────────────────────────────────
const googleCallback = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) return sendError(res, { statusCode: 401, message: 'OAuth failed' });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  const refreshTokenHash = await hashPassword(refreshToken);

  await User.findByIdAndUpdate(user._id, { refresh_token_hash: refreshTokenHash });
  audit(AUDIT_ACTIONS.GOOGLE_OAUTH, user._id, req, true);
  setAuthCookies(res, accessToken, refreshToken);

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
  googleCallback,
  unlockVault,
};
