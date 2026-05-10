import { describe, it, expect, afterEach } from 'vitest';
import { createUser, banUser, getUserById } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const BASE_USER = {
  username: 'ban_tester',
  email: 'ban_tester@example.com',
  passwordHash: '$2b$10$fakehashfortest',
};

afterEach(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [BASE_USER.email]);
});

async function createBaseUser() {
  return createUser(BASE_USER);
}

// ---------------------------------------------------------------------------
// banUser
// ---------------------------------------------------------------------------

describe('banUser', () => {

  it('sets is_banned to true for the given user', async () => {
    const user = await createBaseUser();

    await banUser(user.id);

    // Fetch fresh from DB to confirm the change actually persisted
    const updated = await getUserById(user.id);
    expect(updated.is_banned).toBe(true);
  });

  it('returns the updated user row', async () => {
    const user = await createBaseUser();

    const result = await banUser(user.id);

    expect(result).toBeDefined();
    expect(result.id).toBe(user.id);
    expect(result.is_banned).toBe(true);
  });

  it('does not return password_hash', async () => {
    const user = await createBaseUser();

    const result = await banUser(user.id);

    expect(result.password_hash).toBeUndefined();
  });

  it('returns all expected safe fields', async () => {
    const user = await createBaseUser();

    const result = await banUser(user.id);

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('username');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('avatar_url');
    expect(result).toHaveProperty('bio');
    expect(result).toHaveProperty('is_banned');
    expect(result).toHaveProperty('role_type');
    expect(result).toHaveProperty('created_at');
  });

  it('does not affect any other fields when banning', async () => {
    const user = await createBaseUser();

    const result = await banUser(user.id);

    // Only is_banned should have changed — everything else should match
    // what was set at creation time
    expect(result.username).toBe(BASE_USER.username);
    expect(result.email).toBe(BASE_USER.email);
    expect(result.role_type).toBe('user');
  });

  it('throws when the user id does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    await expect(banUser(fakeId)).rejects.toThrow('User not found');
  });

  it('throws when no id is passed in', async () => {
    await expect(banUser()).rejects.toThrow('id is required');
  });

  it('does not throw when banning a user who is already banned', async () => {
    // Banning someone twice should be a safe no-op — a mod might not know
    // another mod already banned the same user
    const user = await createBaseUser();
    await banUser(user.id);

    await expect(banUser(user.id)).resolves.not.toThrow();
  });

  it('returns a single object, not an array', async () => {
    const user = await createBaseUser();

    const result = await banUser(user.id);

    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
  });

});