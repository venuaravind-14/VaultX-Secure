'use strict';

const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { Readable } = require('stream');
const { File, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const {
  generateFileEncryptionKey,
  encryptStream,
  decryptStream,
  wrapFEK,
  unwrapFEK,
  generateSalt,
} = require('../services/cryptoService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const logger = require('../config/logger');

// MIME types that file-type library cannot detect (text-based / XML-based formats)
// These are safe to accept on Content-Type header alone after multer validation
const MAGIC_BYTES_EXEMPT = new Set([
  'text/plain',
  'application/msword',           // .doc — old binary format, file-type sometimes misses
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',     // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
]);

const getBucket = () =>
  new GridFSBucket(mongoose.connection.db, { bucketName: 'encrypted_files' });

const audit = (action, userId, resourceId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId,
    action,
    resource_id: resourceId ? String(resourceId) : null,
    resource_type: 'file',
    ip_address: req.ip || 'unknown',
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Upload File ───────────────────────────────────────────────────────────────
const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    return sendError(res, { statusCode: 400, message: 'No file provided. Use field name "file".' });
  }

  const { buffer, originalname, mimetype, size } = req.file;

  // MIME validation: use file-type for binary formats, skip for text/XML formats
  if (!MAGIC_BYTES_EXEMPT.has(mimetype)) {
    try {
      const fileType = require('file-type');
      const detected = await fileType.fromBuffer(buffer);
      const detectedMime = detected?.mime || null;

      if (detectedMime && detectedMime !== mimetype) {
        logger.warn('MIME mismatch detected', {
          declared: mimetype,
          detected: detectedMime,
          filename: originalname,
        });
        return sendError(res, {
          statusCode: 415,
          message: `File content (${detectedMime}) does not match declared type (${mimetype}). Please upload a genuine file.`,
        });
      }
    } catch (err) {
      // file-type check failing is non-fatal — log and continue
      logger.warn('file-type check failed (non-fatal)', { error: err.message });
    }
  }

  const masterKey = env.ENCRYPTION_MASTER_KEY;
  if (!masterKey || masterKey.length !== 32) {
    logger.error('ENCRYPTION_MASTER_KEY is invalid or missing');
    return sendError(res, { statusCode: 500, message: 'Server encryption config error. Contact admin.' });
  }

  // 1. Generate fresh FEK for this file
  const fek = await generateFileEncryptionKey();
  const wrappingSalt = await generateSalt();

  // 2. Wrap FEK with master key (AES-256-GCM)
  let encryptedFek, wrapIv, wrapAuthTag;
  try {
    ({ encryptedFek, wrapIv, wrapAuthTag } = wrapFEK(fek, masterKey));
  } catch (err) {
    logger.error('FEK wrapping failed', { error: err.message });
    return sendError(res, { statusCode: 500, message: 'Encryption setup failed' });
  }

  // 3. Encrypt file content and stream to GridFS
  const bucket = getBucket();
  const safeFilename = originalname.replace(/[^\w\s.\-]/g, '_');
  const uploadStream = bucket.openUploadStream(safeFilename, {
    metadata: { user_id: req.user._id, encrypted: true, original_mime: mimetype },
  });

  const inputStream = Readable.from(buffer);

  let iv, authTag;
  try {
    ({ iv, authTag } = await encryptStream(inputStream, uploadStream, fek));
  } catch (err) {
    logger.error('File encryption stream failed', { error: err.message, filename: originalname });
    // Attempt cleanup of partially written GridFS entry
    try { await bucket.delete(uploadStream.id); } catch {}
    return sendError(res, { statusCode: 500, message: 'File encryption failed during upload' });
  }

  const gridfsId = uploadStream.id;

  // 4. Save metadata
  let fileDoc;
  try {
    fileDoc = await File.create({
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
  } catch (err) {
    logger.error('File metadata save failed', { error: err.message });
    try { await bucket.delete(gridfsId); } catch {}
    return sendError(res, { statusCode: 500, message: 'Failed to save file metadata' });
  }

  // Zero out FEK from memory ASAP
  fek.fill(0);

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
        _id: fileDoc._id,
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
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { user_id: req.user._id, is_deleted: false };

  // Optional search by filename
  if (req.query.search) {
    query.original_name = { $regex: req.query.search.trim(), $options: 'i' };
  }

  const [files, total] = await Promise.all([
    File.find(query)
      .select('_id original_name mime_type size_bytes created_at updated_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    File.countDocuments(query),
  ]);

  return sendSuccess(res, {
    data: {
      files,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1,
      },
    },
  });
});

// ── Get File Info (metadata only) ─────────────────────────────────────────────
const getFileInfo = asyncHandler(async (req, res) => {
  const file = await File.findOne({
    _id: req.params.id,
    user_id: req.user._id,
    is_deleted: false,
  }).select('_id original_name mime_type size_bytes created_at');

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
  }).select('+encrypted_fek +wrap_iv +wrap_auth_tag +master_salt +iv +auth_tag +gridfs_id mime_type original_name size_bytes');

  if (!file) {
    return sendError(res, { statusCode: 404, message: 'File not found' });
  }

  if (!file.encrypted_fek || !file.wrap_iv || !file.wrap_auth_tag) {
    logger.error('File missing encryption fields', { fileId: file._id });
    return sendError(res, { statusCode: 500, message: 'File encryption data is incomplete. Cannot decrypt.' });
  }

  const masterKey = env.ENCRYPTION_MASTER_KEY;
  let fek;
  try {
    fek = unwrapFEK(file.encrypted_fek, file.wrap_iv, file.wrap_auth_tag, masterKey);
  } catch (err) {
    logger.error('FEK unwrap failed on download', { fileId: file._id, error: err.message });
    audit(AUDIT_ACTIONS.FILE_DOWNLOAD, req.user._id, file._id, req, false, { reason: 'fek_unwrap_failed' });
    return sendError(res, { statusCode: 500, message: 'File decryption failed. Encryption key mismatch.' });
  }

  const bucket = getBucket();

  // Verify GridFS file exists before sending headers
  try {
    const files = await bucket.find({ _id: file.gridfs_id }).toArray();
    if (files.length === 0) {
      return sendError(res, { statusCode: 404, message: 'Encrypted file data not found in storage' });
    }
  } catch (err) {
    logger.error('GridFS lookup failed', { gridfsId: file.gridfs_id, error: err.message });
    return sendError(res, { statusCode: 500, message: 'Storage lookup failed' });
  }

  const downloadStream = bucket.openDownloadStream(file.gridfs_id);

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  downloadStream.on('error', (err) => {
    logger.error('GridFS download stream error', { fileId: file._id, error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Storage read error', data: null, errors: null });
    }
  });

  try {
    await decryptStream(downloadStream, res, fek, file.iv, file.auth_tag);
    fek.fill(0);
    audit(AUDIT_ACTIONS.FILE_DOWNLOAD, req.user._id, file._id, req, true);
  } catch (err) {
    fek.fill(0);
    logger.error('Streaming decryption failed', { fileId: file._id, error: err.message });
    if (!res.headersSent) {
      return sendError(res, { statusCode: 500, message: 'Decryption stream failed' });
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

  await File.findByIdAndUpdate(file._id, { is_deleted: true, deleted_at: new Date() });
  audit(AUDIT_ACTIONS.FILE_DELETE, req.user._id, file._id, req, true, { filename: file.original_name });

  return sendSuccess(res, { message: 'File deleted successfully' });
});

module.exports = { uploadFile, listFiles, getFileInfo, downloadFile, deleteFile };
