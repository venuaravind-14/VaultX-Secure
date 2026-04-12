'use strict';

const express = require('express');
const router = express.Router();

const {
  createIDCard, listIDCards, getIDCard, updateIDCard, deleteIDCard,
} = require('../controllers/idcards.controller');
const { protect } = require('../middleware/auth');
const {
  validateCreateIDCard, validateUpdateIDCard, validatePagination,
} = require('../middleware/validate');

router.use(protect);

router.post('/',     validateCreateIDCard, createIDCard);
router.get('/',      validatePagination,   listIDCards);
router.get('/:id',   getIDCard);
router.put('/:id',   validateUpdateIDCard, updateIDCard);
router.delete('/:id', deleteIDCard);

module.exports = router;
