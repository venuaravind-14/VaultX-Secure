'use strict';

/**
 * @file upload.js
 * @description Multer configuration with in-memory storage for pre-encryption.
 *
 * DESIGN DECISION: We use memoryStorage (not GridFS storage directly) so that
 * we can encrypt the file buffer BEFORE writing to GridFS. This ensures that
 * GridFS only ever contains ciphertext, never plaintext.
 *
 * Flow: Client → Multer (memory) → cryptoService.encryptFile() → GridFS write
 */

const multer = require('multer');
const env = require('../config/env');
const { sendError } = require('../utils/apiResponse');

// Allowed MIME types (whitelist — reject everything else)
const ALLOWED_MIME_TYPES = new Set(env.ALLOWED_MIME_TYPES);

// ── Multer Memory Storage ──────────────────────────────────────────────────────
const storage = multer.memoryStorage();

/**
 * MIME type + extension validation filter.
 * NOTE: file-type library (magic bytes check) is applied in the controller
 * AFTER multer, where we have the buffer available.
 * This filter is a first-pass based on the Content-Type header.
 */
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      Object.assign(new Error(`File type '${file.mimetype}' is not allowed`), {
        statusCode: 415,
      }),
      false
    );
  }
  cb(null, true);
};

// ── Upload Middleware ──────────────────────────────────────────────────────────

/** Single file upload — field name: 'file' */
const uploadSingle = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 5,
  },
}).single('file');

/** ID card image upload — field name: 'card_image' */
const uploadCardImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const imageTypes = new Set(['image/jpeg', 'image/png']);
    if (!imageTypes.has(file.mimetype)) {
      return cb(new Error('Card image must be JPEG or PNG'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for card images
    files: 1,
  },
}).single('card_image');

/**
 * Wraps multer middleware to forward errors to express error handler.
 * Multer's own error callback doesn't call next(err) by default.
 */
const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
      // Attach status code if multer doesn't provide one
      if (!err.statusCode) err.statusCode = 400;
      return next(err);
    }
    next();
  });
};

module.exports = {
  uploadSingle: handleUpload(uploadSingle),
  uploadCardImage: handleUpload(uploadCardImage),
};
