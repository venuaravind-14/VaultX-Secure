'use strict';

/**
 * @file IDCard.js
 * @description Mongoose model for digital ID cards stored in the vault.
 */

const mongoose = require('mongoose');

const IDCardSchema = new mongoose.Schema(
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
    card_type: {
      type: String,
      enum: ['student', 'bus', 'employee', 'other'],
      required: true,
    },
    card_holder_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    card_number: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    issuer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    expiry_date: {
      type: Date,
      required: true,
    },
    /**
     * Optional: GridFS ID of an uploaded card image.
     * The image is encrypted using the same AES-256-GCM approach.
     */
    card_image_gridfs_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    /**
     * Encryption metadata for the card image (if uploaded).
     */
    card_image_encrypted_fek: {
      type: String,
      select: false,
    },
    card_image_iv: {
      type: String,
      select: false,
    },
    card_image_auth_tag: {
      type: String,
      select: false,
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

IDCardSchema.index({ user_id: 1, card_type: 1 });

module.exports = mongoose.model('IDCard', IDCardSchema);
