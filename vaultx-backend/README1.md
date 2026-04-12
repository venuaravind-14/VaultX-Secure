# VaultX Secure — Backend

Production-grade, highly secure Node.js + Express backend for an enterprise-level file vault and digital identity platform.

## 🚀 Technical Highlights
- **End-to-End Encryption (E2EE)**: Files are encrypted using AES-256-GCM via Node streams before storage into MongoDB GridFS.
- **Asymmetric Key Wrapping**: Each file gets a unique AES-256 File Encryption Key (FEK), which is wrapped using the User's Master Key (PBKDF2 generated).
- **Identity Verification**: Signed JWT tokens embedded in QR codes for document verification (no raw PII embedded).
- **Security Protocols**: argon2id hashing, short-lived JWT + httpOnly rotating refresh cookies, Rate limiting, progressive slow-downs, strict CSP helmet headers.
- **Immutable Audit Logging**: Captures success/failure for all sensitive security primitives.

## 🛠️ Tech Stack
- **Node.js** + **Express**
- **MongoDB** + **Mongoose** + **GridFS**
- **Security**: Node builtin `crypto` module, `argon2`, `jsonwebtoken`, `passport-google-oauth20`, `helmet`, `express-rate-limit`.

## 📦 Project Structure
```text
vaultx-backend/
├── src/
│   ├── config/     # MongoDB, Winston Logger, Typed Env Validation
│   ├── controllers/# Business logic (auth, files, idcards, sharing, qr, audit)
│   ├── middleware/ # Auth (JWT/Passport), Multer file upload, Rate-limiters, generic validate
│   ├── models/     # Mongoose Schemas (User, File, IDCard, SharedLink, AuditLog)
│   ├── routes/     # Express route handlers
│   ├── services/   # cryptoService, emailService, qrService
│   └── utils/      # Standardized api responses, asyncHandler
├── tests/          # Integration & unit testing per module
├── app.js          # Express app factory
└── server.js       # Main entry/listening file
```

## 🚥 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)

### 1. Installation
```bash
git clone <repository_url>
cd vaultx-backend
npm install
```

### 2. Environment Setup
Create a `.env` file in the root of the project. You can copy the contents of `.env.example`:
```bash
cp .env.example .env
```
Refer to the "ENV VARIABLES GUIDE" below to fill out required secrets, such as `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_MASTER_KEY` etc.

### 3. Running the Server

**Development Mode (Nodemon):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

### 4. Running Tests
```bash
npm test
```

## 🔐 ENV VARIABLES GUIDE

| Variable | Description |
| --- | --- |
| `PORT` | API server port (default 5000) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI` | MongoDB connection string (e.g. `mongodb://localhost:27017/vaultx`) |
| `JWT_ACCESS_SECRET` | 64-byte hex string. Signs the short-lived access tokens. |
| `JWT_REFRESH_SECRET` | 64-byte hex string. Signs the long-lived refresh tokens. |
| `JWT_ACCESS_EXPIRES_IN` | 15m (15 minutes) |
| `JWT_REFRESH_EXPIRES_IN` | 7d (7 days) |
| `QR_SECRET` | 64-byte hex string for generating Signed QR payloads. |
| `ENCRYPTION_MASTER_KEY` | Exact 32 bytes (64 hex characters) AES-256 Master wrapper key. |
| `GOOGLE_CLIENT_ID` / `SECRET` | Your Google API Console OAuth credentials. |
| `FRONTEND_URL` | Base URL of frontend (for CORS and email callback links, e.g., `http://localhost:3000`). |
| `EMAIL_*` | SMTP credentials used for Password Resets via `nodemailer`. |
