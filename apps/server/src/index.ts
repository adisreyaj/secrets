import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './config.js';
import { createLogDispatcher } from './server/logging/dispatcher.js';

const app = await buildApp();
const processLogDispatcher = await createLogDispatcher(app.log, {
  service: 'server',
  env: config.env,
});

const flushLogs = async () => {
  try {
    await Promise.race([
      processLogDispatcher.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    ]);
  } catch {
    // noop
  }
};

process.on('unhandledRejection', (error) => {
  void processLogDispatcher
    .emit({
      event: 'process.crash',
      level: 'fatal',
      category: 'internal',
      message: 'unhandledRejection',
      err: error,
    })
    .finally(async () => {
      await flushLogs();
      process.exit(1);
    });
});

process.on('uncaughtException', (error) => {
  void processLogDispatcher
    .emit({
      event: 'process.crash',
      level: 'fatal',
      category: 'internal',
      message: 'uncaughtException',
      err: error,
    })
    .finally(async () => {
      await flushLogs();
      process.exit(1);
    });
});

process.on('SIGTERM', () => {
  void flushLogs();
});

app
  .listen({
    port: config.port,
    host: '0.0.0.0',
  })
  .catch((error) => {
    void processLogDispatcher
      .emit({
        event: 'process.crash',
        level: 'fatal',
        category: 'internal',
        message: 'server.listen.failed',
        err: error,
      })
      .finally(async () => {
        await flushLogs();
        process.exit(1);
      });
  });
