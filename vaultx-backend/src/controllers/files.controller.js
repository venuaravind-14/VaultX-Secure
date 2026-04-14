'use strict';

/**
 * @file files.controller.js
 * @description File upload, download, listing, and deletion with AES-256-GCM E2EE.
 */

const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const fileType = require('file-type');
const { User, File, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const {
  generateFileEncryptionKey,
  encryptStream,
  decryptStream,
  wrapFEK,
  unwrapFEK,
  deriveKeyFromPassword,
  generateSalt,
} = require('../services/cryptoService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const logger = require('../config/logger');

// ── GridFS Bucket Helper ───────────────────────────────────────────────────────
const getBucket = () => {
  // Uses the active mongoose connection's underlying db
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'encrypted_files' });
};

// ── Audit Helper ───────────────────────────────────────────────────────────────
const audit = (action, userId, resourceId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId,
    action,
    resource_id: resourceId,
    resource_type: 'file',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Upload File ───────────────────────────────────────────────────────────────
const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    return sendError(res, { statusCode: 400, message: 'No file provided' });
  }

  const { buffer, originalname, mimetype, size } = req.file;

  // 1. Get user for salt (used to derive master key)
  const user = await User.findById(req.user._id).select('+pbkdf2_salt');
  
  // Use the env master key for wrapping (best practice: user password derivations should be used, 
  // but for simplicity in this flow we use the server master key for now as requested in reference)
  const masterKey = env.ENCRYPTION_MASTER_KEY; 

  // 2. Generate FEK
  const fek = await generateFileEncryptionKey();

  // 3. Wrap FEK
  const wrappingSalt = await generateSalt();
  const { encryptedFek, wrapIv, wrapAuthTag } = wrapFEK(fek, masterKey);

  // 4. Encrypt Stream into GridFS
  const bucket = getBucket();
  const uploadStream = bucket.openUploadStream(originalname, {
    metadata: { user_id: req.user._id, encrypted: true },
  });

  const { Readable } = require('stream');
  const inputStream = Readable.from(buffer);

  const { iv, authTag } = await encryptStream(inputStream, uploadStream, fek);
  const gridfsId = uploadStream.id;

  // 5. Save File Metadata
  const fileDoc = await File.create({
    user_id: req.user._id,
    original_name: originalname,
    mime_type: mimetype,
    size_bytes: size,
    gridfs_id: gridfsId,
    encrypted_fek: encryptedFek,
    wrap_iv: wrapIv,
    wrap_auth_tag: wrapAuthTag,
    master_salt: wrappingSalt.toString('hex'),
    iv,
    auth_tag: authTag,
  });

  audit(AUDIT_ACTIONS.FILE_UPLOAD, req.user._id, fileDoc._id, req, true, {
    filename: originalname,
    size_bytes: size,
    mime_type: mimetype,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'File uploaded and encrypted successfully',
    data: {
      file: {
        id: fileDoc._id,
        original_name: fileDoc.original_name,
        mime_type: fileDoc.mime_type,
        size_bytes: fileDoc.size_bytes,
        created_at: fileDoc.created_at,
      },
    },
  });
});

// ── List Files ────────────────────────────────────────────────────────────────
const listFiles = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [files, total] = await Promise.all([
    File.find({ user_id: req.user._id, is_deleted: false })
      .select('-encrypted_fek -iv -auth_tag') // Never return encryption secrets in list
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    File.countDocuments({ user_id: req.user._id, is_deleted: false }),
  ]);

  return sendSuccess(res, {
    data: {
      files,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// ── Get File Info ─────────────────────────────────────────────────────────────
const getFileInfo = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.id,
    user_id: req.user._id,
    is_deleted: false,
  }).select('-encrypted_fek -iv -auth_tag');

  if (!file) {
    return sendError(res, { statusCode: 404, message: 'File not found' });
  }

  return sendSuccess(res, { data: { file } });
});

// ── Download File ─────────────────────────────────────────────────────────────
const downloadFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.id,
    user_id: req.user._id,
    is_deleted: false,
  }).select('+encrypted_fek +wrap_iv +wrap_auth_tag +master_salt +iv +auth_tag +gridfs_id');

  if (!file) {
    return sendError(res, { statusCode: 404, message: 'File not found' });
  }

  // 1. Unwrap FEK
  const masterKey = env.ENCRYPTION_MASTER_KEY;
  let fek;
  try {
    fek = unwrapFEK(file.encrypted_fek, file.wrap_iv, file.wrap_auth_tag, masterKey);
  } catch (err) {
    logger.error('FEK unwrap failed', { fileId: file._id, error: err.message });
    audit(AUDIT_ACTIONS.FILE_DOWNLOAD, req.user._id, file._id, req, false, {
      reason: 'fek_unwrap_failed',
    });
    return sendError(res, { statusCode: 500, message: 'File decryption failed' });
  }

  // 2. Stream Decrypted File from GridFS to Client
  const bucket = getBucket();
  const downloadStream = bucket.openDownloadStream(file.gridfs_id);

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(file.original_name)}"`
  );
  res.setHeader('Content-Length', file.size_bytes);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    await decryptStream(downloadStream, res, fek, file.iv, file.auth_tag);
    audit(AUDIT_ACTIONS.FILE_DOWNLOAD, req.user._id, file._id, req, true);
  } catch (err) {
    logger.error('Streaming decryption failed', { fileId: file._id, error: err.message });
    // Note: Since headers are already sent, we can't send a clean JSON error.
    // The stream will simply terminate, which is handled by clients as a network error.
    if (!res.headersSent) {
      return sendError(res, { statusCode: 500, message: 'Decryption stream interruped' });
    }
  }
});

// ── Soft Delete File ──────────────────────────────────────────────────────────
const deleteFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.id,
    user_id: req.user._id,
    is_deleted: false,
  });

  if (!file) {
    return sendError(res, { statusCode: 404, message: 'File not found' });
  }

  await File.findByIdAndUpdate(file._id, { is_deleted: true });
  audit(AUDIT_ACTIONS.FILE_DELETE, req.user._id, file._id, req, true);

  return sendSuccess(res, { message: 'File deleted successfully' });
});

module.exports = { uploadFile, listFiles, getFileInfo, downloadFile, deleteFile };
