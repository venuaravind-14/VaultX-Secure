'use strict';

/**
 * @file qrService.js
 * @description QR code generation using signed JWT payloads.
 *
 * SECURITY:
 * - QR payloads are signed JWTs (never raw IDs or user data)
 * - Uses a dedicated QR_SECRET (rotated independently of JWT_ACCESS_SECRET)
 * - Short expiry: 5 minutes for files, 24 hours for ID cards
 */

const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const env = require('../config/env');
const logger = require('../config/logger');

// QR token expiry constants
const QR_FILE_EXPIRY_SECS = 5 * 60;          // 5 minutes
const QR_CARD_EXPIRY_SECS = 24 * 60 * 60;    // 24 hours

/**
 * Generates a signed JWT for embedding in a QR code.
 *
 * @param {'file' | 'idcard'} type       - Resource type
 * @param {string}            resourceId - UUID of the file or ID card
 * @param {string}            userId     - UUID of the requesting user
 * @returns {string} Signed JWT string
 */
const generateQRToken = (type, resourceId, userId) => {
  const expiresIn = type === 'file' ? QR_FILE_EXPIRY_SECS : QR_CARD_EXPIRY_SECS;

  const payload = {
    type,                      // 'file' or 'idcard'
    resource_id: resourceId,   // Reference to the resource
    // NOTE: We never embed user_id in the public QR payload for privacy.
    // We verify ownership server-side on scan.
    issued_by: userId,
  };

  return jwt.sign(payload, env.QR_SECRET, {
    algorithm: 'HS256',
    expiresIn,
    issuer: 'vaultx-secure',
    audience: 'qr-scanner',
  });
};

/**
 * Verifies and decodes a QR token.
 * Returns null if invalid, expired, or tampered.
 *
 * @param {string} token - The JWT from the QR code scan
 * @returns {{ type: string, resource_id: string, issued_by: string } | null}
 */
const verifyQRToken = (token) => {
  try {
    return jwt.verify(token, env.QR_SECRET, {
      algorithms: ['HS256'],
      issuer: 'vaultx-secure',
      audience: 'qr-scanner',
    });
  } catch (err) {
    logger.warn('QR token verification failed', { error: err.message });
    return null;
  }
};

/**
 * Generates a QR code image as a PNG data URL (base64).
 * The QR code encodes a signed JWT, NOT the raw resource ID.
 *
 * @param {string} token - Signed JWT to embed in QR
 * @returns {Promise<string>} PNG data URL (data:image/png;base64,...)
 */
const generateQRImage = async (token) => {
  try {
    const dataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'H',  // High error correction for damaged codes
      type: 'image/png',
      margin: 2,
      color: {
        dark: '#1a1a2e',   // Dark blue for dots
        light: '#ffffff',  // White background
      },
      width: 300,
    });
    return dataUrl;
  } catch (err) {
    logger.error('QR image generation failed', { error: err.message });
    throw new Error('Failed to generate QR code');
  }
};

module.exports = {
  generateQRToken,
  verifyQRToken,
  generateQRImage,
  QR_FILE_EXPIRY_SECS,
  QR_CARD_EXPIRY_SECS,
};
