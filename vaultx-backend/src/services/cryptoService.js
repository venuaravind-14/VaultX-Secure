/**
 * VaultX Secure — cryptoService.js
 *
 * Centralises ALL cryptographic operations for the application.
 * Nothing outside this file should call crypto directly.
 *
 * Algorithms used:
 *  - AES-256-GCM       → symmetric file encryption (authenticated)
 *  - RSA-OAEP / PBKDF2 → wrapping per-file keys (key encapsulation)
 *  - HMAC-SHA256        → secure share link tokens
 *  - argon2id           → password + PIN hashing (via argon2 package)
 *  - CSPRNG             → all random bytes via crypto.randomBytes
 *
 * Node built-in crypto is used for symmetric ops.
 * `argon2` npm package is used for password hashing.
 */

'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const { promisify } = require('util');

const randomBytesAsync = promisify(crypto.randomBytes);

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const AES_ALGORITHM      = 'aes-256-gcm';
const AES_KEY_BYTES      = 32;   // 256 bits
const AES_IV_BYTES       = 12;   // 96 bits — GCM standard
const AES_AUTH_TAG_BYTES = 16;   // 128 bits — GCM max tag length

const PBKDF2_ITERATIONS  = 310_000; // OWASP 2023 minimum for SHA-256
const PBKDF2_KEYLEN      = 32;
const PBKDF2_DIGEST      = 'sha256';
const PBKDF2_SALT_BYTES  = 32;

const HMAC_ALGORITHM     = 'sha256';
const HMAC_TOKEN_BYTES   = 32;   // 256-bit raw token before HMAC

// argon2id parameters (OWASP recommended minimums 2024)
const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  65536,   // 64 MB
  timeCost:    3,       // 3 iterations
  parallelism: 4,
  hashLength:  32,
};

// ─────────────────────────────────────────────
// 1. PASSWORD HASHING  (argon2id)
// ─────────────────────────────────────────────

/**
 * Hash a password or PIN using argon2id.
 * @param {string} plaintext
 * @returns {Promise<string>} encoded hash string (includes salt + params)
 */
async function hashPassword(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('hashPassword: plaintext must be a non-empty string');
  }
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against an argon2id hash.
 * Uses constant-time comparison internally via argon2.
 * @param {string} hash     stored hash from DB
 * @param {string} plaintext candidate password
 * @returns {Promise<boolean>}
 */
async function verifyPassword(hash, plaintext) {
  if (!hash || !plaintext) return false;
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false; // treat any error as a failed verification
  }
}


// ─────────────────────────────────────────────
// 2. KEY DERIVATION  (PBKDF2)
// ─────────────────────────────────────────────

/**
 * Derive a symmetric key from a user password + salt using PBKDF2-SHA256.
 * Used to wrap (encrypt) per-file FEKs when RSA is not available.
 *
 * @param {string} password   user plaintext password
 * @param {Buffer} salt       32-byte random salt
 * @returns {Promise<Buffer>} 32-byte derived key
 */
async function deriveKeyFromPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEYLEN,
      PBKDF2_DIGEST,
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
}

/**
 * Generate a new random PBKDF2 salt.
 * Store this alongside the encrypted FEK so the key can be re-derived.
 * @returns {Promise<Buffer>}
 */
async function generateSalt() {
  return randomBytesAsync(PBKDF2_SALT_BYTES);
}


// ─────────────────────────────────────────────
// 3. PER-FILE KEY GENERATION
// ─────────────────────────────────────────────

/**
 * Generate a cryptographically secure random 256-bit File Encryption Key.
 * This FEK is what actually encrypts the file content.
 * It must be wrapped (encrypted) before storage — never store plaintext FEK.
 *
 * @returns {Promise<Buffer>} 32 random bytes
 */
async function generateFileEncryptionKey() {
  return randomBytesAsync(AES_KEY_BYTES);
}


// ─────────────────────────────────────────────
// 4. FEK WRAPPING  (key encapsulation)
// ─────────────────────────────────────────────

