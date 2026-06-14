import { buildApp } from './app.js';
import { env } from './env.js';

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('server failed to start', err);
  process.exit(1);
});
