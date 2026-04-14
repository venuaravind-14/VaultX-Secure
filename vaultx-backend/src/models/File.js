'use strict';

/**
 * @file File.js
 * @description Mongoose File model.
 * Stores metadata + encryption artifacts. Actual ciphertext is in GridFS.
 */

const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => require('uuid').v4(),
    },
    user_id: {
      type: String,
      ref: 'User',
      required: true,
      index: true,
    },
    original_name: {
      type: String,
      required: true,
      maxlength: 500,
    },
    mime_type: {
      type: String,
      required: true,
    },
    size_bytes: {
      type: Number,
      required: true,
    },
    /**
     * GridFS file ID of the AES-256-GCM encrypted ciphertext.
     * Cast as String to match our UUID-based IDs.
     */
    gridfs_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    /**
     * The File Encryption Key (FEK) encrypted with the user's Master Key.
     * Master Key is derived from the user's password via PBKDF2.
     * Stored as a hex string: iv(24chars) + ":" + encrypted_fek(hex)
     * The wrapping IV is prepended during encryption.
     */
    encrypted_fek: {
      type: String,
      required: true,
      select: false, // Only fetch when explicitly needed
    },
    /**
     * IV used during AES-256-GCM wrapping of the FEK.
     * 12 bytes = 24 hex chars.
     */
    wrap_iv: {
      type: String,
      required: true,
      select: false,
    },
    /**
     * GCM auth tag from FEK wrapping operation.
     * 16 bytes = 32 hex chars.
     */
    wrap_auth_tag: {
      type: String,
      required: true,
      select: false,
    },
    /**
     * Hex-encoded salt used to derive the master key that wrapped the FEK.
     * 32 bytes = 64 hex chars.
     */
    master_salt: {
      type: String,
      select: false,
    },
    /**
     * The IV used during AES-256-GCM encryption of the file content.
     * 12 bytes (24 hex chars). Stored as hex.
     */
    iv: {
      type: String,
      required: true,
      select: false,
    },
    /**
     * The GCM authentication tag produced during file encryption.
     * 16 bytes (32 hex chars). Must be verified during decryption.
     * Stored as hex.
     */
    auth_tag: {
      type: String,
      required: true,
      select: false,
    },
    /**
     * Soft delete flag. Files are never physically removed from DB
     * unless an admin purge is explicitly run.
     */
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    _id: false,
  }
);

// Compound index for user file listings
FileSchema.index({ user_id: 1, is_deleted: 1, created_at: -1 });

module.exports = mongoose.model('File', FileSchema);
