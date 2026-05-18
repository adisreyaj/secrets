import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { registerCoreHttpMiddleware } from './server/http/middleware.js';
import { registerRoutes as registerAuthRoutes } from './server/routes/auth.js';
import { registerRoutes as registerApiTokenRoutes } from './server/routes/apiTokens.js';
import { registerRoutes as registerAuditRoutes } from './server/routes/audit.js';
import { registerRoutes as registerExportRoutes } from './server/routes/exports.js';
import { registerRoutes as registerEnvironmentRoutes } from './server/routes/environments.js';
import { registerRoutes as registerProjectSettingsRoutes } from './server/routes/projectSettings.js';
import { registerRoutes as registerProjectCoreRoutes } from './server/routes/projectCore.js';
import { registerRoutes as registerSecretCreateBulkRoutes } from './server/routes/secretCreateBulk.js';
import { registerRoutes as registerSecretCopyRoutes } from './server/routes/secretCopy.js';
import { registerRoutes as registerSecretDeleteRoutes } from './server/routes/secretDelete.js';
import { registerRoutes as registerSecretPatchRoutes } from './server/routes/secretPatch.js';
import { registerRoutes as registerSecretReadRoutes } from './server/routes/secretReads.js';
import { registerRoutes as registerSecretRollbackRoutes } from './server/routes/secretRollback.js';
import { scheduleAuditRetentionCleanup } from './server/services/auditCleanup.js';
import { createLogDispatcher } from './server/logging/dispatcher.js';
import './types.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.logFormat === 'pretty'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true },
            },
          }
        : true,
    disableRequestLogging: true,
  });
  const logDispatcher = await createLogDispatcher(app.log, {
    service: 'server',
    env: config.env,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.appOrigins.includes(origin.replace(/\/$/, '')));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });
  registerCoreHttpMiddleware(app, logDispatcher);

  app.get('/health', async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerApiTokenRoutes(app);
  await registerAuditRoutes(app);
  await registerEnvironmentRoutes(app);
  await registerExportRoutes(app);
  await registerProjectCoreRoutes(app);
  await registerProjectSettingsRoutes(app);
  await registerSecretCreateBulkRoutes(app);
  await registerSecretCopyRoutes(app);
  await registerSecretDeleteRoutes(app);
  await registerSecretPatchRoutes(app);
  await registerSecretReadRoutes(app);
  await registerSecretRollbackRoutes(app);
  scheduleAuditRetentionCleanup(app, logDispatcher);

  return app;
}
