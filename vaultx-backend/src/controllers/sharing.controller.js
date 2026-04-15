'use strict';

const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { User, File, SharedLink, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const {
  generateShareToken,
  hashShareToken,
  unwrapFEK,
  decryptStream,
  hashPassword,
  verifyPassword,
} = require('../services/cryptoService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const logger = require('../config/logger');

const getBucket = () =>
  new GridFSBucket(mongoose.connection.db, { bucketName: 'encrypted_files' });

const audit = (action, userId, resourceId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId,
    action,
    resource_id: resourceId ? String(resourceId) : null,
    resource_type: 'shared_link',
    ip_address: req.ip || 'unknown',
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Create Share Link ─────────────────────────────────────────────────────────
const createShareLink = asyncHandler(async (req, res) => {
  const { file_id, expiry_hours, download_limit = 1, password } = req.body;

  // Validate expiry_hours is a real number
  const hours = parseInt(expiry_hours, 10);
  if (isNaN(hours) || hours < 1 || hours > 720) {
    return sendError(res, { statusCode: 400, message: 'expiry_hours must be between 1 and 720' });
  }

  const dl = parseInt(download_limit, 10);
  if (isNaN(dl) || dl < 1 || dl > 100) {
    return sendError(res, { statusCode: 400, message: 'download_limit must be between 1 and 100' });
  }

  // Verify file ownership
  const file = await File.findOne({
    _id: file_id,
    user_id: req.user._id,
    is_deleted: false,
  });
  if (!file) {
    return sendError(res, { statusCode: 404, message: 'File not found or you do not own it' });
  }

  const expiryAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  // Generate HMAC token — rawToken goes to user, tokenHash stored in DB
  let rawToken, tokenHash;
  try {
    const result = await generateShareToken();
    rawToken = result.rawToken;
    tokenHash = result.tokenHash;
  } catch (err) {
    logger.error('Share token generation failed', { error: err.message });
    return sendError(res, { statusCode: 500, message: 'Failed to generate secure token. Check SHARE_LINK_HMAC_SECRET env var.' });
  }

  // Hash password if provided
  let password_hash = null;
  let is_password_protected = false;
  if (password && password.trim().length >= 4) {
    password_hash = await hashPassword(password);
    is_password_protected = true;
  }

  const shareLink = await SharedLink.create({
    file_id,
    user_id: req.user._id,
    token_hash: tokenHash,
    password_hash,
    is_password_protected,
    expiry_at: expiryAt,
    download_limit: dl,
    download_count: 0,
    is_revoked: false,
  });

  audit(AUDIT_ACTIONS.SHARE_CREATE, req.user._id, shareLink._id, req, true, {
    file_id,
    expiry_at: expiryAt,
    download_limit: dl,
    password_protected: is_password_protected,
  });

  const accessUrl = `${env.FRONTEND_URL}/share/${rawToken}?link_id=${shareLink._id}`;

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Share link created successfully',
    data: {
      share_id: shareLink._id,
      token: rawToken,        // Returned ONCE — never stored in plaintext
      access_url: accessUrl,
      expiry_at: expiryAt,
      download_limit: dl,
      is_password_protected,
    },
  });
});

// ── List User's Share Links ───────────────────────────────────────────────────
const listShareLinks = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);

  const [links, total] = await Promise.all([
    SharedLink.find({ user_id: req.user._id })
      .select('-token_hash -password_hash')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SharedLink.countDocuments({ user_id: req.user._id }),
  ]);

  // Enrich each link with the file name for display
  const fileIds = [...new Set(links.map(l => l.file_id))];
  const files = await File.find({ _id: { $in: fileIds } }).select('original_name mime_type');
  const fileMap = Object.fromEntries(files.map(f => [f._id, f]));

  const enriched = links.map(l => ({
    ...l.toObject(),
    file_name: fileMap[l.file_id]?.original_name || 'Unknown file',
    file_mime: fileMap[l.file_id]?.mime_type || '',
    is_expired: l.expiry_at < new Date(),
    is_exhausted: l.download_count >= l.download_limit,
    is_active: !l.is_revoked && l.expiry_at >= new Date() && l.download_count < l.download_limit,
  }));

  return sendSuccess(res, {
    data: {
      links: enriched,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    },
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
  return sendSuccess(res, { message: 'Share link revoked successfully' });
});

