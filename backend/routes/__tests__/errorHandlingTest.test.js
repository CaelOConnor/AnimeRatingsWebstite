import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Regression coverage for app.js's global error handler correctly passing
// through body-parser's own status codes instead of flattening everything
// to 500 — confirmed live (malformed JSON/oversized body both used to come
// back as 500) before this fix. The process-level unhandledRejection/
// uncaughtException handlers and the Redis-denylist-timeout fix from the
// same pass aren't covered here — they require killing a real process or a
// real Redis container, which isn't something this suite can safely do; see
// the live verification done separately.
// ---------------------------------------------------------------------------

describe('global error handler — body-parser errors', () => {
  it('returns 400, not 500, for a malformed JSON body', async () => {
    const res = await request
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identifier": "bad json missing brace"');

    expect(res.status).toBe(400);
  });

  it('returns 413, not 500, for a body over the configured limit', async () => {
    const oversized = JSON.stringify({ identifier: 'x'.repeat(200_000), password: 'y' });

    const res = await request
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
  });
});
