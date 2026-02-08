import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './config.js';

const app = await buildApp();

process.on('unhandledRejection', (error) => {
  app.log.error({ err: error }, 'unhandledRejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  app.log.error({ err: error }, 'uncaughtException');
  process.exit(1);
});

app
  .listen({
    port: config.port,
    host: '0.0.0.0',
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
