import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import bcrypt from 'bcrypt';
import { query } from '../../db/db.js';

describe('POST /api/auth/register', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: `newuser_${Date.now()}`,
        email:    `newuser_${Date.now()}@example.com`,
        password: 'Password1!',
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: `different_${Date.now()}`,
        email:    user.email,
        password: 'Password1!',
      });

    expect(res.status).toBe(409);
  });

  it('rejects duplicate username', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: user.username,
        email:    `different_${Date.now()}@example.com`,
        password: 'Password1!',
      });

    expect(res.status).toBe(409);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'onlyusername' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  let testEmail;
  let testUsername;
  const plainPassword = 'Password1!';

  beforeAll(async () => {
    const suffix = Date.now();
    testEmail    = `logintest_${suffix}@example.com`;
    testUsername = `logintest_${suffix}`;

    const passwordHash = await bcrypt.hash(plainPassword, 10);
    await createTestUser({
      username:     testUsername,
      email:        testEmail,
      passwordHash,
    });
  });

  it('logs in successfully with email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testEmail, password: plainPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(testUsername);
  });

  it('logs in successfully with username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testUsername, password: plainPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(testUsername);
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testEmail, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects non-existent identifier', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody@nowhere.com', password: plainPassword });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testEmail });

    expect(res.status).toBe(400);
  });

  it('rejects a banned user', async () => {
    const suffix       = Date.now();
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const { user }     = await createTestUser({
      username:     `banned_${suffix}`,
      email:        `banned_${suffix}@example.com`,
      passwordHash,
    });

    await query(`UPDATE users SET is_banned = true WHERE id = $1`, [user.id]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email, password: plainPassword });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This account has been suspended');
  });
});

describe('POST /api/auth/logout', () => {
  it('logs out successfully with a valid token', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('rejects logout without a token', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with a valid token', async () => {
    const { user, token } = await createTestUser();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('rejects request without a token', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer faketoken123');

    expect(res.status).toBe(401);
  });
});