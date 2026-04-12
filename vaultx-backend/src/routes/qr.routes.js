'use strict';

const express = require('express');
const router = express.Router();

const { generateQR, verifyQR } = require('../controllers/qr.controller');
const { protect } = require('../middleware/auth');
const { validateGenerateQR } = require('../middleware/validate');

// Public QR scan verification endpoint
router.get('/verify/:token', verifyQR);

// Protected: QR generation requires authentication
router.use(protect);
router.post('/generate', validateGenerateQR, generateQR);

module.exports = router;
