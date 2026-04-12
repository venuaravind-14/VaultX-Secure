'use strict';

const express = require('express');
const router = express.Router();

const { getAuditLogs } = require('../controllers/audit.controller');
const { protect } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validate');

router.use(protect);
router.get('/', validatePagination, getAuditLogs);

module.exports = router;
