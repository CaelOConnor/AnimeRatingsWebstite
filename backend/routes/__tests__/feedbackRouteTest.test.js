import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let user, token;

beforeAll(async () => {
  ({ user, token } = await createTestUser());
});

afterAll(async () => {
  await query(`DELETE FROM feedback WHERE user_id = $1`, [user.id]);
  await query(`DELETE FROM users WHERE id = $1`, [user.id]);
});

// ---------------------------------------------------------------------------
// POST /api/feedback
// ---------------------------------------------------------------------------

describe('POST /api/feedback', () => {
  it('returns 201 for a valid show_request', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'show_request', content: 'Please add Frieren season 2.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'show_request',
      content: 'Please add Frieren season 2.',
      user_id: user.id,
    });
  });

  it('returns 201 for a valid bug_report', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'bug_report', content: 'Star ratings look off on mobile.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'bug_report',
      content: 'Star ratings look off on mobile.',
    });
  });

  it('returns 400 for an invalid type', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'not_a_real_type', content: 'Whatever.' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when content is missing', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'bug_report' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when content is empty/whitespace', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'bug_report', content: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when content exceeds the max length', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'bug_report', content: 'a'.repeat(1001) });

    expect(res.status).toBe(400);
  });

  it('accepts content at exactly the max length', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'bug_report', content: 'a'.repeat(1000) });

    expect(res.status).toBe(201);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request
      .post('/api/feedback')
      .send({ type: 'bug_report', content: 'No auth.' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is malformed', async () => {
    const res = await request
      .post('/api/feedback')
      .set('Authorization', 'Bearer not.a.real.token')
      .send({ type: 'bug_report', content: 'Bad token.' });

    expect(res.status).toBe(401);
  });
});
