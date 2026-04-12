'use strict';

/**
 * @file index.js (routes)
 * @description Aggregates all route modules under /api.
 */

const express = require('express');
const router = express.Router();

const authRoutes    = require('./auth.routes');
const filesRoutes   = require('./files.routes');
const idcardsRoutes = require('./idcards.routes');
const sharingRoutes = require('./sharing.routes');
const qrRoutes      = require('./qr.routes');
const auditRoutes   = require('./audit.routes');

router.use('/auth',    authRoutes);
router.use('/files',   filesRoutes);
router.use('/idcards', idcardsRoutes);
router.use('/sharing', sharingRoutes);
router.use('/qr',      qrRoutes);
router.use('/audit',   auditRoutes);

module.exports = router;
