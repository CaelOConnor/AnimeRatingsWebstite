import { describe, it, expect, afterEach } from 'vitest';
import { createUser, getUserByEmail, getUserByUsername, getUserById } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Shared test data
// We define one "base" user that most tests will insert, then clean up after
// each test so rows never bleed into the next one.
// ---------------------------------------------------------------------------

const BASE_USER = {
  username: 'testuser_lookup',
  email: 'lookup@example.com',
  passwordHash: '$2b$10$fakehashfortest', // bcrypt hash shape — not actually valid
};

async function createBaseUser() {
  return createUser(BASE_USER);
}

// afterEach runs after every single `it` block in this file.
// It deletes any rows our tests inserted, identified by email address.
// This keeps the DB clean regardless of whether a test passed or failed.
afterEach(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [BASE_USER.email]);

  // Also clean up any extra users created inside specific tests
  await query(`DELETE FROM users WHERE email = $1`, ['other@example.com']);
});


// ---------------------------------------------------------------------------
// getUserByEmail
// ---------------------------------------------------------------------------

describe('getUserByEmail', () => {

  it('returns the correct user when the email exists', async () => {
    // First insert a user so there is something to look up
    await createUser(BASE_USER);

    const user = await getUserByEmail(BASE_USER.email);

    // Should come back with matching core fields
    expect(user.email).toBe(BASE_USER.email);
    expect(user.username).toBe(BASE_USER.username);
  });

  it('includes password_hash in the result (login route needs it to compare)', async () => {
    // Unlike createUser (which strips the hash), getUserByEmail MUST return
    // password_hash so the auth route can run bcrypt.compare() against it.
    await createUser(BASE_USER);

    const user = await getUserByEmail(BASE_USER.email);

    expect(user.password_hash).toBeDefined();
    expect(typeof user.password_hash).toBe('string');
  });

  it('returns null (or undefined) when the email does not exist', async () => {
    // No row inserted — the function should signal "not found" without throwing
    const user = await getUserByEmail('doesnotexist@example.com');

    // Accepts either null or undefined — just not an error and not a real user
    expect(user == null).toBe(true);
  });

  it('is case-insensitive for email lookup', async () => {
    // createUser lowercases before insert; lookup should also be forgiving
    // so "Lookup@Example.COM" still finds the row stored as "lookup@example.com"
    await createUser(BASE_USER);

    const user = await getUserByEmail('LOOKUP@EXAMPLE.COM');

    expect(user).not.toBeNull();
    expect(user.email).toBe(BASE_USER.email); // stored form is lowercase
  });

  it('returns all expected safe fields on a found user', async () => {
    await createUser(BASE_USER);

    const user = await getUserByEmail(BASE_USER.email);

    // These are the fields the login route and /me route will actually use.
    // If any are missing you'll get silent undefined bugs, so we check explicitly.
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('role_type');
    expect(user).toHaveProperty('is_banned');
    expect(user).toHaveProperty('created_at');
  });

  it('returns a single object, not an array', async () => {
    await createUser(BASE_USER);

    const user = await getUserByEmail(BASE_USER.email);

    // pg returns rows as arrays — make sure users.js unwraps it for the caller
    expect(Array.isArray(user)).toBe(false);
    expect(typeof user).toBe('object');
  });

});

// ---------------------------------------------------------------------------
// getUserByUsername
// ---------------------------------------------------------------------------

describe('getUserByUsername', () => {

  it('returns the correct user when the username exists', async () => {
    await createUser(BASE_USER);

    const user = await getUserByUsername(BASE_USER.username);

    expect(user.username).toBe(BASE_USER.username);
    expect(user.email).toBe(BASE_USER.email);
  });

  it('returns null (or undefined) when the username does not exist', async () => {
    const user = await getUserByUsername('ghost_user_xyz');

    expect(user == null).toBe(true);
  });

  it('does NOT include password_hash (username lookup is for profiles, not login)', async () => {
    // getUserByEmail needs the hash for login; getUserByUsername is used for
    // public profile pages where you should never expose the hash.
    await createUser(BASE_USER);

    const user = await getUserByUsername(BASE_USER.username);

    expect(user.password_hash).toBeUndefined();
  });

  it('returns all expected safe fields on a found user', async () => {
    await createUser(BASE_USER);

    const user = await getUserByUsername(BASE_USER.username);

    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('role_type');
    expect(user).toHaveProperty('is_banned');
    expect(user).toHaveProperty('created_at');
  });

  it('returns a single object, not an array', async () => {
    await createUser(BASE_USER);

    const user = await getUserByUsername(BASE_USER.username);

    expect(Array.isArray(user)).toBe(false);
    expect(typeof user).toBe('object');
  });

  it('does not return a different user when usernames are similar but not equal', async () => {
    // Sanity check: "testuser_lookup2" should not match "testuser_lookup"
    // Partial/prefix matches would be a serious bug.
    await createUser(BASE_USER);

    const user = await getUserByUsername('testuser_lookup2');

    expect(user == null).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// getUserById
// ---------------------------------------------------------------------------
 
describe('getUserById', () => {
 
  it('returns the correct user when the id exists', async () => {
    const created = await createBaseUser();
 
    const found = await getUserById(created.id);
 
    expect(found.id).toBe(created.id);
    expect(found.username).toBe(BASE_USER.username);
    expect(found.email).toBe(BASE_USER.email);
  });
 
  it('returns null when the id does not exist', async () => {
    // A valid UUID format that simply has no matching row
    const fakeId = '00000000-0000-0000-0000-000000000000';
 
    const found = await getUserById(fakeId);
 
    expect(found == null).toBe(true);
  });
 
  it('throws when no id is passed in', async () => {
    // The guard clause should catch this before a query ever runs
    await expect(getUserById()).rejects.toThrow('id is required');
  });
 
  it('does not return password_hash', async () => {
    // getUserById is used by the /me route — the hash should never
    // be sent back to the frontend
    const created = await createBaseUser();
 
    const found = await getUserById(created.id);
 
    expect(found.password_hash).toBeUndefined();
  });
 
  it('returns all expected safe fields', async () => {
    const created = await createBaseUser();
 
    const found = await getUserById(created.id);
 
    expect(found).toHaveProperty('id');
    expect(found).toHaveProperty('username');
    expect(found).toHaveProperty('email');
    expect(found).toHaveProperty('avatar_url');
    expect(found).toHaveProperty('bio');
    expect(found).toHaveProperty('is_banned');
    expect(found).toHaveProperty('role_type');
    expect(found).toHaveProperty('created_at');
  });
 
  it('returns a single object, not an array', async () => {
    const created = await createBaseUser();
 
    const found = await getUserById(created.id);
 
    expect(Array.isArray(found)).toBe(false);
    expect(typeof found).toBe('object');
  });
 
  it('returns the correct user and not a different one', async () => {
    // Sanity check — make sure we are not just returning the first row in
    // the table, but actually filtering by the id we passed in
    const created = await createBaseUser();
 
    const found = await getUserById(created.id);
 
    expect(found.id).toBe(created.id);
  });
 
});
