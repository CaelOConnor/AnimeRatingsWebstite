import { query } from './db.js';

/**
 * createUser
 * ----------
 * Inserts a new user into the database.
 * All optional fields (bio, avatar_url) default to NULL in the DB.
 * role_type defaults to 'user', is_banned defaults to false.
 *
 * NOTE: passwordHash must already be bcrypt-hashed before calling this.
 * This function never does hashing — that stays in the auth route.
 *
 * @param {{ username: string, email: string, passwordHash: string }} params
 * @returns {Promise<object>} The created user (without password_hash)
 * @throws {Error} 'Email is already registered' | 'Username is already taken'
 */
export async function createUser({ username, email, passwordHash }) {
  if (!username) throw new Error('username is required');
  if (!email)    throw new Error('email is required');
  if (!passwordHash) throw new Error('passwordHash is required');

  // Check for conflicts first and give specific error messages
  const conflict = await query(
    'SELECT username, email FROM users WHERE email = $1 OR username = $2 LIMIT 1',
    [email.toLowerCase(), username]
  );

  if (conflict.rows.length > 0) {
    const taken = conflict.rows[0];
    if (taken.email === email.toLowerCase()) throw new Error('Email is already registered');
    throw new Error('Username is already taken');
  }

  const result = await query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, avatar_url, bio, is_banned, role_type, created_at`,
    [username, email.toLowerCase(), passwordHash]
  );

  return result.rows[0];
}