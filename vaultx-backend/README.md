# VaultX Secure — Backend Reference Code

These files are production-ready reference implementations for the VaultX Secure backend.
Drop them into your project and wire up imports as shown below.

---

## Files Included

| File | Purpose |
|---|---|
| `models.js` | All 5 Mongoose schemas (User, File, IDCard, SharedLink, AuditLog) |
| `cryptoService.js` | All cryptographic operations (AES-256-GCM, argon2id, HMAC, PBKDF2) |
| `authMiddleware.js` | JWT auth, rate limiting, MIME validation, error handler |
| `.env.example` | All required environment variables with descriptions |

---

## Quick Setup

```bash
npm install mongoose argon2 jsonwebtoken express-rate-limit express-slow-down \
  express-validator file-type multer
```

### Import in your project

```js
// models
const { User, File, IDCard, SharedLink, AuditLog } = require('./models');

// crypto service
const crypto = require('./cryptoService');

// middleware
const {
  protect, restrictTo, requirePin,
  authRateLimit, globalRateLimit,
  handleValidationErrors, validateFileMime,
  errorHandler, asyncHandler
} = require('./authMiddleware');
```

---

## Security Decisions Explained

### Why argon2id over bcrypt?
argon2id is the winner of the Password Hashing Competition (2015) and the current
OWASP recommendation. It resists both GPU attacks (via memory hardness) and
side-channel attacks (via the 'id' hybrid mode). bcrypt has no memory hardness.

### Why AES-256-GCM over AES-256-CBC?
GCM is an authenticated encryption mode — it provides both confidentiality AND
integrity in one pass. CBC encryption alone does not detect tampering. With GCM,
any modification to the ciphertext causes decryption to throw, protecting against
padding oracle and bit-flipping attacks.

### Why per-file keys (FEK)?
If a single master key encrypted all files, one key compromise exposes everything.
Per-file keys mean: compromising one file's key exposes only that file.
The FEK is wrapped (encrypted) with the user's master key, so the FEK at rest
is never in plaintext.

### Why store token_hash instead of raw tokens?
If the database is breached, attackers cannot use hashed tokens — they need the
raw token which was only returned to the user once and never persisted.
This applies to: share link tokens, refresh tokens, and password reset tokens.

### Why HMAC over random IDs for share tokens?
HMAC tokens are server-verified: even if an attacker guesses a token, it must
have a valid HMAC signature using SHARE_LINK_SECRET. This provides an extra
layer of protection beyond just collision resistance.

### Why constant-time comparison (timingSafeEqual)?
Standard string comparison short-circuits on the first mismatching character.
An attacker can time the comparison to learn how many leading characters match,
gradually guessing secrets. timingSafeEqual always takes the same time regardless
of where the mismatch is.

---

## File Encryption Flow

```
Upload:
  plaintext file
       ↓ generateFileEncryptionKey() → random 256-bit FEK
       ↓ encryptFile(buffer, FEK) → { ciphertext, iv, authTag }
       ↓ deriveKeyFromPassword(password, salt) → masterKey
       ↓ wrapFEK(FEK, masterKey) → { encryptedFek, wrapIv, wrapAuthTag }
       ↓
  GridFS ← ciphertext
  MongoDB ← { encryptedFek, wrapIv, wrapAuthTag, salt, iv, authTag }
  Memory ← FEK zeroed out immediately after use

Download:
  MongoDB → { encryptedFek, wrapIv, wrapAuthTag, salt, iv, authTag }
       ↓ deriveKeyFromPassword(password, salt) → masterKey
       ↓ unwrapFEK(encryptedFek, wrapIv, wrapAuthTag, masterKey) → FEK
       ↓ GridFS → ciphertext
       ↓ decryptFile(ciphertext, FEK, iv, authTag) → plaintext
       ↓ stream to user
  Memory ← FEK zeroed out immediately after use
```

---

## Audit Log Actions Reference

All actions tracked in AuditLog:

`register` `login` `login_failed` `logout` `token_refresh`
`password_change` `password_reset_request` `password_reset_complete`
`pin_set` `pin_verify` `pin_verify_failed`
`file_upload` `file_download` `file_delete` `file_view`
`share_create` `share_access` `share_access_failed` `share_revoke`
`qr_generate` `qr_scan` `qr_scan_failed`
`card_create` `card_update` `card_delete`
`account_locked` `session_revoke`
