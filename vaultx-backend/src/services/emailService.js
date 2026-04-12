'use strict';

/**
 * @file emailService.js
 * @description Nodemailer email service for transactional emails.
 * Handles password reset and verification emails.
 */

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

// Create reusable transporter — initialized once
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
    // Prevent connection pooling issues in serverless
    pool: false,
  });

  return transporter;
};

/**
 * Sends a password reset email with a time-limited HMAC-signed token link.
 *
 * @param {string} toEmail     - Recipient email address
 * @param {string} rawToken    - The plaintext reset token (NEVER log this)
 * @param {string} userName    - Recipient's display name
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (toEmail, rawToken, userName) => {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  const mailOptions = {
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: '🔐 VaultX Secure — Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px;">
        <div style="max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 40px;">
          <h2 style="color: #6366f1;">VaultX Secure</h2>
          <h3>Password Reset</h3>
          <p>Hello ${userName},</p>
          <p>You requested a password reset. Click the button below to set a new password.</p>
          <p>
            <a href="${resetUrl}"
               style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;
                      border-radius:8px;text-decoration:none;font-weight:bold;">
              Reset Password
            </a>
          </p>
          <p style="color:#94a3b8;font-size:13px;">
            This link expires in <strong>10 minutes</strong> and can only be used once.
          </p>
          <p style="color:#94a3b8;font-size:13px;">
            If you did not request this, please ignore this email and
            consider changing your password immediately.
          </p>
          <hr style="border-color:#334155;margin: 24px 0;" />
          <p style="color:#475569;font-size:12px;">
            VaultX Secure — Enterprise Vault Platform
          </p>
        </div>
      </body>
      </html>
    `,
    text: `Password Reset — VaultX Secure\n\nHello ${userName},\n\nReset your password here: ${resetUrl}\n\nThis link expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    logger.info('Password reset email sent', { to: toEmail });
  } catch (err) {
    // Log but don't expose SMTP errors to the caller (prevents email enumeration side-channels)
    logger.error('Failed to send password reset email', { error: err.message });
    throw new Error('Email delivery failed');
  }
};

/**
 * Sends a welcome/verification email.
 * @param {string} toEmail
 * @param {string} userName
 * @returns {Promise<void>}
 */
const sendWelcomeEmail = async (toEmail, userName) => {
  const mailOptions = {
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: '✨ Welcome to VaultX Secure',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px;">
        <div style="max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 40px;">
          <h2 style="color: #6366f1;">VaultX Secure</h2>
          <p>Hello ${userName}, welcome aboard! Your encrypted vault is ready.</p>
          <p>Start by uploading your first secure file or adding a digital ID card.</p>
          <p style="color:#475569;font-size:12px;">VaultX Secure — Enterprise Vault Platform</p>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
  } catch (err) {
    // Non-critical — welcome email failures should not block registration
    logger.warn('Failed to send welcome email', { error: err.message });
  }
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };
