'use strict';

const express = require('express');
const passport = require('passport');
const router = express.Router();
const env = require('../config/env');

const {
  register, login, logout, refresh, getMe,
  changePassword, forgotPassword, resetPassword,
  setPin, verifyPin, googleCallback,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const { authLimiter, authSlowDown } = require('../middleware/rateLimit');
const {
  validateRegister, validateLogin, validateChangePassword,
  validateForgotPassword, validateResetPassword,
  validateSetPin, validateVerifyPin,
} = require('../middleware/validate');

// ── Public Routes (rate-limited) ───────────────────────────────────────────────
router.post('/register', authLimiter, authSlowDown, validateRegister, register);
router.post('/login',    authLimiter, authSlowDown, validateLogin,    login);
router.post('/refresh',  authLimiter, refresh);
router.post('/forgot-password', authLimiter, validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', authLimiter, validateResetPassword, resetPassword);

// ── Google OAuth ───────────────────────────────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
router.get(
  '/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
      if (err || !user) {
        const errorCode = err ? 'auth_failed' : (info ? info.message : 'auth_failed');
        return res.redirect(`${env.FRONTEND_URL}/login?error=${errorCode}`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  googleCallback
);

// ── Protected Routes ───────────────────────────────────────────────────────────
router.post('/logout',          protect, logout);
router.get('/me',               protect, getMe);
router.post('/change-password', protect, validateChangePassword, changePassword);
router.post('/set-pin',         protect, validateSetPin,   setPin);
router.post('/verify-pin',      protect, validateVerifyPin, verifyPin);

module.exports = router;
