'use strict';

/**
 * @file AuditLog.js
 * @description Immutable audit log for all sensitive security events.
 * Records are never updated or deleted — append-only.
 */

const mongoose = require('mongoose');

// Valid action types for type safety and IDE autocomplete
const AUDIT_ACTIONS = Object.freeze({
  REGISTER: 'register',
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  TOKEN_REFRESHED: 'token_refreshed',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  PIN_SET: 'pin_set',
  PIN_VERIFIED: 'pin_verify',
  FILE_UPLOAD: 'file_upload',
  FILE_DOWNLOAD: 'file_download',
  FILE_DELETE: 'file_delete',
  SHARE_CREATE: 'share_create',
  SHARE_ACCESS: 'share_access',
  SHARE_REVOKE: 'share_revoke',
  QR_GENERATE: 'qr_generate',
  QR_SCAN: 'qr_scan',
  ACCOUNT_LOCKED: 'account_locked',
  GOOGLE_OAUTH: 'google_oauth',
});

const AuditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      ref: 'User',
      // Nullable for unauthenticated actions like failed logins
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(AUDIT_ACTIONS),
      required: true,
      index: true,
    },
    resource_id: {
      type: String,
      default: null,
    },
    resource_type: {
      type: String,
      enum: ['user', 'file', 'idcard', 'shared_link', 'qr', null],
      default: null,
    },
    ip_address: {
      type: String,
      required: true,
    },
    user_agent: {
      type: String,
      default: '',
    },
    success: {
      type: Boolean,
      required: true,
    },
    /**
     * Arbitrary metadata (e.g., reason for failure, file name, etc.)
     * Avoid logging sensitive data like passwords or tokens here.
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    // No timestamps helpers — we use a manual timestamp for immutability clarity
    timestamps: false,
    // Disable _id override to use ObjectId (standard for audit logs)
  }
);

// Compound index for user log retrieval
AuditLogSchema.index({ user_id: 1, timestamp: -1 });
// TTL: automatically delete audit logs older than 1 year (365 days)
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = {
  AuditLog: mongoose.model('AuditLog', AuditLogSchema),
  AUDIT_ACTIONS,
};
