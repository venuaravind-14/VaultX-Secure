'use strict';

/**
 * @file idcards.controller.js
 * @description CRUD operations for digital ID cards.
 */

const { IDCard, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');

const audit = (action, userId, resourceId, req, success, metadata = {}) => {
  AuditLog.log({
    user_id: userId,
    action,
    resource_id: resourceId,
    resource_type: 'id_card',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'] || '',
    success,
    metadata,
  });
};

// ── Create ID Card ─────────────────────────────────────────────────────────────
const createIDCard = asyncHandler(async (req, res) => {
  const { card_type, card_holder_name, card_number, issuer, expiry_date } = req.body;

  const card = await IDCard.create({
    user_id: req.user._id,
    card_type,
    card_holder_name,
    card_number,
    issuer,
    expiry_date: new Date(expiry_date),
  });

  audit(AUDIT_ACTIONS.CARD_CREATE, req.user._id, card._id, req, true, { card_type });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'ID card added successfully',
    data: { card },
  });
});

// ── List ID Cards ──────────────────────────────────────────────────────────────
const listIDCards = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const [cards, total] = await Promise.all([
    IDCard.find({ user_id: req.user._id })
      .select('+card_number')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    IDCard.countDocuments({ user_id: req.user._id }),
  ]);

  return sendSuccess(res, {
    data: {
      cards,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    },
  });
});

// ── Get Single ID Card ─────────────────────────────────────────────────────────
const getIDCard = asyncHandler(async (req, res) => {
  const card = await IDCard.findOne({ _id: req.params.id, user_id: req.user._id }).select('+card_number');
  if (!card) {
    return sendError(res, { statusCode: 404, message: 'ID card not found' });
  }
  return sendSuccess(res, { data: { card } });
});

// ── Update ID Card ─────────────────────────────────────────────────────────────
const updateIDCard = asyncHandler(async (req, res) => {
  const allowedFields = ['card_holder_name', 'card_number', 'issuer', 'expiry_date'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = field === 'expiry_date' ? new Date(req.body[field]) : req.body[field];
    }
  }

  const card = await IDCard.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user._id },
    updates,
    { new: true, runValidators: true, select: '+card_number' }
  );

  if (!card) {
    return sendError(res, { statusCode: 404, message: 'ID card not found' });
  }

  return sendSuccess(res, { message: 'ID card updated', data: { card } });
});

// ── Delete ID Card ─────────────────────────────────────────────────────────────
const deleteIDCard = asyncHandler(async (req, res) => {
  const card = await IDCard.findOne({ _id: req.params.id, user_id: req.user._id });
  if (!card) {
    return sendError(res, { statusCode: 404, message: 'ID card not found' });
  }

  await IDCard.findByIdAndUpdate(card._id, { is_deleted: true });
  audit(AUDIT_ACTIONS.CARD_DELETE, req.user._id, card._id, req, true);

  return sendSuccess(res, { message: 'ID card deleted successfully' });
});

module.exports = { createIDCard, listIDCards, getIDCard, updateIDCard, deleteIDCard };
