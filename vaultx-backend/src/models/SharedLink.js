'use strict';

/**
 * @file SharedLink.js
 * @description Mongoose model for HMAC-signed temporary share links.
 */

const mongoose = require('mongoose');

const SharedLinkSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => require('uuid').v4(),
    },
    file_id: {
      type: String,
      ref: 'File',
      required: true,
      index: true,
    },
    user_id: {
      type: String,
      ref: 'User',
      required: true,
      index: true,
    },
    /**
     * argon2id hash of the actual HMAC token.
     * The plaintext token is returned ONCE on creation and NEVER stored.
     */
    token_hash: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * Optional: argon2id hash of a password protecting this share link.
     * If null, no password is required.
     */
    password_hash: {
      type: String,
      default: null,
      select: false,
    },
    /**
     * ISO timestamp at which this link expires.
     * Access is denied if Date.now() > expiry_at.
     */
    expiry_at: {
      type: Date,
      required: true,
      index: true,
    },
    /**
     * Maximum number of times this link can be used to download the file.
     * -1 means unlimited (not recommended for production).
     */
    download_limit: {
      type: Number,
      required: true,
      min: -1,
      default: 1,
    },
    /**
     * Current download count. Atomically incremented on each successful access.
     */
    download_count: {
      type: Number,
      default: 0,
    },
    /**
     * Admin/user revocation flag. Revoked links are permanently denied.
     */
    is_revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
    },
    updatedAt: false,
    _id: false,
  }
);

// TTL index: automatically removes expired links from DB after 24h past expiry
SharedLinkSchema.index({ expiry_at: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('SharedLink', SharedLinkSchema);
