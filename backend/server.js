import app from './app.js';
import { connectRedis } from './services/redis.js';

const PORT = process.env.PORT || 3001;

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