'use strict';

/**
 * @file sharing.test.js
 * @description Integration tests for share link creation, access, expiry, and password protection.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const { User, File, SharedLink } = require('../src/models/models');
const { connectDB, disconnectDB } = require('../src/config/db');

const TEST_DB = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/vaultx_test';

let accessToken;
let fileId;
let shareToken;
let shareLinkId;

const FILE_CONTENT = Buffer.from('Shareable test content');

beforeAll(async () => {
  await connectDB(TEST_DB);

  // Register + login
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Share Tester', email: 'share@example.com', password: 'ShareTest@1234!' });
  accessToken = reg.body.data.access_token;

  // Upload a file to share
  const upload = await request(app)
    .post('/api/files')
    .set('Authorization', `Bearer ${accessToken}`)
    .attach('file', FILE_CONTENT, { filename: 'share.txt', contentType: 'text/plain' });
  fileId = upload.body.data.file.id;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

// ── Create Share Link ─────────────────────────────────────────────────────────
describe('POST /api/sharing', () => {
  it('should create a share link and return a one-time token', async () => {
    const res = await request(app)
      .post('/api/sharing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ file_id: fileId, expiry_hours: 1, download_limit: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('access_url');
    shareToken  = res.body.data.token;
    shareLinkId = res.body.data.share_id;
  });

  it('should create a password-protected share link', async () => {
    const res = await request(app)
      .post('/api/sharing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ file_id: fileId, expiry_hours: 1, password: 'LinkPass@123' });

    expect(res.status).toBe(201);
    expect(res.body.data.password_protected).toBe(true);
  });

  it('should reject share link for a non-owned file', async () => {
    const res = await request(app)
      .post('/api/sharing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ file_id: '00000000-0000-0000-0000-000000000000', expiry_hours: 1 });
    expect(res.status).toBe(404);
  });

  it('should reject share link with invalid expiry', async () => {
    const res = await request(app)
      .post('/api/sharing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ file_id: fileId, expiry_hours: 0 }); // 0 is below min of 1
    expect(res.status).toBe(400);
  });
});

// ── Access Share Link ─────────────────────────────────────────────────────────
describe('GET /api/sharing/access/:token', () => {
  it('should allow access with valid token and return decrypted file', async () => {
    const res = await request(app)
      .get(`/api/sharing/access/${shareToken}?link_id=${shareLinkId}`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe(FILE_CONTENT.toString());
  });

  it('should reject access with a tampered token', async () => {
    const res = await request(app)
      .get(`/api/sharing/access/badtoken?link_id=${shareLinkId}`);
    expect(res.status).toBe(401);
  });

  it('should reject access after download limit exceeded', async () => {
    // Create a link with limit of 1
    const createRes = await request(app)
      .post('/api/sharing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ file_id: fileId, expiry_hours: 1, download_limit: 1 });

    const { token: limitToken, share_id: limitId } = createRes.body.data;

    // First access should work
    const first = await request(app)
      .get(`/api/sharing/access/${limitToken}?link_id=${limitId}`)
      .buffer(true);
    expect(first.status).toBe(200);

    // Second access should be blocked
    const second = await request(app)
      .get(`/api/sharing/access/${limitToken}?link_id=${limitId}`);
    expect(second.status).toBe(410);
    expect(second.body.message).toMatch(/limit/i);
  });

  it('should block password-protected link when no password is given', async () => {
    const createRes = await request(app)
      .post('/api/sharing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ file_id: fileId, expiry_hours: 1, password: 'Secret@Pass1' });

    const { token: pwToken, share_id: pwId } = createRes.body.data;

    const res = await request(app)
      .get(`/api/sharing/access/${pwToken}?link_id=${pwId}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/password/i);
  });
});

// ── Revoke Share Link ─────────────────────────────────────────────────────────
describe('DELETE /api/sharing/:id (revoke)', () => {
  it('should revoke a share link', async () => {
    const revoke = await request(app)
      .delete(`/api/sharing/${shareLinkId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(revoke.status).toBe(200);

    // Access after revoke should fail
    const access = await request(app)
      .get(`/api/sharing/access/${shareToken}?link_id=${shareLinkId}`);
    expect(access.status).toBe(403);
    expect(access.body.message).toMatch(/revoked/i);
  });
});