/**
 * Wrap (encrypt) a File Encryption Key using a master key.
 * The master key is derived from the user's password via PBKDF2.
 * AES-256-GCM is used so wrapping is also authenticated.
 *
 * @param {Buffer} fek        plaintext 32-byte FEK
 * @param {Buffer} masterKey  32-byte master key (from deriveKeyFromPassword)
 * @returns {{ encryptedFek: string, wrapIv: string, wrapAuthTag: string }}
 *   All values are hex-encoded strings for safe DB storage.
 */
function wrapFEK(fek, masterKey) {
  const iv = crypto.randomBytes(AES_IV_BYTES);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, masterKey, iv, {
    authTagLength: AES_AUTH_TAG_BYTES,
  });

  const encrypted = Buffer.concat([cipher.update(fek), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedFek: encrypted.toString('hex'),
    wrapIv:       iv.toString('hex'),
    wrapAuthTag:  authTag.toString('hex'),
  };
}

/**
 * Unwrap (decrypt) a File Encryption Key using the master key.
 * Verifies the GCM auth tag — will throw if data is tampered.
 *
 * @param {string} encryptedFekHex  hex-encoded encrypted FEK
 * @param {string} wrapIvHex        hex-encoded IV used during wrapping
 * @param {string} wrapAuthTagHex   hex-encoded auth tag from wrapping
 * @param {Buffer} masterKey        32-byte master key
 * @returns {Buffer} plaintext FEK (32 bytes)
 */
function unwrapFEK(encryptedFekHex, wrapIvHex, wrapAuthTagHex, masterKey) {
  const iv           = Buffer.from(wrapIvHex, 'hex');
  const encryptedFek = Buffer.from(encryptedFekHex, 'hex');
  const authTag      = Buffer.from(wrapAuthTagHex, 'hex');

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, masterKey, iv, {
    authTagLength: AES_AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);

  // Will throw 'Unsupported state or unable to authenticate data' if tampered
  return Buffer.concat([decipher.update(encryptedFek), decipher.final()]);
}


// ─────────────────────────────────────────────
// 5. FILE ENCRYPTION / DECRYPTION  (AES-256-GCM)
// ─────────────────────────────────────────────

/**
 * Encrypt a file buffer using AES-256-GCM.
 *
 * @param {Buffer} fileBuffer  raw file content
 * @param {Buffer} fek         32-byte File Encryption Key
 * @returns {{ ciphertext: Buffer, iv: string, authTag: string }}
 *   iv and authTag are hex strings for DB storage.
 */
