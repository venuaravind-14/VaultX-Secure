'use strict';

/**
 * @file auth.test.js
 * @description Integration tests for authentication flows.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const { User, File, IDCard, SharedLink, AuditLog } = require('../src/models/models');
const { connectDB, disconnectDB } = require('../src/config/db');

// Use a separate test DB
const TEST_DB = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/vaultx_test';

beforeAll(async () => {
  await connectDB(TEST_DB);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

afterEach(async () => {
  await User.deleteMany({});
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const validUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'SecurePass@1234!',
};

const registerUser = (overrides = {}) =>
  request(app).post('/api/v1/auth/register').send({ ...validUser, ...overrides });

// ── Register ───────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  it('should register a new user and return access token', async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data.user).toHaveProperty('email', validUser.email);
    // Sensitive fields must NOT be exposed
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('refresh_token_hash');
  });

  it('should reject registration with weak password', async () => {
    const res = await registerUser({ password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it('should reject duplicate email', async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should reject invalid email format', async () => {
    const res = await registerUser({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('should require name field', async () => {
    const res = await registerUser({ name: '' });
    expect(res.status).toBe(400);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('access_token');
  });

  it('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'WrongPassword@123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('should reject non-existent email with same generic message (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'SomePassword@123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('should lock account after 5 failed attempts', async () => {
    // Make 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'WrongPass@123' });
    }
    // 6th attempt should see lockout message
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('should set httpOnly cookies on successful login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    const cookies = res.headers['set-cookie'] || [];
    const cookieNames = cookies.map((c) => c.split('=')[0]);
    expect(cookieNames).toContain('access_token');
    // Verify HttpOnly attribute
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });
});

// ── Get Current User ───────────────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  it('should return current user when authenticated', async () => {
    const reg = await registerUser();
    const token = reg.body.data.access_token;

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
  });

  it('should return 401 without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer totallyinvalidtoken.xxx.yyy');
    expect(res.status).toBe(401);
  });
});

// ── Token Refresh ──────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/refresh', () => {
  it('should refresh token using cookie', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    // Extract refresh_token cookie
    const cookies = loginRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data).toHaveProperty('access_token');
  });

  it('should reject invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refresh_token=badtoken']);
    expect(res.status).toBe(401);
  });
});

// ── Logout ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/logout', () => {
  it('should logout and clear cookies', async () => {
    const reg = await registerUser();
    const token = reg.body.data.access_token;

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

// ── Password Reset Flow ────────────────────────────────────────────────────────
describe('Password Reset Flow', () => {
  it('should always return 200 on forgot-password (prevent enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject reset with invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password/invalidtoken')
      .send({ new_password: 'AnotherSecure@1234!' });
    expect(res.status).toBe(400);
  });
});

// ── PIN Management ─────────────────────────────────────────────────────────────
describe('PIN Management', () => {
  let token;
  beforeEach(async () => {
    const reg = await registerUser();
    token = reg.body.data.access_token;
  });

  it('should set a PIN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '123456' });
    expect(res.status).toBe(200);
  });

  it('should verify a correct PIN', async () => {
    await request(app)
      .post('/api/v1/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '654321' });

    const res = await request(app)
      .post('/api/v1/auth/verify-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '654321' });
    expect(res.status).toBe(200);
  });

  it('should reject wrong PIN', async () => {
    await request(app)
      .post('/api/v1/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '111111' });

    const res = await request(app)
      .post('/api/v1/auth/verify-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '999999' });
    expect(res.status).toBe(401);
  });

  it('should reject PIN that is not 6 digits', async () => {
    const res = await request(app)
      .post('/api/v1/auth/set-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '12345' }); // Only 5 digits
    expect(res.status).toBe(400);
  });
});
