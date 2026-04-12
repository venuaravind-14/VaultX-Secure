'use strict';

const express = require('express');
const router = express.Router();

const {
  uploadFile, listFiles, getFileInfo, downloadFile, deleteFile,
} = require('../controllers/files.controller');
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { validatePagination } = require('../middleware/validate');

// All file routes require authentication
router.use(protect);

router.post('/',        uploadSingle, uploadFile);
router.get('/',         validatePagination, listFiles);
router.get('/:id/info', getFileInfo);
router.get('/:id',      downloadFile);
router.delete('/:id',   deleteFile);

module.exports = router;
