'use strict';

/**
 * @file files.test.js
 * @description Integration tests for file upload, download, and encryption roundtrip.
 */

const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const app = require('../app');
const { User, File } = require('../src/models/models');
const { connectDB, disconnectDB } = require('../src/config/db');

const TEST_DB = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/vaultx_test';

let accessToken;
let uploadedFileId;

// Sample plaintext content (simulate a text file)
const FILE_CONTENT = Buffer.from('Hello VaultX! This is a test file for E2EE validation.');
const FILE_MD5 = crypto.createHash('md5').update(FILE_CONTENT).digest('hex');

beforeAll(async () => {
  await connectDB(TEST_DB);

  // Register + login a test user
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'File Tester', email: 'files@example.com', password: 'FileTest@1234!' });
  accessToken = reg.body.data.access_token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

// ── Upload ─────────────────────────────────────────────────────────────────────
describe('POST /api/files/upload', () => {
  it('should upload and encrypt a text file', async () => {
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FILE_CONTENT, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.file).toHaveProperty('id');
    uploadedFileId = res.body.data.file.id;
  });

  it('should reject upload without authentication', async () => {
    const res = await request(app)
      .post('/api/files')
      .attach('file', FILE_CONTENT, { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(401);
  });

  it('should reject disallowed MIME types', async () => {
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FILE_CONTENT, { filename: 'script.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(415);
  });

  it('should reject upload with no file field', async () => {
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── List ───────────────────────────────────────────────────────────────────────
describe('GET /api/files', () => {
  it('should return paginated list of user files', async () => {
    const res = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('files');
    expect(res.body.data).toHaveProperty('pagination');
    // Encryption secrets must NOT be in the list response
    res.body.data.files.forEach((f) => {
      expect(f).not.toHaveProperty('encrypted_fek');
      expect(f).not.toHaveProperty('iv');
      expect(f).not.toHaveProperty('auth_tag');
    });
  });
});

// ── Download + E2EE Roundtrip ──────────────────────────────────────────────────
describe('GET /api/files/:id (download)', () => {
  it('should download the file and return identical plaintext (E2EE roundtrip)', async () => {
    expect(uploadedFileId).toBeDefined();

    const res = await request(app)
      .get(`/api/files/${uploadedFileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain');

    // MD5 check: decrypted output must exactly match original input
    const downloadedMd5 = crypto.createHash('md5').update(res.body).digest('hex');
    expect(downloadedMd5).toBe(FILE_MD5);
  });

  it('should return 404 for a file owned by another user', async () => {
    // Register second user
    const reg2 = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other User', email: 'other@example.com', password: 'OtherPass@1234!' });
    const token2 = reg2.body.data.access_token;

    const res = await request(app)
      .get(`/api/files/${uploadedFileId}`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  it('should return 404 for a non-existent file ID', async () => {
    const res = await request(app)
      .get('/api/files/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

// ── File Info ──────────────────────────────────────────────────────────────────
describe('GET /api/files/:id/info', () => {
  it('should return file metadata without encryption secrets', async () => {
    const res = await request(app)
      .get(`/api/files/${uploadedFileId}/info`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.file).toHaveProperty('original_name');
    expect(res.body.data.file).not.toHaveProperty('encrypted_fek');
    expect(res.body.data.file).not.toHaveProperty('iv');
    expect(res.body.data.file).not.toHaveProperty('auth_tag');
  });
});

// ── Soft Delete ────────────────────────────────────────────────────────────────
describe('DELETE /api/files/:id', () => {
  it('should soft-delete a file', async () => {
    const del = await request(app)
      .delete(`/api/files/${uploadedFileId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(200);

    // Deleted file should no longer appear in list
    const list = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);
    const ids = list.body.data.files.map((f) => f._id);
    expect(ids).not.toContain(uploadedFileId);

    // Direct download should return 404
    const dl = await request(app)
      .get(`/api/files/${uploadedFileId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(dl.status).toBe(404);
  });
});
