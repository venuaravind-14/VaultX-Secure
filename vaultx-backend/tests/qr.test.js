'use strict';

/**
 * @file qr.test.js
 * @description Integration tests for QR code generation and verification.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const { User, File, IDCard } = require('../src/models/models');
const { connectDB, disconnectDB } = require('../src/config/db');

const TEST_DB = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/vaultx_test';

let accessToken;
let idCardId;
let qrToken;

beforeAll(async () => {
  await connectDB(TEST_DB);

  // Register + login
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'QR Tester', email: 'qr@example.com', password: 'QrTest@1234!' });
  accessToken = reg.body.data.access_token;

  // Create an ID card to generate QR against
  const card = await request(app)
    .post('/api/idcards')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      card_type: 'employee',
      card_holder_name: 'John Doe',
      card_number: 'EMP-12345',
      issuer: 'VaultX Corp',
      expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  idCardId = card.body.data.card._id;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

// ── Generate QR ─────────────────────────────────────────────────────────────
describe('POST /api/qr/generate', () => {
  it('should generate a QR code for a valid ID card', async () => {
    const res = await request(app)
      .post('/api/qr/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'idcard', resource_id: idCardId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('qr_image');
    expect(res.body.data.qr_image).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data).toHaveProperty('token');
    
    qrToken = res.body.data.token;
  });

  it('should reject QR generation for a non-existent resource', async () => {
    const res = await request(app)
      .post('/api/qr/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'idcard', resource_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('should reject invalid resource types', async () => {
    const res = await request(app)
      .post('/api/qr/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'unsupported', resource_id: idCardId });
    expect(res.status).toBe(400);
  });
});

// ── Verify QR ───────────────────────────────────────────────────────────────
describe('GET /api/qr/verify/:token', () => {
  it('should explicitly verify a valid QR token and return metadata, without auth', async () => {
    const res = await request(app)
      .get(`/api/qr/verify/${qrToken}`);
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.resource.type).toBe('idcard');
    expect(res.body.data.resource.holder).toBe('John Doe');
    
    // Ensure sensitive raw fields are omitted
    expect(res.body.data.resource.card_number).toBeUndefined();
  });

  it('should reject an invalid or tampered QR token', async () => {
    const res = await request(app)
      .get('/api/qr/verify/invalid.jwt.token');
    expect(res.status).toBe(401);
  });
});
