// scripts/createAdmin.js
//
// One-off CLI tool to create an admin account.
// Run from inside the backend container:
//   docker compose exec backend node scripts/createAdmin.js
//
// Mirrors the validation and password hashing used in routes/auth.js's
// POST /register exactly, so this account behaves identically to one
// created through normal signup — just with role_type bumped to 'admin'.

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcrypt';
import { createUser } from '../db/users.js';
import { query } from '../db/db.js';

const SALT_ROUNDS = 12; // must match routes/auth.js

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUsername(username) {
  if (!username) return 'Username is required.';
  if (username.length < 2 || username.length > 30) {
    return 'Username must be between 2 and 30 characters.';
  }
  return null;
}

function validateEmail(email) {
  if (!email) return 'Email is required.';
  if (!EMAIL_REGEX.test(email)) return 'Invalid email address.';
  return null;
}

function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

async function promptUntilValid(rl, label, validate) {
  while (true) {
    const value = await rl.question(label);
    const error = validate(value);
    if (!error) return value;
    console.log(`${error}`);
  }
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('── Create Admin Account ─────────────────────────────');

  try {
    const username = await promptUntilValid(rl, 'Username: ', validateUsername);
    const email = await promptUntilValid(rl, 'Email: ', validateEmail);
    const password = await promptUntilValid(rl, 'Password (min 8 chars): ', validatePassword);

    rl.close();

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // createUser already checks for duplicate username/email and throws a
    // friendly error if either is taken — same as normal registration.
    const user = await createUser({ username, email, passwordHash });

    // createUser has no role param by design (role changes go through their
    // own dedicated path) — bump it to admin here as a separate step.
    await query(`UPDATE users SET role_type = 'admin' WHERE id = $1`, [user.id]);

    console.log('');
    console.log('Admin account created successfully:');
    console.log(`  id:       ${user.id}`);
    console.log(`  username: ${user.username}`);
    console.log(`  email:    ${user.email}`);
    console.log(`  role:     admin`);
    console.log('');
    console.log('You can now log in through the app with this username/email and password.');

    process.exit(0);
  } catch (err) {
    rl.close();
    console.log('');
    console.error(`Failed to create admin account: ${err.message}`);
    process.exit(1);
  }
}

main();