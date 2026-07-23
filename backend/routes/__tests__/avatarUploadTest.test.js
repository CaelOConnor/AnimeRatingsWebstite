import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// Matches AVATARS_DIR in routes/users.js — also the literal path app.js
// serves statically under /uploads, so it's already a de facto contract
// rather than an internal implementation detail worth exporting just for
// this test.
const AVATARS_DIR = '/app/uploads/avatars';

// Minimal real PNG: the 8-byte signature file-type's detector keys off of,
// plus a plausible (not necessarily spec-perfect) IHDR chunk. Enough for
// magic-byte detection without needing a fully valid, renderable image.
const REAL_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
]);

let user, token;

beforeAll(async () => {
  ({ user, token } = await createTestUser());
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE id = $1`, [user.id]);
});

describe('POST /api/users/:id/avatar — content-based type validation', () => {
  it('rejects a file whose magic bytes do not match an allowed image type, even with a spoofed Content-Type', async () => {
    const res = await request
      .post(`/api/users/${user.id}/avatar`)
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', Buffer.from('this is plain text pretending to be a PNG'), {
        filename: 'fake.png',
        contentType: 'image/png', // spoofed — actual bytes are plain text
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match an allowed image type/i);
  });

  it('accepts a file whose magic bytes genuinely match an allowed image type', async () => {
    const res = await request
      .post(`/api/users/${user.id}/avatar`)
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', REAL_PNG_BYTES, { filename: 'real.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.avatar_url).toMatch(/^\/uploads\/avatars\//);

    // cleanup this test's own file
    const filename = res.body.avatar_url.split('/').pop();
    await fs.promises.unlink(path.join(AVATARS_DIR, filename)).catch(() => {});
  });
});

describe('POST /api/users/:id/avatar — old avatar cleanup', () => {
  it('deletes the previous avatar file from disk after a second upload replaces it', async () => {
    const first = await request
      .post(`/api/users/${user.id}/avatar`)
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', REAL_PNG_BYTES, { filename: 'first.png', contentType: 'image/png' });

    expect(first.status).toBe(200);
    const firstFilename = first.body.avatar_url.split('/').pop();
    const firstPath = path.join(AVATARS_DIR, firstFilename);
    expect(fs.existsSync(firstPath)).toBe(true);

    // Ensure the second upload gets a distinct Date.now()-based filename
    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await request
      .post(`/api/users/${user.id}/avatar`)
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', REAL_PNG_BYTES, { filename: 'second.png', contentType: 'image/png' });

    expect(second.status).toBe(200);
    const secondFilename = second.body.avatar_url.split('/').pop();
    expect(secondFilename).not.toBe(firstFilename);

    // The route awaits cleanup before responding, so this is safe to assert
    // immediately — no arbitrary sleep needed.
    expect(fs.existsSync(firstPath)).toBe(false);

    const secondPath = path.join(AVATARS_DIR, secondFilename);
    expect(fs.existsSync(secondPath)).toBe(true);

    // cleanup this test's own file
    await fs.promises.unlink(secondPath).catch(() => {});
  });

  it('does not error when the user had no previous avatar to clean up', async () => {
    const { user: freshUser, token: freshToken } = await createTestUser();

    const res = await request
      .post(`/api/users/${freshUser.id}/avatar`)
      .set('Authorization', `Bearer ${freshToken}`)
      .attach('avatar', REAL_PNG_BYTES, { filename: 'first-ever.png', contentType: 'image/png' });

    expect(res.status).toBe(200);

    const filename = res.body.avatar_url.split('/').pop();
    await fs.promises.unlink(path.join(AVATARS_DIR, filename)).catch(() => {});
    await query(`DELETE FROM users WHERE id = $1`, [freshUser.id]);
  });
});
