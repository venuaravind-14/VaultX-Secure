'use strict';

const argon2 = require('argon2');
const { User, AuditLog, AUDIT_ACTIONS } = require('../models/models');
const { 
  hashPassword, 
  verifyPassword, 
  generateSalt 
} = require('./cryptoService');
const { 
  generateAccessToken, 
  generateRefreshToken,
  generateVaultToken
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

    user.password_hash = await hashPassword(newPassword);
    await user.save();
    return true;
  }

  async unlockVault(userId, password) {
    const user = await User.findById(userId).select('+password_hash');
    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) return null;

    return generateVaultToken(user._id);
  }
}

module.exports = new AuthService();
