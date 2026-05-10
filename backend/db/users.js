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


// get user by email 
export async function getUserByEmail(email) {
  if (!email) throw new Error('email is required');

  const result = await query(
    `SELECT id, username, email, password_hash, avatar_url, bio, is_banned, role_type, created_at
     FROM users
     WHERE email = LOWER($1)`,
    [email]
  );

  // Return the user row, or null if no match
  return result.rows[0] ?? null;
}


// get user by username
export async function getUserByUsername(username) {
  if (!username) throw new Error('username is required');

  const result = await query(
    `SELECT id, username, email, avatar_url, bio, is_banned, role_type, created_at
     FROM users
     WHERE username = $1`,
    [username]
  );

  // Return the user row, or null if no match
  return result.rows[0] ?? null;
}


// get user by id
export async function getUserById(id) {
  if (!id) throw new Error('id is required');

  const result = await query(
    `SELECT id, username, email, avatar_url, bio, is_banned, role_type, created_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  // Return the user row, or null if no match
  return result.rows[0] ?? null;
}


// update uesr 
export async function updateUser(id, fields) {
  // catch bad inputs before touching the DB
  if (!id) throw new Error('id is required');

  // Only these four fields are allowed to be changed through this function.
  // Role, ban status, password all go through their own dedicated functions.
  const ALLOWED_FIELDS = ['bio', 'avatar_url', 'username', 'email'];

  // Build a new object that only contains keys from ALLOWED_FIELDS.
  // Anything else (role_type, is_banned) is silently dropped here.
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([key]) => ALLOWED_FIELDS.includes(key))
  );

  // If nothing allowed was passed in, there is nothing to do — reject it
  if (Object.keys(safeFields).length === 0) {
    throw new Error('No valid fields provided for update');
  }

  // Lowercase email if it was provided (stay consistent with createUser)
  if (safeFields.email) {
    safeFields.email = safeFields.email.toLowerCase();
  }

  // Dynamically build the SET clause
  // Example: if safeFields = { bio: 'hello', avatar_url: 'https://...' }
  //   setClauses = ['bio = $1', 'avatar_url = $2']
  //   values     = ['hello', 'https://...', <id goes on the end>]
  const setClauses = []; // will become the "SET x = $1, y = $2" part
  const values = [];     // the actual values passed to pg to prevent SQL injection

  // Loop over each allowed field that was actually passed in
  Object.entries(safeFields).forEach(([key, value]) => {
    // $1, $2, $3... — pg uses 1-based indexes, and values.length
    // is checked AFTER we push, so we add 1 to get the next index
    values.push(value);
    setClauses.push(`${key} = $${values.length}`);
  });

  // The WHERE clause needs the user's id — it goes at the end of the values array.
  // Its placeholder index is whatever comes after all the SET values.
  values.push(id);
  const idPlaceholder = `$${values.length}`;

  // Run the update query
  let result;
  try {
    result = await query(
      // setClauses.join(', ') turns ['bio = $1', 'avatar_url = $2']
      // into the string "bio = $1, avatar_url = $2"
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = ${idPlaceholder}
       RETURNING id, username, email, avatar_url, bio, is_banned, role_type, created_at`,
      values
    );
  } catch (err) {
    // Postgres unique constraint violations come back with code '23505'.
    if (err.code === '23505') {
      if (err.constraint.includes('username')) {
        throw new Error('Username is already taken');
      }
      if (err.constraint.includes('email')) {
        throw new Error('Email is already registered');
      }
    }
    // Any other DB error we didn't anticipate — re-throw as-is
    throw err;
  }

  // Handle "user not found"
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return result.rows[0];
}


// ban user ban user does not delete all of there stuff it just makes it so that they cannot do anything
export async function banUser(id) {
  if (!id) throw new Error('id is required');
 
  const result = await query(
    `UPDATE users
     SET is_banned = true
     WHERE id = $1
     RETURNING id, username, email, avatar_url, bio, is_banned, role_type, created_at`,
    [id]
  );
 
  // If no row came back the id didn't match anyone — let the route layer 404
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }
 
  return result.rows[0];
}


// unban user ban user does not delete all of there stuff it just makes it so that they cannot do anything
export async function unbanUser(id) {
  if (!id) throw new Error('id is required');
 
  const result = await query(
    `UPDATE users
     SET is_banned = false
     WHERE id = $1
     RETURNING id, username, email, avatar_url, bio, is_banned, role_type, created_at`,
    [id]
  );
 
  // If no row came back the id didn't match anyone — let the route layer 404
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }
 
  return result.rows[0];
}



// delete user the account and all of its posts, ratings, commetns using ON DELETE CASCADE
export async function deleteUserById(id) {
  if (!id) throw new Error('id is required');

  const result = await query(
    `DELETE FROM users
     WHERE id = $1
     RETURNING id, username, email, avatar_url, bio, is_banned, role_type, created_at`,
    [id]
  );

  // No row returned means the id didn't match anyone
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  // Return the deleted row — useful for the route layer to log or confirm to the admin exactly who was purged
  return result.rows[0];
}