function encryptFile(fileBuffer, fek) {
  const iv = crypto.randomBytes(AES_IV_BYTES);

  const cipher = crypto.createCipheriv(AES_ALGORITHM, fek, iv, {
    authTagLength: AES_AUTH_TAG_BYTES,
  });

  const ciphertext = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  return {
    ciphertext,
    iv:      iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt a file ciphertext using AES-256-GCM.
 * Throws if auth tag verification fails (data integrity violation).
 *
 * @param {Buffer} ciphertext   encrypted file content
 * @param {Buffer} fek          32-byte File Encryption Key
 * @param {string} ivHex        hex-encoded IV
 * @param {string} authTagHex   hex-encoded auth tag
 * @returns {Buffer} decrypted file content
 */
function decryptFile(ciphertext, fek, ivHex, authTagHex) {
  const iv      = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, fek, iv, {
    authTagLength: AES_AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Streaming version — encrypt a readable stream and pipe to a writable stream.
 * Use this for large files to avoid loading entire file into memory.
 *
 * @param {ReadableStream} inputStream
 * @param {WritableStream} outputStream
 * @param {Buffer}         fek
 * @returns {Promise<{ iv: string, authTag: string }>}
 */
function encryptStream(inputStream, outputStream, fek) {
  return new Promise((resolve, reject) => {
    const iv     = crypto.randomBytes(AES_IV_BYTES);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, fek, iv, {
      authTagLength: AES_AUTH_TAG_BYTES,
    });

    inputStream.pipe(cipher).pipe(outputStream);

    outputStream.on('finish', () => {
      resolve({
        iv:      iv.toString('hex'),
        authTag: cipher.getAuthTag().toString('hex'),
      });
    });

    inputStream.on('error', reject);
    cipher.on('error', reject);
    outputStream.on('error', reject);
  });
}

/**
 * Streaming decrypt — pipe encrypted GridFS stream → decipher → response.
 *
 * @param {ReadableStream} inputStream   encrypted stream (from GridFS)
 * @param {WritableStream} outputStream  response stream
 * @param {Buffer}         fek
 * @param {string}         ivHex
 * @param {string}         authTagHex
 * @returns {Promise<void>}
 */
function decryptStream(inputStream, outputStream, fek, ivHex, authTagHex) {
  return new Promise((resolve, reject) => {
    const iv       = Buffer.from(ivHex, 'hex');
    const authTag  = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(AES_ALGORITHM, fek, iv, {
      authTagLength: AES_AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(authTag);

    inputStream.pipe(decipher).pipe(outputStream);

    outputStream.on('finish', resolve);
    inputStream.on('error', reject);
    decipher.on('error', reject);
    outputStream.on('error', reject);
  });
}


// ─────────────────────────────────────────────
// 6. SHARE LINK TOKENS  (HMAC-SHA256)
// ─────────────────────────────────────────────

const SHARE_SECRET = process.env.SHARE_LINK_HMAC_SECRET || process.env.SHARE_LINK_SECRET;

/**
 * Generate a secure share link token.
 *
 * Process:
 *  1. Generate 32 random bytes as raw token
 *  2. HMAC-SHA256(rawToken) = token stored in DB (as token_hash)
 *  3. Return rawToken as hex — sent to user ONCE, never stored
 *
 * This means even if the DB is leaked, tokens cannot be used
 * without knowing the SHARE_SECRET.
 *
 * @returns {{ rawToken: string, tokenHash: string }}
 *   rawToken: what goes in the share URL
 *   tokenHash: what gets stored in MongoDB
 */
async function generateShareToken() {
  if (!SHARE_SECRET) throw new Error('SHARE_LINK_HMAC_SECRET env variable not set');
  const rawToken       = rawTokenBuffer.toString('hex'); // 64 hex chars

  const tokenHash = crypto
    .createHmac(HMAC_ALGORITHM, SHARE_SECRET)
    .update(rawToken)
    .digest('hex');

  return { rawToken, tokenHash };
}

/**
 * Given a raw token from a share URL, compute its hash for DB lookup.
 * @param {string} rawToken hex string from the URL
 * @returns {string} tokenHash for MongoDB query
 */
function hashShareToken(rawToken) {
  if (!SHARE_SECRET) throw new Error('SHARE_LINK_HMAC_SECRET env variable not set');

  return crypto
    .createHmac(HMAC_ALGORITHM, SHARE_SECRET)
    .update(rawToken)
    .digest('hex');
}


// ─────────────────────────────────────────────
// 7. PASSWORD RESET TOKENS  (HMAC, single-use)
// ─────────────────────────────────────────────

const RESET_SECRET  = process.env.PASSWORD_RESET_SECRET;
const RESET_EXPIRY  = 10 * 60 * 1000; // 10 minutes in ms

/**
 * Generate a time-limited, HMAC-signed password reset token.
 *
 * Token format (URL-safe, base64url encoded):
 *   base64url( userId + "." + expiry + "." + hmac )
 *
 * @param {string} userId  MongoDB user _id as string
 * @returns {{ token: string, expiry: Date }}
 */
function generateResetToken(userId) {
  if (!RESET_SECRET) throw new Error('PASSWORD_RESET_SECRET env variable not set');

  const expiry    = Date.now() + RESET_EXPIRY;
  const payload   = `${userId}.${expiry}`;
  const signature = crypto
    .createHmac(HMAC_ALGORITHM, RESET_SECRET)
    .update(payload)
    .digest('base64url');

  const token = Buffer.from(`${payload}.${signature}`).toString('base64url');

  return { token, expiry: new Date(expiry) };
}

/**
 * Verify and decode a password reset token.
 *
 * @param {string} token  raw token from URL
 * @returns {{ valid: boolean, userId?: string, reason?: string }}
 */
function verifyResetToken(token) {
  if (!RESET_SECRET) throw new Error('PASSWORD_RESET_SECRET env variable not set');

  try {
    const decoded  = Buffer.from(token, 'base64url').toString('utf8');
    const parts    = decoded.split('.');

    if (parts.length !== 3) return { valid: false, reason: 'malformed' };

    const [userId, expiry, signature] = parts;
    const payload   = `${userId}.${expiry}`;

    // Re-compute expected signature
    const expected = crypto
      .createHmac(HMAC_ALGORITHM, RESET_SECRET)
      .update(payload)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expected);

    if (
      sigBuffer.length !== expBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expBuffer)
    ) {
      return { valid: false, reason: 'invalid_signature' };
    }

    if (Date.now() > parseInt(expiry, 10)) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true, userId };
  } catch {
    return { valid: false, reason: 'malformed' };
  }
}


// ─────────────────────────────────────────────
// 8. UTILITY HELPERS
// ─────────────────────────────────────────────

/**
 * Constant-time string comparison — prevents timing attacks
 * when comparing tokens, hashes, or secrets.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate a cryptographically random hex string.
 * Useful for one-time tokens, session IDs, etc.
 *
 * @param {number} bytes  number of random bytes (output is 2x in hex)
 * @returns {Promise<string>}
 */
async function randomHex(bytes = 32) {
  const buf = await randomBytesAsync(bytes);
  return buf.toString('hex');
}

/**
 * Hash a value with SHA-256. Used for indexing/lookup without
 * exposing the raw value (e.g. refresh token storage).
 *
 * @param {string} value
 * @returns {string} hex digest
 */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}


// ─────────────────────────────────────────────
// FULL FILE UPLOAD FLOW — EXAMPLE USAGE
// ─────────────────────────────────────────────
/*
  Controller example (fileController.js):

  const {
    generateFileEncryptionKey,
    generateSalt,
    deriveKeyFromPassword,
    wrapFEK,
    encryptFile,
  } = require('../services/cryptoService');

  async function uploadFile(req, res) {
    const fileBuffer = req.file.buffer;           // from multer memory storage
    const password   = req.user.password_plaintext; // available only during request

    // 1. Generate a fresh FEK for this file
    const fek  = await generateFileEncryptionKey();

    // 2. Encrypt the file content
    const { ciphertext, iv, authTag } = encryptFile(fileBuffer, fek);

    // 3. Derive master key from user password
    const salt      = await generateSalt();
    const masterKey = await deriveKeyFromPassword(password, salt);

    // 4. Wrap the FEK with master key
    const { encryptedFek, wrapIv, wrapAuthTag } = wrapFEK(fek, masterKey);

    // 5. Store ciphertext → GridFS, metadata → MongoDB
    const gridfsId = await storeInGridFS(ciphertext, req.file.originalname);

    await File.create({
      user_id:       req.user._id,
      original_name: req.file.originalname,
      mime_type:     req.file.mimetype,
      size_bytes:    fileBuffer.length,
      gridfs_id:     gridfsId,
      encrypted_fek: encryptedFek + ':' + wrapIv + ':' + wrapAuthTag + ':' + salt.toString('hex'),
      iv,
      auth_tag:      authTag,
    });

    // 6. FEK is gone — masterKey is gone — only ciphertext + wrapped FEK remain
    fek.fill(0);         // zero out FEK buffer from memory
    masterKey.fill(0);   // zero out master key buffer from memory

    return res.status(201).json({ success: true, message: 'File uploaded securely' });
  }
*/


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  // Password hashing
  hashPassword,
  verifyPassword,

  // Key derivation
  deriveKeyFromPassword,
  generateSalt,

  // File key management
  generateFileEncryptionKey,
  wrapFEK,
  unwrapFEK,

  // File encryption
  encryptFile,
  decryptFile,
  encryptStream,
  decryptStream,

  // Share link tokens
  generateShareToken,
  hashShareToken,

  // Password reset tokens
  generateResetToken,
  verifyResetToken,

  // Utilities
  safeCompare,
  randomHex,
  sha256,
};