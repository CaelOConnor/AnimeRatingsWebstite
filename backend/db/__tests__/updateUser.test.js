import { describe, it, expect, afterEach } from 'vitest';
import { createUser, updateUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

// The main user we'll be updating in most tests
const BASE_USER = {
  username: 'update_tester',
  email: 'update_tester@example.com',
  passwordHash: '$2b$10$fakehashfortest',
};

// A second user used to test unique-conflict cases (e.g. "is username taken?")
const OTHER_USER = {
  username: 'other_update_user',
  email: 'other_update_user@example.com',
  passwordHash: '$2b$10$fakehashfortest',
};

// Clean up both users after every test so rows never bleed into the next one
afterEach(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [BASE_USER.email]);
  await query(`DELETE FROM users WHERE email = $1`, [OTHER_USER.email]);

  // Also catch cases where a test successfully updated the email away from BASE_USER.email
  await query(`DELETE FROM users WHERE email = $1`, ['updated_email@example.com']);
  await query(`DELETE FROM users WHERE username = $1`, ['updated_username']);
});

// ---------------------------------------------------------------------------
// Helper — inserts BASE_USER and returns the created row (we need the id)
// ---------------------------------------------------------------------------

// We need the user's id to call updateUser, so this helper creates the user
// and hands back the full row in one step rather than repeating it every test
async function createBaseUser() {
  return createUser(BASE_USER);
}

// ---------------------------------------------------------------------------
// General behaviour
// ---------------------------------------------------------------------------

describe('updateUser — general', () => {

  it('returns the updated user row after a successful update', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { bio: 'My new bio' });

    // Should hand back the updated row so the caller doesn't need a second query
    expect(updated).toBeDefined();
    expect(updated.id).toBe(user.id);
  });

  it('returns a single object, not an array', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { bio: 'test' });

    expect(Array.isArray(updated)).toBe(false);
    expect(typeof updated).toBe('object');
  });

  it('never returns password_hash in the result', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { bio: 'test' });

    // password_hash must never leak out of an update response
    expect(updated.password_hash).toBeUndefined();
  });

  it('throws (or returns null) when the user id does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    // Either throwing an error or returning null is acceptable —
    // the route layer will handle whichever signal comes back
    await expect(
      updateUser(fakeId, { bio: 'ghost' })
    ).rejects.toThrow();
    // If you choose to return null instead, swap the above for:
    // const result = await updateUser(fakeId, { bio: 'ghost' });
    // expect(result == null).toBe(true);
  });

  it('throws when no fields are passed in', async () => {
    const user = await createBaseUser();

    // Calling updateUser with an empty object is almost certainly a bug
    // on the caller's side, so we should reject it rather than run a no-op query
    await expect(updateUser(user.id, {})).rejects.toThrow();
  });

  it('ignores disallowed fields and does not throw', async () => {
    const user = await createBaseUser();

    // A caller should never be able to escalate their own role or unban themselves
    // by sneaking those fields through updateUser
    const updated = await updateUser(user.id, {
      bio: 'legitimate update',
      role_type: 'admin',   // not allowed
      is_banned: false,     // not allowed
    });

    // The bio change should go through, but role_type must be unchanged
    expect(updated.bio).toBe('legitimate update');
    expect(updated.role_type).toBe('user'); // default from createUser
  });

});

// ---------------------------------------------------------------------------
// Updating individual allowed fields
// ---------------------------------------------------------------------------

describe('updateUser — allowed fields', () => {

  it('can update bio on its own', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { bio: 'Anime fan since 2005' });

    expect(updated.bio).toBe('Anime fan since 2005');
  });

  it('can update avatar_url on its own', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, {
      avatar_url: 'https://example.com/avatar.png',
    });

    expect(updated.avatar_url).toBe('https://example.com/avatar.png');
  });

  it('can update username on its own', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { username: 'updated_username' });

    expect(updated.username).toBe('updated_username');
  });

  it('can update email on its own', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { email: 'updated_email@example.com' });

    // Email should be stored lowercase just like createUser does
    expect(updated.email).toBe('updated_email@example.com');
  });

  it('can update multiple fields at once', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, {
      bio: 'Updated bio',
      avatar_url: 'https://example.com/new.png',
    });

    // Both fields should reflect the new values in a single call
    expect(updated.bio).toBe('Updated bio');
    expect(updated.avatar_url).toBe('https://example.com/new.png');
  });

});

// ---------------------------------------------------------------------------
// Partial update behaviour — untouched fields must not change
// ---------------------------------------------------------------------------

describe('updateUser — partial update (untouched fields stay the same)', () => {

  it('does not wipe username when only bio is updated', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, { bio: 'Just changing bio' });

    // Username was not passed in — it should still be exactly as created
    expect(updated.username).toBe(BASE_USER.username);
  });

  it('does not wipe email when only avatar_url is updated', async () => {
    const user = await createBaseUser();

    const updated = await updateUser(user.id, {
      avatar_url: 'https://example.com/pic.jpg',
    });

    expect(updated.email).toBe(BASE_USER.email);
  });

  it('does not wipe bio when only username is updated', async () => {
    // First give the user a bio so there is something to accidentally wipe
    const user = await createBaseUser();
    await updateUser(user.id, { bio: 'Bio that should survive' });

    const updated = await updateUser(user.id, { username: 'updated_username' });

    expect(updated.bio).toBe('Bio that should survive');
  });

});

// ---------------------------------------------------------------------------
// Unique constraint conflicts (username and email)
// ---------------------------------------------------------------------------

describe('updateUser — unique conflicts', () => {

  it('throws "Username is already taken" when switching to an existing username', async () => {
    // Create two users — then try to rename BASE_USER to OTHER_USER's username
    const user = await createBaseUser();
    await createUser(OTHER_USER);

    await expect(
      updateUser(user.id, { username: OTHER_USER.username })
    ).rejects.toThrow('Username is already taken');
  });

  it('throws "Email is already registered" when switching to an existing email', async () => {
    const user = await createBaseUser();
    await createUser(OTHER_USER);

    await expect(
      updateUser(user.id, { email: OTHER_USER.email })
    ).rejects.toThrow('Email is already registered');
  });

  it('does not throw when updating to the same username the user already has', async () => {
    // This can happen if the frontend sends the full profile form unchanged —
    // it should be treated as a no-op, not a conflict error
    const user = await createBaseUser();

    await expect(
      updateUser(user.id, { username: BASE_USER.username })
    ).resolves.not.toThrow();
  });

  it('does not throw when updating to the same email the user already has', async () => {
    const user = await createBaseUser();

    await expect(
      updateUser(user.id, { email: BASE_USER.email })
    ).resolves.not.toThrow();
  });

});