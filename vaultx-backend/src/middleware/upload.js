'use strict';

/**
 * upload.js — Multer config for file uploads.
 *
 * Uses memoryStorage so files can be AES-256-GCM encrypted BEFORE
 * writing to GridFS. GridFS never sees plaintext.
 *
 * MIME whitelist covers all common document/image/archive types.
 * Office files (.docx, .xlsx) use OOXML MIME types which browsers
 * report correctly when using file input elements.
 */

const multer = require('multer');
const { sendError } = require('../utils/apiResponse');

// Complete MIME whitelist — all types users would realistically upload
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/rtf',

  // Microsoft Office (modern OOXML)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

  // Microsoft Office (legacy binary)
  'application/msword',                                                          // .doc
  'application/vnd.ms-excel',                                                    // .xls
  'application/vnd.ms-powerpoint',                                               // .ppt

  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
]);

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Normalize MIME type (some browsers send 'image/jpg' instead of 'image/jpeg')
  const mime = file.mimetype?.toLowerCase().trim() || '';

  if (!mime) {
    return cb(Object.assign(new Error('File has no MIME type'), { statusCode: 400 }), false);
  }

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(
      Object.assign(
        new Error(`File type "${mime}" is not allowed. Supported: PDF, Word, Excel, images, ZIP`),
        { statusCode: 415 }
      ),
      false
    );
  }

  cb(null, true);
};

const uploadSingleRaw = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 10,
  },
}).single('file');

const uploadCardImageRaw = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const imageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    const mime = file.mimetype?.toLowerCase().trim() || '';
    if (!imageTypes.has(mime)) {
      return cb(new Error('Card image must be JPEG, PNG, or WebP'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('card_image');

/**
 * Wraps multer to forward errors to Express error handler with proper status codes.
 * Without this, multer errors don't reach the centralized errorHandler.
 */
const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, {
        statusCode: 413,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`,
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendError(res, {
        statusCode: 400,
        message: 'Unexpected file field. Use field name "file".',
      });
    }

    return sendError(res, {
      statusCode: err.statusCode || 400,
      message: err.message || 'File upload failed',
    });
  });
};

module.exports = {
  uploadSingle: handleUpload(uploadSingleRaw),
  uploadCardImage: handleUpload(uploadCardImageRaw),
  ALLOWED_MIME_TYPES,
};
