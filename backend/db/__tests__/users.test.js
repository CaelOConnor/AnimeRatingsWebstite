import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Clean up any users created during a test so tests don't bleed into each other
async function deleteUserByEmail(email) {
  await query('DELETE FROM users WHERE email = $1', [email]);
}

// ── createUser ────────────────────────────────────────────────────────────────

describe('createUser', () => {
  // Track emails created so we can clean them up after each test
  const created = [];

  afterEach(async () => {
    for (const email of created) {
      await deleteUserByEmail(email);
    }
    created.length = 0;
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns a user object with the correct username and email', async () => {
    const email = 'alice@example.com';
    created.push(email);

    const user = await createUser({
      username: 'alice',
      email,
      passwordHash: 'hashed_password_123',
    });

    expect(user.username).toBe('alice');
    expect(user.email).toBe('alice@example.com');
  });

  it('sets role_type to "user" by default', async () => {
    const email = 'bob@example.com';
    created.push(email);

    const user = await createUser({
      username: 'bob',
      email,
      passwordHash: 'hashed_password_123',
    });

    expect(user.role_type).toBe('user');
  });

  it('sets is_banned to false by default', async () => {
    const email = 'carol@example.com';
    created.push(email);

    const user = await createUser({
      username: 'carol',
      email,
      passwordHash: 'hashed_password_123',
    });

    expect(user.is_banned).toBe(false);
  });

  it('sets bio and avatar_url to null by default', async () => {
    const email = 'dave@example.com';
    created.push(email);

    const user = await createUser({
      username: 'dave',
      email,
      passwordHash: 'hashed_password_123',
    });

    expect(user.bio).toBeNull();
    expect(user.avatar_url).toBeNull();
  });

  it('returns an id (UUID)', async () => {
    const email = 'eve@example.com';
    created.push(email);

    const user = await createUser({
      username: 'eve',
      email,
      passwordHash: 'hashed_password_123',
    });

    expect(user.id).toBeDefined();
    expect(typeof user.id).toBe('string');
    // UUID v4 format check
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns a created_at timestamp', async () => {
    const email = 'frank@example.com';
    created.push(email);

    const user = await createUser({
      username: 'frank',
      email,
      passwordHash: 'hashed_password_123',
    });

    expect(user.created_at).toBeDefined();
    expect(user.created_at).toBeInstanceOf(Date);
  });

  it('does NOT return password_hash in the result', async () => {
    const email = 'grace@example.com';
    created.push(email);

    const user = await createUser({
      username: 'grace',
      email,
      passwordHash: 'hashed_password_123',
    });

    // password_hash must never be returned — not even accidentally
    expect(user.password_hash).toBeUndefined();
  });

  it('stores the email lowercased', async () => {
    const email = 'henry@example.com';
    created.push(email);

    const user = await createUser({
      username: 'henry',
      email: 'HENRY@EXAMPLE.COM',
      passwordHash: 'hashed_password_123',
    });

    expect(user.email).toBe('henry@example.com');
  });

  // ── Duplicate / conflict ────────────────────────────────────────────────────

  it('throws if the email is already taken', async () => {
    const email = 'duplicate@example.com';
    created.push(email);

    await createUser({
      username: 'original',
      email,
      passwordHash: 'hashed_password_123',
    });

    await expect(
      createUser({
        username: 'different_username',
        email,
        passwordHash: 'hashed_password_123',
      })
    ).rejects.toThrow('Email is already registered');
  });

  it('throws if the username is already taken', async () => {
    const email1 = 'user1@example.com';
    const email2 = 'user2@example.com';
    created.push(email1, email2);

    await createUser({
      username: 'takenname',
      email: email1,
      passwordHash: 'hashed_password_123',
    });

    await expect(
      createUser({
        username: 'takenname',
        email: email2,
        passwordHash: 'hashed_password_123',
      })
    ).rejects.toThrow('Username is already taken');
  });

  // ── Missing fields ──────────────────────────────────────────────────────────

  it('throws if username is missing', async () => {
    await expect(
      createUser({ email: 'nouser@example.com', passwordHash: 'hash' })
    ).rejects.toThrow();
  });

  it('throws if email is missing', async () => {
    await expect(
      createUser({ username: 'noemail', passwordHash: 'hash' })
    ).rejects.toThrow();
  });

  it('throws if passwordHash is missing', async () => {
    await expect(
      createUser({ username: 'nohash', email: 'nohash@example.com' })
    ).rejects.toThrow();
  });
});