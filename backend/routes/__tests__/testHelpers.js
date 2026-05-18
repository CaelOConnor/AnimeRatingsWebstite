import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createUser } from '../../db/users.js';
import { addActiveToken, connectRedis } from '../../services/redis.js';

await connectRedis();

export async function createTestUser(overrides = {}) {
  const suffix = uuidv4().slice(0, 8);

  const user = await createUser({
    username:     overrides.username     ?? `testuser_${suffix}`,
    email:        overrides.email        ?? `testuser_${suffix}@example.com`,
    passwordHash: overrides.passwordHash ?? 'hashed_pw',
  });

  if (overrides.role_type && overrides.role_type !== 'user') {
    const { query } = await import('../../db/db.js');
    await query(`UPDATE users SET role_type = $1 WHERE id = $2`, [overrides.role_type, user.id]);
    user.role_type = overrides.role_type;
  }

  const jti = uuidv4();
  const token = jwt.sign(
    {
      sub:      user.id,
      username: user.username,
      role:     user.role_type,
      jti,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const { exp } = jwt.decode(token);
  await addActiveToken(user.id, jti, exp);

  return { user, token };
}