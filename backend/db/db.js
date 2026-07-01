import pg from 'pg';

const { Pool } = pg;

// client is one db connection
// pool is multiple connections

// gets all db settings from .env
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// if an error occurs throw this error
pool.on('error', (err) => { 
  console.error('Unexpected DB pool error:', err);
});

// Convenience wrapper — use this everywhere instead of pool.query directly
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[db] ${duration}ms — ${text.slice(0, 80)}`);
  }
  return res;
}

// For transactions if two things are supposed to happen but only one succeds then undo the one that succeded
export async function getClient() {
  return pool.connect();
}

export default pool;