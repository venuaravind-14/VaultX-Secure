'use strict';

const express = require('express');
const router = express.Router();

const {
  createShareLink, listShareLinks, revokeShareLink, accessShareLink,
} = require('../controllers/sharing.controller');
const { protect } = require('../middleware/auth');
const { shareLimiter } = require('../middleware/rateLimit');
const {
  validateCreateShareLink, validateAccessShareLink, validatePagination,
} = require('../middleware/validate');

// Public share access — rate-limited per IP
router.get('/access/:token', shareLimiter, validateAccessShareLink, accessShareLink);

// Protected routes — authenticated users manage their own links
router.use(protect);
router.post('/',      validateCreateShareLink, createShareLink);
router.get('/',       validatePagination,      listShareLinks);
router.delete('/:id', revokeShareLink);

module.exports = router;
