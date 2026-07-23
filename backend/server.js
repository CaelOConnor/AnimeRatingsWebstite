import app from './app.js';
import { connectRedis } from './services/redis.js';

const PORT = process.env.PORT || 3001;

// Express 4 does not forward a rejected promise from an async route
// handler to next(err) automatically — an async handler that throws
// without its own try/catch becomes a process-level unhandledRejection,
// which (Node 15+) crashes the whole process by default, taking down every
// other in-flight request too. Logging and continuing keeps the server up
// for everyone else; the one broken request just never gets a response
// (its caller times out), which is a far smaller blast radius than a full
// crash-and-restart.
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});

// A genuinely uncaught *synchronous* exception is a different, riskier
// case — it means code ran outside any try/catch entirely, and Node's own
// guidance is that the process's internal state afterward isn't
// guaranteed consistent enough to keep serving requests on. Log with full
// detail and exit; docker-compose's `restart: unless-stopped` brings the
// container back up immediately, which is safer than limping along.
process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err);
  process.exit(1);
});

async function start() {
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});