// ── Access Share Link (Public) ────────────────────────────────────────────────
// Route: GET /sharing/access/:token?link_id=<id>
// The link_id in query allows DB lookup without brute-forcing token hashes.
const accessShareLink = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { link_id } = req.query;
  const { password } = req.body;

  if (!link_id) {
    return sendError(res, { statusCode: 400, message: 'link_id query parameter is required' });
  }

  if (!token) {
    return sendError(res, { statusCode: 400, message: 'Token is required' });
  }

  const link = await SharedLink.findById(link_id).select('+token_hash +password_hash');

  if (!link) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS_FAILED, null, link_id, req, false, { reason: 'not_found' });
    return sendError(res, { statusCode: 404, message: 'Share link not found' });
  }

  // Verify HMAC token first (prevents timing oracle on other checks)
  let computedHash;
  try {
    computedHash = hashShareToken(token);
  } catch (err) {
    logger.error('hashShareToken failed', { error: err.message });
    return sendError(res, { statusCode: 500, message: 'Token verification failed. Check SHARE_LINK_HMAC_SECRET.' });
  }

  if (computedHash !== link.token_hash) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS_FAILED, null, link._id, req, false, { reason: 'invalid_token' });
    return sendError(res, { statusCode: 401, message: 'Invalid share token' });
  }

  if (link.is_revoked) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS_FAILED, null, link._id, req, false, { reason: 'revoked' });
    return sendError(res, { statusCode: 403, message: 'This share link has been revoked' });
  }

  if (link.expiry_at < new Date()) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS_FAILED, null, link._id, req, false, { reason: 'expired' });
    return sendError(res, { statusCode: 410, message: 'This share link has expired' });
  }

  if (link.download_count >= link.download_limit) {
    audit(AUDIT_ACTIONS.SHARE_ACCESS_FAILED, null, link._id, req, false, { reason: 'limit_reached' });
    return sendError(res, { statusCode: 410, message: 'Download limit reached for this link' });
  }

  if (link.is_password_protected) {
    if (!password) {
      return sendError(res, { statusCode: 401, message: 'Password required to access this link', errors: [{ field: 'password', message: 'Password is required' }] });
    }
    const isPasswordValid = await verifyPassword(link.password_hash, password);
    if (!isPasswordValid) {
      audit(AUDIT_ACTIONS.SHARE_ACCESS_FAILED, null, link._id, req, false, { reason: 'wrong_password' });
      return sendError(res, { statusCode: 401, message: 'Incorrect password' });
    }
  }

  // Fetch the file with encrypted fields
  const file = await File.findOne({ _id: link.file_id, is_deleted: false })
    .select('+encrypted_fek +wrap_iv +wrap_auth_tag +iv +auth_tag +gridfs_id');

  if (!file) {
    return sendError(res, { statusCode: 404, message: 'The shared file no longer exists' });
  }

  // Unwrap FEK using server master key
  const masterKey = env.ENCRYPTION_MASTER_KEY;
  let fek;
  try {
    fek = unwrapFEK(file.encrypted_fek, file.wrap_iv, file.wrap_auth_tag, masterKey);
  } catch (err) {
    logger.error('FEK unwrap failed on share access', { fileId: file._id, error: err.message });
    return sendError(res, { statusCode: 500, message: 'File decryption failed' });
  }

  // Atomically increment download count BEFORE streaming
  await SharedLink.findByIdAndUpdate(link._id, { $inc: { download_count: 1 } });
  audit(AUDIT_ACTIONS.SHARE_ACCESS, null, link._id, req, true, { file_id: file._id });

  const bucket = getBucket();
  const downloadStream = bucket.openDownloadStream(file.gridfs_id);

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    await decryptStream(downloadStream, res, fek, file.iv, file.auth_tag);
  } catch (err) {
    logger.error('Shared download streaming failed', { fileId: file._id, error: err.message });
    if (!res.headersSent) {
      return sendError(res, { statusCode: 500, message: 'File streaming failed' });
    }
  }
});

// ── Get Share Link Info (public — no download, just metadata) ─────────────────
const getShareLinkInfo = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { link_id } = req.query;

  if (!link_id || !token) {
    return sendError(res, { statusCode: 400, message: 'token and link_id are required' });
  }

  const link = await SharedLink.findById(link_id).select('+token_hash');
  if (!link) return sendError(res, { statusCode: 404, message: 'Link not found' });

  let computedHash;
  try {
    computedHash = hashShareToken(token);
  } catch {
    return sendError(res, { statusCode: 500, message: 'Token verification error' });
  }

  if (computedHash !== link.token_hash) {
    return sendError(res, { statusCode: 401, message: 'Invalid token' });
  }

  const file = await File.findOne({ _id: link.file_id, is_deleted: false })
    .select('original_name mime_type size_bytes');

  return sendSuccess(res, {
    data: {
      is_valid: !link.is_revoked && link.expiry_at >= new Date() && link.download_count < link.download_limit,
      is_revoked: link.is_revoked,
      is_expired: link.expiry_at < new Date(),
      is_exhausted: link.download_count >= link.download_limit,
      is_password_protected: link.is_password_protected,
      expiry_at: link.expiry_at,
      downloads_remaining: Math.max(0, link.download_limit - link.download_count),
      download_limit: link.download_limit,
      file: file ? {
        name: file.original_name,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
      } : null,
    },
  });
});

module.exports = {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  accessShareLink,
  getShareLinkInfo,
};
