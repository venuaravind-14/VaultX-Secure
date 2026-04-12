'use strict';

/**
 * @file apiResponse.js
 * @description Standardized API response helpers.
 * All endpoints must use these helpers for consistent JSON shape.
 */

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {object} opts
 * @param {number}  opts.statusCode - HTTP status (default 200)
 * @param {string}  opts.message    - Human-readable message
 * @param {*}       [opts.data]     - Payload (optional)
 */
const sendSuccess = (res, { statusCode = 200, message = 'OK', data = null } = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    errors: null,
  });
};

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {object} opts
 * @param {number}        opts.statusCode - HTTP status (default 500)
 * @param {string}        opts.message    - Human-readable message
 * @param {Array|null}    [opts.errors]   - Validation error array (optional)
 */
const sendError = (res, { statusCode = 500, message = 'Internal Server Error', errors = null } = {}) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errors,
  });
};

module.exports = { sendSuccess, sendError };
