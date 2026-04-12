'use strict';

/**
 * @file User.js
 * @description Mongoose User model with security-focused fields.
 */

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => require('uuid').v4(),
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
      index: true,
    },
    password_hash: {
      type: String,
      // Not required — Google OAuth users may not have a password
      select: false, // Never returned in queries by default
    },
    google_id: {
      type: String,
      sparse: true,
      index: true,
    },
    pin_hash: {
      type: String,
      select: false,
    },
    /**
     * Per-user PBKDF2 salt for Master Key derivation.
     * Used to derive the Master Key (MEK) from the user's password.
     * Store as hex string.
     */
    pbkdf2_salt: {
      type: String,
      select: false,
    },
    /**
     * Hashed refresh token — stored as argon2id hash.
     * The actual token is rotated on every use.
     */
    refresh_token_hash: {
      type: String,
      select: false,
    },
    /**
     * Consecutive failed login count — reset on successful login.
     * Account locked when this reaches 5.
     */
    failed_login_attempts: {
      type: Number,
      default: 0,
    },
    /**
     * If set and in the future, all login attempts are rejected.
     * Cleared on successful login after lockout expires.
     */
    locked_until: {
      type: Date,
      default: null,
    },
    /**
     * Email verification status.
     * Unverified users have limited capabilities.
     */
    is_verified: {
      type: Boolean,
      default: false,
    },
    /**
     * Role-based access for future admin features.
     */
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    /**
     * One-time password reset token (HMAC-signed, hashed before storage).
     * Expires after 10 minutes. Single-use.
     */
    password_reset_token_hash: {
      type: String,
      select: false,
    },
    password_reset_expires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // Prevent mongoose from converting _id to ObjectId
    _id: false,
  }
);

// Index for lockout queries
UserSchema.index({ locked_until: 1 });

// Hide sensitive fields from JSON serialization
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.pin_hash;
  delete obj.refresh_token_hash;
  delete obj.password_reset_token_hash;
  delete obj.password_reset_expires;
  delete obj.pbkdf2_salt;
  delete obj.failed_login_attempts;
  delete obj.locked_until;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
