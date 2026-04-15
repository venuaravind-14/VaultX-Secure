'use strict';

const { User, AUDIT_ACTIONS } = require('../models/models');
const { 
  hashPassword, 
  verifyPassword, 
  generateSalt 
} = require('./cryptoService');
const { 
  generateAccessToken, 
  generateRefreshToken,
  generateVaultToken,
  generatePasswordResetToken,
  hashPasswordResetToken
} = require('../middleware/auth');

/**
 * AuthService — Business logic for identity and access.
 * Decouples Mongoose/Argon2 from the controller layer.
 */
class AuthService {
  async registerUser({ name, email, password }) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new Error('ALREADY_EXISTS');

    const passwordHash = await hashPassword(password);
    const pbkdf2Salt = await generateSalt();

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      pbkdf2_salt: pbkdf2Salt,
      is_verified: false,
    });

    return user;
  }

  async validateCredentials(email, password) {
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password_hash +failed_login_attempts +locked_until +refresh_token_hash');
    
    if (!user) return null;
    if (user.isLocked()) throw new Error('ACCOUNT_LOCKED');

    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      await user.incrementFailedAttempts();
      return null;
    }

    await user.resetFailedAttempts();
    return user;
  }

  async changeUserPassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId).select('+password_hash');
    const isValid = await verifyPassword(user.password_hash, oldPassword);
    if (!isValid) throw new Error('INVALID_CURRENT_PASSWORD');

    const newHash = await hashPassword(newPassword);
    const newSalt = await generateSalt();

    user.password_hash = newHash;
    user.pbkdf2_salt = newSalt;
    user.refresh_token_hash = null; // Force re-login
    await user.save();
    return true;
  }

  async unlockVault(userId, password) {
    const user = await User.findById(userId).select('+password_hash');
    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) return null;

    return generateVaultToken(user._id);
  }

  async initiatePasswordReset(email) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return null;

    const { rawToken, tokenHash } = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.password_reset_token_hash = tokenHash;
    user.password_reset_expires = expiresAt;
    await user.save();

    return { rawToken, name: user.name };
  }

  async completePasswordReset(rawToken, newPassword) {
    const tokenHash = hashPasswordResetToken(rawToken);

    const user = await User.findOne({
      password_reset_token_hash: tokenHash,
      password_reset_expires: { $gt: new Date() },
    }).select('+password_reset_token_hash +password_reset_expires');

    if (!user) throw new Error('INVALID_TOKEN');

    const newHash = await hashPassword(newPassword);
    const newSalt = await generateSalt();

    user.password_hash = newHash;
    user.pbkdf2_salt = newSalt;
    user.password_reset_token_hash = null;
    user.password_reset_expires = null;
    user.refresh_token_hash = null;
    await user.save();

    return user;
  }
}

module.exports = new AuthService();
