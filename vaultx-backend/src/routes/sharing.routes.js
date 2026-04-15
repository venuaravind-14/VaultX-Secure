'use strict';

const express = require('express');
const router = express.Router();

const {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  accessShareLink,
  getShareLinkInfo,
} = require('../controllers/sharing.controller');
const { protect } = require('../middleware/auth');
const { shareLinkRateLimit } = require('../middleware/auth');
const {
  validateCreateShareLink,
  validatePagination,
} = require('../middleware/validate');

// ── Public routes (no auth, rate-limited) ─────────────────────────────────────
// GET /sharing/access/:token?link_id=<id>   — download the shared file
// GET /sharing/info/:token?link_id=<id>     — get metadata without downloading
router.get('/access/:token', shareLinkRateLimit, accessShareLink);
router.get('/info/:token',   shareLinkRateLimit, getShareLinkInfo);

// POST /sharing/access/:token?link_id=<id>  — same as GET but with password in body
router.post('/access/:token', shareLinkRateLimit, accessShareLink);

// ── Protected routes (authenticated users) ────────────────────────────────────
router.use(protect);
router.post('/',      validateCreateShareLink, createShareLink);
router.get('/',       validatePagination, listShareLinks);
router.delete('/:id', revokeShareLink);

module.exports = router;
