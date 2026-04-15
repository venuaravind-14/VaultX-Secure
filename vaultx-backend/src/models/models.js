/**
 * VaultX Secure — Mongoose Models
 * All schemas follow security best practices:
 *  - Sensitive fields never returned by default (select: false)
 *  - Indexes on frequently queried fields
 *  - Enum constraints on categorical fields
 *  - Soft deletes on File (is_deleted flag)
 *  - Timestamps on every model
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────
// 1. USER
// ─────────────────────────────────────────────
const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
      index: true,
    },

    // argon2id hash — NEVER store plaintext password
    // select: false → never returned in queries unless explicitly requested
    password_hash: {
      type: String,
      select: false,
    },

    // For Google OAuth users — no password_hash needed
    google_id: {
      type: String,
      sparse: true, // allows multiple null values
      select: false,
      index: true,
    },

    // 6-digit PIN hashed with argon2id
    pin_hash: {
      type: String,
      select: false,
    },

    // RSA public key for wrapping per-file encryption keys
    public_key: {
      type: String,
      select: false,
    },

    // Hashed refresh token — NEVER store plaintext refresh token
    refresh_token_hash: {
      type: String,
      select: false,
    },

    // Brute-force protection
    failed_login_attempts: {
      type: Number,
      default: 0,
      select: false,
    },
    locked_until: {
      type: Date,
      default: null,
      select: false,
    },

    is_verified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    last_login_at: {
      type: Date,
      default: null,
    },

    // Storage usage in bytes
    storage_used_bytes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Instance method: check if account is locked
UserSchema.methods.isLocked = function () {
  return this.locked_until && this.locked_until > new Date();
};

// Instance method: increment failed attempts and lock if threshold hit
UserSchema.methods.incrementFailedAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  this.failed_login_attempts += 1;

  if (this.failed_login_attempts >= MAX_ATTEMPTS) {
    this.locked_until = new Date(Date.now() + LOCK_DURATION_MS);
    this.failed_login_attempts = 0; // reset counter after locking
  }

  await this.save();
};

// Instance method: reset on successful login
UserSchema.methods.resetFailedAttempts = async function () {
  this.failed_login_attempts = 0;
  this.locked_until = null;
  this.last_login_at = new Date();
  await this.save();
};

// Never expose sensitive fields in JSON output
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.pin_hash;
  delete obj.google_id;
  delete obj.public_key;
  delete obj.refresh_token_hash;
  delete obj.failed_login_attempts;
  delete obj.locked_until;
  return obj;
};

const User = mongoose.model('User', UserSchema);


// ─────────────────────────────────────────────
// 2. FILE
// ─────────────────────────────────────────────
const FileSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Original filename — stored as-is for display
    original_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [255, 'Filename too long'],
    },

    mime_type: {
      type: String,
      required: true,
      // Whitelisted MIME types only — enforced in middleware too
      enum: [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/plain',
        'text/csv',
        'application/rtf',
        'application/zip',
        'application/x-zip-compressed',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
      ],
    },

    // File size in bytes (before encryption)
    size_bytes: {
      type: Number,
      required: true,
      min: 1,
    },

    // GridFS file ID where the ENCRYPTED file is stored
    gridfs_id: {
      type: Schema.Types.ObjectId,
      required: true,
      select: false, // don't expose internal storage ID
    },

    // File Encryption Key (FEK) encrypted with user's master key
    // This is the ENCRYPTED key — never store plaintext FEK
    encrypted_fek: {
      type: String,
      required: true,
      select: false,
    },

    // Metadata for unwrapping the FEK
    wrap_iv: {
      type: String,
      required: true,
      select: false,
    },

    wrap_auth_tag: {
      type: String,
      required: true,
      select: false,
    },

    // Salt used for deriving the master key for this specific wrapping (optional but recommended)
    master_salt: {
      type: String,
      required: true,
      select: false,
    },

    // AES-256-GCM initialisation vector for the FILE content
    iv: {
      type: String,
      required: true,
      select: false,
    },

    // AES-256-GCM authentication tag for the FILE content
    auth_tag: {
      type: String,
      required: true,
      select: false,
    },

    // Soft delete — never hard delete files immediately
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Compound index: user's non-deleted files, sorted by newest
FileSchema.index({ user_id: 1, is_deleted: 1, created_at: -1 });

// Instance method for soft delete
FileSchema.methods.softDelete = async function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  await this.save();
};

// Always exclude deleted files from default queries
FileSchema.pre(/^find/, function (next) {
  // Only apply if is_deleted filter not explicitly set
  if (this.getFilter().is_deleted === undefined) {
    this.where({ is_deleted: false });
  }
  next();
});

const File = mongoose.model('File', FileSchema);


// ─────────────────────────────────────────────
// 3. ID CARD
// ─────────────────────────────────────────────
const IDCardSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    card_type: {
      type: String,
      required: true,
      enum: ['student', 'employee', 'driver_license', 'passport', 'national_id', 'other'],
    },

    card_holder_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // Stored as provided — display layer should mask it
    // e.g. show only last 4 chars
    card_number: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      select: false, // requires explicit selection
    },

    issuer: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    expiry_date: {
      type: Date,
    },

    // GridFS ID of the uploaded card image (encrypted, same flow as files)
    card_image_gridfs_id: {
      type: Schema.Types.ObjectId,
      default: null,
      select: false,
    },

    // Color theme for UI display
    display_color: {
      type: String,
      enum: ['indigo', 'teal', 'purple', 'amber', 'rose', 'slate'],
      default: 'indigo',
    },

    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

IDCardSchema.index({ user_id: 1, is_deleted: 1 });

IDCardSchema.pre(/^find/, function (next) {
  if (this.getFilter().is_deleted === undefined) {
    this.where({ is_deleted: false });
  }
  next();
});

const IDCard = mongoose.model('IDCard', IDCardSchema);


// ─────────────────────────────────────────────
// 4. SHARED LINK
// ─────────────────────────────────────────────
const SharedLinkSchema = new Schema(
  {
    file_id: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },

    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // HMAC-SHA256 token stored as hash — NEVER store raw token in DB
    // Raw token is only returned once at creation time
    token_hash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    // argon2id hash of optional access password
    password_hash: {
      type: String,
      default: null,
      select: false,
    },

    // Whether this link requires a password
    is_password_protected: {
      type: Boolean,
      default: false,
    },

    expiry_at: {
      type: Date,
      required: true,
      index: true,
    },

    download_limit: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },

    download_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Manually revoked by owner
    is_revoked: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Last accessed metadata (no PII, just for audit)
    last_accessed_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Virtual: is this link currently valid?
SharedLinkSchema.virtual('is_valid').get(function () {
  return (
    !this.is_revoked &&
    this.expiry_at > new Date() &&
    this.download_count < this.download_limit
  );
});

// Instance method: record an access
SharedLinkSchema.methods.recordAccess = async function () {
  this.download_count += 1;
  this.last_accessed_at = new Date();
  await this.save();
};

const SharedLink = mongoose.model('SharedLink', SharedLinkSchema);


// ─────────────────────────────────────────────
// 5. AUDIT LOG
// ─────────────────────────────────────────────
const AUDIT_ACTIONS = Object.freeze({
  REGISTER: 'register',
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  GOOGLE_OAUTH: 'google_oauth',
  LOGOUT: 'logout',
  TOKEN_REFRESHED: 'token_refresh',
  PASSWORD_CHANGED: 'password_change',
  PASSWORD_RESET_REQUESTED: 'password_reset_request',
  PASSWORD_RESET_COMPLETED: 'password_reset_complete',
  VAULT_UNLOCK: 'vault_unlock',
  VAULT_UNLOCK_FAILED: 'vault_unlock_fail',
  FILE_UPLOAD: 'file_upload',
  FILE_DOWNLOAD: 'file_download',
  FILE_DELETE: 'file_delete',
  FILE_VIEW: 'file_view',
  SHARE_CREATE: 'share_create',
  SHARE_ACCESS: 'share_access',
  SHARE_ACCESS_FAILED: 'share_access_failed',
  SHARE_REVOKE: 'share_revoke',
  QR_GENERATE: 'qr_generate',
  QR_SCAN: 'qr_scan',
  QR_SCAN_FAILED: 'qr_scan_failed',
  CARD_CREATE: 'card_create',
  CARD_UPDATE: 'card_update',
  CARD_DELETE: 'card_delete',
  ACCOUNT_LOCKED: 'account_locked',
  SESSION_REVOKE: 'session_revoke',
});

const AuditLogSchema = new Schema(
  {
    // null for unauthenticated actions (e.g. failed login attempt)
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    action: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_ACTIONS),
      index: true,
    },

    // What was acted on
    resource_id: {
      type: String, // string to accommodate different ID formats
      default: null,
    },
    resource_type: {
      type: String,
      enum: ['file', 'id_card', 'shared_link', 'user', 'qr', null],
      default: null,
    },

    // Network info
    ip_address: {
      type: String,
      required: true,
    },
    user_agent: {
      type: String,
      maxlength: 512,
    },

    success: {
      type: Boolean,
      required: true,
    },

    // Non-sensitive extra context (e.g. { mime_type: 'application/pdf', size_bytes: 204800 })
    // NEVER store passwords, tokens, or keys here
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    // Only createdAt — logs are immutable, no updatedAt
    timestamps: { createdAt: 'timestamp', updatedAt: false },
  }
);

// TTL index: auto-delete audit logs older than 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound index for querying a user's logs by action and time
AuditLogSchema.index({ user_id: 1, action: 1, timestamp: -1 });

// Static helper for creating log entries cleanly
AuditLogSchema.statics.log = async function ({
  user_id = null,
  action,
  resource_id = null,
  resource_type = null,
  ip_address,
  user_agent = '',
  success,
  metadata = {},
}) {
  try {
    await this.create({
      user_id,
      action,
      resource_id,
      resource_type,
      ip_address,
      user_agent,
      success,
      metadata,
    });
  } catch (err) {
    // Audit log failures must NEVER crash the main request flow
    console.error('[AuditLog] Failed to write log entry:', err.message);
  }
};

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  User,
  File,
  IDCard,
  SharedLink,
  AuditLog,
  AUDIT_ACTIONS,
};
