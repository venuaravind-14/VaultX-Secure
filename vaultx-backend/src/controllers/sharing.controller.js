'use strict';

/**
 * @file sharing.controller.js
 * @description Secure file sharing with HMAC-signed tokens, download limits, expiry, and optional passwords.
 */

const argon2 = require('argon2');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { User, File, SharedLink, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const { 
  generateShareToken, 
  hashShareToken,
  unwrapFEK, 
  decryptStream,
  hashPassword,
  verifyPassword
} = require('../services/cryptoService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const logger = require('../config/logger');

// Argon2 options are handled centrally in cryptoService.js

const getBucket = () =>
  new GridFSBucket(mongoose.connection.db, { bucketName: 'encrypted_files' });

const audit = (action, userId, resourceId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId,
    action,
    resource_id: resourceId,
    resource_type: 'shared_link',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Create Share Link ─────────────────────────────────────────────────────────
const createShareLink = asyncHandler(async (req, res) => {
  const { file_id, expiry_hours, download_limit = 1, password } = req.body;

  // Verify file ownership
  const file = await File.findOne({ _id: file_id, user_id: req.user._id, is_deleted: false });
  if (!file) {
    return sendError(res, { statusCode: 404, message: 'File not found' });
  }

  const expiryMs = parseInt(expiry_hours) * 60 * 60 * 1000;
  const expiryAt = new Date(Date.now() + expiryMs);

  // Generate HMAC token via cryptoService
  const { rawToken, tokenHash } = await generateShareToken();

  // Hash password if provided
  let password_hash = null;
  if (password) {
    password_hash = await hashPassword(password);
  }

  const shareLink = await SharedLink.create({
    file_id,
    user_id: req.user._id,
    token_hash: tokenHash,
    password_hash,
    expiry_at: expiryAt,
    download_limit,
    is_password_protected: !!password,
  });

  audit(AUDIT_ACTIONS.SHARE_CREATE, req.user._id, shareLink._id, req, true, {
    file_id,
    expiry_at: expiryAt,
    download_limit,
    password_protected: !!password,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Share link created',
    data: {
      share_id: shareLink._id,
      // Raw token returned ONCE — never stored in plaintext
      token: rawToken,
      access_url: `${env.FRONTEND_URL}/share/${rawToken}?link_id=${shareLink._id}`,
      expiry_at: expiryAt,
      download_limit,
      password_protected: !!password,
    },
  });
});

// ── List User's Share Links ───────────────────────────────────────────────────
const listShareLinks = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);

  const [links, total] = await Promise.all([
    SharedLink.find({ user_id: req.user._id })
      .select('-token_hash -password_hash')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SharedLink.countDocuments({ user_id: req.user._id }),
  ]);

  return sendSuccess(res, {
    data: { links, pagination: { total, page, limit, pages: Math.ceil(total / limit) } },
  });
});

// ── Revoke Share Link ─────────────────────────────────────────────────────────
const revokeShareLink = asyncHandler(async (req, res) => {
  const link = await SharedLink.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user._id },
    { is_revoked: true },
    { new: true }
  );

  if (!link) {
    return sendError(res, { statusCode: 404, message: 'Share link not found' });
  }

  audit(AUDIT_ACTIONS.SHARE_REVOKE, req.user._id, link._id, req, true);
  return sendSuccess(res, { message: 'Share link revoked' });
});

// ── Access Share Link (Public) ────────────────────────────────────────────────
const accessShareLink = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Find ALL non-revoked links (we verify token content below)
  // We cannot query by token directly since we store only a hash
  // Instead, use the token itself to find the record by brute-forcing is not feasible.
  // Best practice: include the link ID in the URL so we can look up the record.
  // Format: GET /sharing/access/:linkId?token=<hmac>
  const linkId = req.query.link_id;
  if (!linkId) {
    return sendError(res, { statusCode: 400, message: 'link_id query parameter required' });
  }

  const link = await SharedLink.findById(linkId)
    .select('+token_hash +password_hash');

  if (!link) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS, null, linkId, req, false, { reason: 'not_found' });
    return sendError(res, { statusCode: 404, message: 'Share link not found' });
  }

  // ── Check: Revoked ────────────────────────────────────────────────────────
  if (link.is_revoked) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, false, { reason: 'revoked' });
    return sendError(res, { statusCode: 403, message: 'This share link has been revoked' });
  }

  // ── Check: Expired ────────────────────────────────────────────────────────
  if (link.expiry_at < new Date()) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, false, { reason: 'expired' });
    return sendError(res, { statusCode: 410, message: 'This share link has expired' });
  }

  // ── Check: Download Limit ─────────────────────────────────────────────────
  if (link.download_limit !== -1 && link.download_count >= link.download_limit) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, false, { reason: 'limit_reached' });
    return sendError(res, { statusCode: 410, message: 'Download limit reached for this link' });
  }

  // ── Verify HMAC Token ─────────────────────────────────────────────────────
  // Compute hash of provided raw token and compare with stored hash
  const computedHash = hashShareToken(token);
  if (computedHash !== link.token_hash) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, false, { reason: 'invalid_token' });
    return sendError(res, { statusCode: 401, message: 'Invalid share token' });
  }

  // ── Check: Password ───────────────────────────────────────────────────────
  if (link.password_hash) {
    if (!password) {
      return sendError(res, { statusCode: 401, message: 'Password required to access this link' });
    }
    const isPasswordValid = await verifyPassword(link.password_hash, password);
    if (!isPasswordValid) {
      audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, false, { reason: 'wrong_password' });
      return sendError(res, { statusCode: 401, message: 'Incorrect share link password' });
    }
  }

  // ── Decrypt and Stream File ───────────────────────────────────────────────
  const file = await File.findOne({ _id: link.file_id, is_deleted: false })
    .select('+encrypted_fek +wrap_iv +wrap_auth_tag +iv +auth_tag');

  if (!file) {
    return sendError(res, { statusCode: 404, message: 'The shared file no longer exists' });
  }

  const masterKey = env.ENCRYPTION_MASTER_KEY;
  let fek;
  try {
    fek = unwrapFEK(file.encrypted_fek, file.wrap_iv, file.wrap_auth_tag, masterKey);
  } catch {
    return sendError(res, { statusCode: 500, message: 'File decryption failed' });
  }

  const bucket = getBucket();
  const downloadStream = bucket.openDownloadStream(file.gridfs_id);

  // Atomically increment download count
  await SharedLink.findByIdAndUpdate(link._id, { $inc: { download_count: 1 } });
  audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, true);

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Length', file.size_bytes);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    await decryptStream(downloadStream, res, fek, file.iv, file.auth_tag);
  } catch (err) {
    logger.error('Shared download streaming failed', { fileId: file._id, error: err.message });
  }
});

module.exports = { createShareLink, listShareLinks, revokeShareLink, accessShareLink };
