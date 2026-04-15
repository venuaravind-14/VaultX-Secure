'use strict';

/**
 * @file validate.js
 * @description Centralized input validation rules using express-validator.
 * Each exported validator is an array of validation chains + the handler.
 */

const { body, param, query, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

// ── Validation Error Handler ───────────────────────────────────────────────────
/**
 * Reads validation results and short-circuits with 400 if errors exist.
 * Must be the LAST item in every validation array.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, {
      statusCode: 400,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Password Strength Rule (reusable) ─────────────────────────────────────────
const passwordStrengthRule = (field = 'password') =>
  body(field)
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one digit')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain at least one special character');

// ── Auth Validators ────────────────────────────────────────────────────────────
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  passwordStrengthRule('password'),
  handleValidationErrors,
];

const validateLogin = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

const validateChangePassword = [
  body('oldPassword').notEmpty().withMessage('Current password is required'),
  passwordStrengthRule('newPassword'),
  handleValidationErrors,
];

const validateUnlockVault = [
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

const validateForgotPassword = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  handleValidationErrors,
];

const validateResetPassword = [
  param('token').notEmpty().withMessage('Reset token is required'),
  passwordStrengthRule('new_password'),
  handleValidationErrors,
];


// ── ID Card Validators ─────────────────────────────────────────────────────────
const validateCreateIDCard = [
  body('card_type')
    .isIn(['student', 'employee', 'driver_license', 'passport', 'national_id', 'other'])
    .withMessage('card_type must be one of: student, employee, driver_license, passport, national_id, other'),
  body('card_holder_name').trim().notEmpty().withMessage('card_holder_name is required').isLength({ max: 200 }),
  body('card_number').trim().notEmpty().withMessage('card_number is required').isLength({ max: 100 }),
  body('issuer').trim().notEmpty().withMessage('issuer is required').isLength({ max: 200 }),
  body('expiry_date').isISO8601().withMessage('expiry_date must be a valid ISO 8601 date'),
  handleValidationErrors,
];

const validateUpdateIDCard = [
  param('id').notEmpty().withMessage('Card ID is required'),
  body('card_holder_name').optional().trim().isLength({ max: 200 }),
  body('card_number').optional().trim().isLength({ max: 100 }),
  body('issuer').optional().trim().isLength({ max: 200 }),
  body('expiry_date').optional().isISO8601().withMessage('expiry_date must be a valid ISO 8601 date'),
  handleValidationErrors,
];

// ── Sharing Validators ─────────────────────────────────────────────────────────
const validateCreateShareLink = [
  body('file_id').notEmpty().withMessage('file_id is required'),
  body('expiry_hours')
    .isInt({ min: 1, max: 720 })
    .withMessage('expiry_hours must be between 1 and 720 (30 days)'),
  body('download_limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('download_limit must be between 1 and 100'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Share link password must be at least 8 characters'),
  handleValidationErrors,
];

const validateAccessShareLink = [
  param('token').notEmpty().withMessage('Share token is required'),
  handleValidationErrors,
];

// ── QR Validators ──────────────────────────────────────────────────────────────
const validateGenerateQR = [
  body('type').isIn(['file', 'idcard']).withMessage('type must be "file" or "idcard"'),
  body('resource_id').notEmpty().withMessage('resource_id is required'),
  handleValidationErrors,
];

// ── Pagination Validators ──────────────────────────────────────────────────────
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateUnlockVault,
  validateForgotPassword,
  validateResetPassword,
  validateCreateIDCard,
  validateUpdateIDCard,
  validateCreateShareLink,
  validateAccessShareLink,
  validateGenerateQR,
  validatePagination,
};
