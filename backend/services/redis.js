import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL ||
  `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[redis] Too many reconnect attempts, giving up');
        return new Error('Redis reconnect limit reached');
      }
      return Math.min(retries * 100, 3000); // exponential backoff, max 3s
    },
  },
});

client.on('connect',  ()    => console.log('[redis] Connected'));
client.on('error',   (err)  => console.error('[redis] Error:', err.message));
client.on('reconnecting', () => console.warn('[redis] Reconnecting...'));

// Call once at app startup in server.js
export async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
}

// ── Denylist helpers ──────────────────────────────────────────────────────────

/**
 * Add a JWT to the denylist.
 * The key expires automatically when the token would have expired anyway,
 * so Redis never holds stale entries forever.
 *
 * @param {string} jti     - The unique JWT ID (from token payload)
 * @param {number} expUnix - Token expiry as a Unix timestamp (seconds)
 */
export async function denylistToken(jti, expUnix) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = expUnix - nowSeconds;
  if (ttl <= 0) return; // already expired, nothing to store
  await client.set(`denylist:${jti}`, '1', { EX: ttl });
}

/**
 * Check if a JWT is on the denylist.
 * @param  {string}  jti
 * @returns {boolean}
 */
export async function isTokenDenylisted(jti) {
  const result = await client.get(`denylist:${jti}`);
  return result !== null;
}

/**
 * Denylist every active token for a user.
 * We track active JTIs per user so a moderator ban immediately
 * invalidates all their sessions.
 *
 * Call addActiveToken() on login, removeActiveToken() on logout,
 * denylistAllUserTokens() on ban.
 */

export async function addActiveToken(userId, jti, expUnix) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = expUnix - nowSeconds;
  if (ttl <= 0) return;
  // Store jti → expiry so we know the TTL when we denylist it
  await client.hSet(`user_tokens:${userId}`, jti, String(expUnix));
  // The hash itself expires after 30 days as a safety net
  await client.expire(`user_tokens:${userId}`, 60 * 60 * 24 * 30);
}

export async function removeActiveToken(userId, jti) {
  await client.hDel(`user_tokens:${userId}`, jti);
}

export async function denylistAllUserTokens(userId) {
  const tokens = await client.hGetAll(`user_tokens:${userId}`);
  if (!tokens || Object.keys(tokens).length === 0) return;

  for (const [jti, expUnix] of Object.entries(tokens)) {
    await denylistToken(jti, parseInt(expUnix, 10));
  }
  await client.del(`user_tokens:${userId}`);
}

export default client;