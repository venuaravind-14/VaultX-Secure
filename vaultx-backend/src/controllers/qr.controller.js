'use strict';

/**
 * @file qr.controller.js
 * @description QR code generation and verification using signed JWTs.
 */

const { User, File, IDCard, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const { generateQRToken, verifyQRToken, generateQRImage } = require('../services/qrService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');

const audit = (action, userId, resourceId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId,
    action,
    resource_id: resourceId,
    resource_type: 'qr',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Generate QR ───────────────────────────────────────────────────────────────
const generateQR = asyncHandler(async (req, res) => {
  const { type, resource_id } = req.body;

  // Verify the resource exists and belongs to this user
  let resource;
  if (type === 'file') {
    resource = await File.findOne({
      _id: resource_id,
      user_id: req.user._id,
      is_deleted: false,
    }).select('original_name mime_type');
  } else if (type === 'idcard') {
    resource = await IDCard.findOne({
      _id: resource_id,
      user_id: req.user._id,
    }).select('card_type card_holder_name');
  }

  if (!resource) {
    return sendError(res, { statusCode: 404, message: `${type} not found` });
  }

  // Generate signed JWT (never embed raw IDs in QR)
  const token = generateQRToken(type, resource_id, req.user._id);
  const qrDataUrl = await generateQRImage(token);

  audit(AUDIT_ACTIONS.QR_GENERATE, req.user._id, resource_id, req, true, { type });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'QR code generated',
    data: {
      type,
      resource_id,
      qr_image: qrDataUrl,   // PNG data URL
      token,                   // JWT for programmatic use
      expires_in: type === 'file' ? '5 minutes' : '24 hours',
    },
  });
});

// ── Verify QR (Public Scan Endpoint) ─────────────────────────────────────────
const verifyQR = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const decoded = verifyQRToken(token);
  if (!decoded) {
    audit(AUDIT_ACTIONS.QR_SCAN, null, null, req, false, { reason: 'invalid_or_expired_token' });
    return sendError(res, { statusCode: 401, message: 'Invalid or expired QR code' });
  }

  const { type, resource_id } = decoded;

  // Fetch resource metadata (non-sensitive, public-facing on scan)
  let resourceData = null;
  if (type === 'file') {
    const file = await File.findOne({ _id: resource_id, is_deleted: false })
      .select('original_name mime_type size_bytes created_at');
    if (file) {
      resourceData = {
        type: 'file',
        name: file.original_name,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        added_at: file.created_at,
      };
    }
  } else if (type === 'idcard') {
    const card = await IDCard.findById(resource_id)
      .select('card_type card_holder_name issuer expiry_date');
    if (card) {
      resourceData = {
        type: 'idcard',
        card_type: card.card_type,
        holder: card.card_holder_name,
        issuer: card.issuer,
        expiry_date: card.expiry_date,
        is_expired: card.expiry_date < new Date(),
      };
    }
  }

  if (!resourceData) {
    audit(AUDIT_ACTIONS.QR_SCAN, null, resource_id, req, false, { reason: 'resource_not_found' });
    return sendError(res, { statusCode: 404, message: 'Resource not found' });
  }

  audit(AUDIT_ACTIONS.QR_SCAN, null, resource_id, req, true, { type });

  return sendSuccess(res, {
    message: 'QR code verified successfully',
    data: { verified: true, resource: resourceData },
  });
});

module.exports = { generateQR, verifyQR };
