'use strict';

/**
 * @file asyncHandler.js
 * @description Wraps async route handlers to eliminate repetitive try/catch.
 * Any thrown error is forwarded to Express's centralized error handler.
 *
 * @param {Function} fn - Async express route handler
 * @returns {Function} Wrapped handler that catches promise rejections
 *
 * @example
 * router.get('/resource', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOp();
 *   sendSuccess(res, { data });
 * }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
