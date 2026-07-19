import { and, desc, eq, isNull } from 'drizzle-orm';
import { isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateToken, hashPassword, hashToken, verifyPassword } from '../../auth.js';
import { applyAuthSetCookies, auth } from '../../betterAuth.js';
import { config } from '../../config.js';
import {
  account,
  apiTokens,
  AuthClientType,
  authClients,
  authProviderConfigs,
  cliLoginSessions,
  db,
  globalCliTokens,
  ProjectModuleKey,
  Role,
  users,
  type AuthClientType as AuthClientTypeT,
} from '../../db/index.js';
import { toUserDto } from '../mappers/users.js';
import {
  requireAuth,
  requireProjectModuleEnabled,
  requireProjectRole,
} from '../auth/guards.js';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from '../auth/session.js';
import { logAudit } from '../services/audit.js';
import { buildCliLoginUrl } from '../services/format.js';
import { ensureAuthProjectConfig, updateAuthProjectConfig } from '../services/auth/core.js';
import {
  rotateAuthProviderSecret,
  upsertAuthProviderConfig,
} from '../services/auth/providerConfigs.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const toAuthClientDto = (client: {
    id: string;
    projectId: string;
    name: string;
    clientId: string;
    type: AuthClientType;
    redirectUrisJson: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }) => ({
    id: client.id,
    projectId: client.projectId,
    name: client.name,
    clientId: client.clientId,
    type: client.type.toLowerCase() as 'public' | 'confidential',
    redirectUris: Array.isArray(client.redirectUrisJson)
      ? client.redirectUrisJson.filter((value): value is string => typeof value === 'string')
      : [],
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    deletedAt: client.deletedAt?.toISOString() ?? null,
  });
  const toAuthProviderDto = (provider: {
    id: string;
    projectId: string;
    provider: 'LOCAL' | 'GOOGLE' | 'GITHUB';
    enabled: boolean;
    clientId: string;
    scopesJson: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    id: provider.id,
    projectId: provider.projectId,
    provider: provider.provider.toLowerCase() as 'google' | 'github' | 'local',
    enabled: provider.enabled,
    clientId: provider.clientId,
    scopes: Array.isArray(provider.scopesJson)
      ? provider.scopesJson.filter((value): value is string => typeof value === 'string')
      : [],
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  });

  app.post(
    '/auth/register',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
          name: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { email, password, name } = request.body as {
        email: string;
        password: string;
        name?: string;
      };

      try {
        const { headers } = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name: name?.trim() || email.split('@')[0] || 'User',
          },
          headers: fromNodeHeaders(request.headers),
          returnHeaders: true,
        });
        applyAuthSetCookies(reply, headers);
      } catch (error) {
        if (isAPIError(error)) {
          const status = typeof error.status === 'number' ? error.status : 400;
          if (status === 422 || /already|exists/i.test(error.message)) {
            reply.code(409).send({ error: 'Email already registered' });
            return;
          }
          reply.code(status >= 400 && status < 600 ? status : 400).send({ error: error.message });
          return;
        }
        throw error;
      }

      reply.code(201).send({
        message: 'Registration successful. Please check your email to verify your account.',
        email,
      });
    },
  );

  app.post(
    '/auth/verify-email',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = request.body as { token?: string } | undefined;
      if (!body?.token) {
        reply.code(400).send({ error: 'Token is required' });
        return;
      }

      try {
        const { headers } = await auth.api.verifyEmail({
          query: { token: body.token },
          headers: fromNodeHeaders(request.headers),
          returnHeaders: true,
        });
        applyAuthSetCookies(reply, headers);
      } catch (error) {
        if (isAPIError(error)) {
          const status = typeof error.status === 'number' ? error.status : 400;
          reply.code(status >= 400 && status < 600 ? status : 400).send({ error: error.message });
          return;
        }
        throw error;
      }

      reply.send({ message: 'Email verified successfully' });
    },
  );

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string().min(1, 'Password is required'),
        }),
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };

      try {
        const { headers, response } = await auth.api.signInEmail({
          body: { email, password },
          headers: fromNodeHeaders(request.headers),
          returnHeaders: true,
        });
        applyAuthSetCookies(reply, headers);

        const csrfToken = generateToken();
        reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
          httpOnly: false,
          sameSite: 'strict',
          secure: config.cookieSecure,
          path: '/',
          maxAge: config.sessionTtlHours * 60 * 60,
        });

        reply.send({
          user: toUserDto({
            id: response.user.id,
            email: response.user.email,
            name: response.user.name ?? null,
          }),
        });
      } catch (error) {
        if (isAPIError(error)) {
          const message = error.message || 'Invalid credentials';
          if (/verif/i.test(message)) {
            reply.code(401).send({ error: 'Email not verified. Please check your email.' });
            return;
          }
          reply.code(401).send({ error: 'Invalid credentials' });
          return;
        }
        throw error;
      }
    },
  );

  app.post('/auth/cli-login', async (_request, reply) => {
    const code = generateToken();
    const expiresAt = new Date(Date.now() + config.cliLoginTtlMinutes * 60 * 1000);

    await db.insert(cliLoginSessions).values({
      code,
      expiresAt,
    });

    reply.send({
      code,
      loginUrl: buildCliLoginUrl(code),
      expiresAt: expiresAt.toISOString(),
    });
  });

  app.post('/auth/cli-login/issue', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }

    if (auth.viaToken) {
      reply.code(403).send({ error: 'Token sessions cannot issue CLI logins' });
      return;
    }

    const body = request.body as
      | { code?: string; projectId?: string; name?: string; mode?: 'global' | 'project' }
      | undefined;
    const code = body?.code?.trim();
    const mode = body?.mode === 'project' ? 'project' : 'global';
    const projectId = body?.projectId?.trim();
    const name = body?.name?.trim() ?? 'CLI login';

    if (!code) {
      reply.code(400).send({ error: 'Code is required' });
      return;
    }

    if (mode === 'project' && !projectId) {
      reply.code(400).send({ error: 'projectId is required in project mode' });
      return;
    }

    const session = await db.query.cliLoginSessions.findFirst({
      where: eq(cliLoginSessions.code, code),
    });
    if (!session || session.expiresAt <= new Date()) {
      reply.code(404).send({ error: 'CLI login session not found or expired' });
      return;
    }

    if (session.consumedAt) {
      reply.code(409).send({ error: 'CLI login session already completed' });
      return;
    }

    if (session.token) {
      reply.code(409).send({ error: 'CLI login token already issued' });
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'CLI login requires a user session' });
      return;
    }

    const raw = generateToken();
    if (mode === 'project') {
      const role = await requireProjectRole(request, reply, projectId!, Role.VIEWER);
      if (!role) {
        return;
      }

      const [token] = await db
        .insert(apiTokens)
        .values({
          projectId: projectId!,
          name,
          tokenHash: hashToken(raw),
          createdBy: auth.user.id,
          readOnly: false,
          expiresAt: new Date(Date.now() + config.apiTokenTtlDays * 24 * 60 * 60 * 1000),
        })
        .returning();

      await db
        .update(cliLoginSessions)
        .set({
          token: raw,
          userId: auth.user.id,
          projectId: projectId!,
        })
        .where(eq(cliLoginSessions.id, session.id));

      await logAudit({
        projectId: projectId!,
        actorUserId: auth.user?.id,
        actorServiceAccountId: auth.serviceAccountId ?? null,
        action: 'token.create',
        resourceType: 'api_token',
        resourceId: token.id,
        metadataJson: { source: 'cli-login', scopeType: 'project' },
      });

      reply.send({
        token: raw,
        tokenMeta: {
          id: token.id,
          scopeType: 'project',
          projectId: token.projectId,
          name: token.name,
          readOnly: token.readOnly,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          expiresAt: token.expiresAt?.toISOString() ?? null,
        },
      });
      return;
    }

    if (!config.enableGlobalCliTokens) {
      reply.code(403).send({ error: 'Global CLI bootstrap tokens are currently disabled' });
      return;
    }

    const [token] = await db
      .insert(globalCliTokens)
      .values({
        name,
        tokenHash: hashToken(raw),
        createdBy: auth.user.id,
        expiresAt: new Date(Date.now() + config.globalCliTokenTtlDays * 24 * 60 * 60 * 1000),
      })
      .returning();

    await db
      .update(cliLoginSessions)
      .set({
        token: raw,
        userId: auth.user.id,
        projectId: null,
      })
      .where(eq(cliLoginSessions.id, session.id));

    app.log.info(
      {
        event: 'global_cli_token.create',
        source: 'cli-login',
        tokenId: token.id,
        actorUserId: auth.user.id,
        scopeType: 'global_bootstrap',
      },
      'global bootstrap token created',
    );

    reply.send({
      token: raw,
      tokenMeta: {
        id: token.id,
        scopeType: 'global_bootstrap',
        name: token.name,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      },
    });
  });

  app.post('/auth/cli-login/complete', async (request, reply) => {
    const body = request.body as { code?: string } | undefined;
    const code = body?.code?.trim();
    if (!code) {
      reply.code(400).send({ error: 'Code is required' });
      return;
    }

    const session = await db.query.cliLoginSessions.findFirst({
      where: eq(cliLoginSessions.code, code),
    });
    if (!session || session.expiresAt <= new Date()) {
      reply.code(404).send({ error: 'CLI login session not found or expired' });
      return;
    }

    if (!session.token) {
      reply.send({ status: 'pending' });
      return;
    }

    const token = session.token;
    await db
      .update(cliLoginSessions)
      .set({
        token: null,
        consumedAt: new Date(),
      })
      .where(eq(cliLoginSessions.id, session.id));

    reply.send({
      status: 'complete',
      token,
      ...(session.projectId ? { projectId: session.projectId } : {}),
    });
  });

  app.get('/auth/csrf', async (request, reply) => {
    if (!request.auth?.user || request.auth.viaToken) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const csrfToken = request.cookies[CSRF_COOKIE_NAME] ?? generateToken();
    if (!request.cookies[CSRF_COOKIE_NAME]) {
      reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: 'strict',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.sessionTtlHours * 60 * 60,
      });
    }

    reply.send({ csrfToken });
  });

  app.post('/auth/logout', async (request, reply) => {
    try {
      const { headers } = await auth.api.signOut({
        headers: fromNodeHeaders(request.headers),
        returnHeaders: true,
      });
      applyAuthSetCookies(reply, headers);
    } catch (error) {
      if (!isAPIError(error)) {
        throw error;
      }
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    reply.send({ ok: true });
  });

  app.get('/projects/:projectId/auth/config', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
    if (!role) {
      return;
    }

    const configRow = await ensureAuthProjectConfig(projectId);
    reply.send({
      projectId: configRow.projectId,
      nativeAuthEnabled: configRow.nativeAuthEnabled,
      emailPasswordEnabled: configRow.emailPasswordEnabled,
      accessTokenTtlMinutes: configRow.accessTokenTtlMinutes,
      refreshTokenTtlDays: configRow.refreshTokenTtlDays,
      createdAt: configRow.createdAt.toISOString(),
      updatedAt: configRow.updatedAt.toISOString(),
    });
  });

  app.put('/projects/:projectId/auth/config', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | {
          nativeAuthEnabled?: boolean;
          emailPasswordEnabled?: boolean;
          accessTokenTtlMinutes?: number;
          refreshTokenTtlDays?: number;
        }
      | undefined;
    if (!body) {
      reply.code(400).send({ error: 'Request body is required' });
      return;
    }

    const updated = await updateAuthProjectConfig(projectId, {
      nativeAuthEnabled: body.nativeAuthEnabled,
      emailPasswordEnabled: body.emailPasswordEnabled,
      accessTokenTtlMinutes: body.accessTokenTtlMinutes,
      refreshTokenTtlDays: body.refreshTokenTtlDays,
    });
    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'auth.config.update',
      resourceType: 'auth_config',
      resourceId: updated.id,
      metadataJson: { module: 'auth' },
    });

    reply.send({
      projectId: updated.projectId,
      nativeAuthEnabled: updated.nativeAuthEnabled,
      emailPasswordEnabled: updated.emailPasswordEnabled,
      accessTokenTtlMinutes: updated.accessTokenTtlMinutes,
      refreshTokenTtlDays: updated.refreshTokenTtlDays,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  app.get(
    '/projects/:projectId/auth/providers',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }
      const { projectId } = request.params as { projectId: string };
      const moduleEnabled = await requireProjectModuleEnabled(
        request,
        reply,
        projectId,
        ProjectModuleKey.AUTH,
      );
      if (!moduleEnabled) {
        return;
      }
      const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
      if (!role) {
        return;
      }

      const query = request.query as { limit: number; cursor?: string };
      const limit = query.limit;
      const cursor = query.cursor;

      const allProviders = await db.query.authProviderConfigs.findMany({
        where: eq(authProviderConfigs.projectId, projectId),
        orderBy: [desc(authProviderConfigs.createdAt)],
      });
      let start = 0;
      if (cursor) {
        const idx = allProviders.findIndex((p) => p.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const providers = allProviders.slice(start, start + limit + 1);

      let nextCursor: string | undefined = undefined;
      if (providers.length > limit) {
        const nextItem = providers.pop();
        nextCursor = nextItem?.id;
      }

      reply.send({
        data: providers.map(toAuthProviderDto),
        nextCursor,
      });
    },
  );

  app.post('/projects/:projectId/auth/providers', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | {
          provider?: 'google' | 'github';
          enabled?: boolean;
          clientId?: string;
          clientSecret?: string;
          scopes?: string[];
        }
      | undefined;
    const provider = body?.provider?.toUpperCase();
    const clientId = body?.clientId?.trim();
    const clientSecret = body?.clientSecret?.trim();
    if (!provider || !clientId || !clientSecret) {
      reply.code(400).send({ error: 'provider, clientId, and clientSecret are required' });
      return;
    }
    if (provider !== 'GOOGLE' && provider !== 'GITHUB') {
      reply.code(400).send({ error: 'provider must be google or github' });
      return;
    }

    const saved = await upsertAuthProviderConfig({
      projectId,
      provider,
      clientId,
      clientSecret,
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : true,
      scopes: body?.scopes,
    });
    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'auth.provider.upsert',
      resourceType: 'auth_provider_config',
      resourceId: saved.id,
      metadataJson: { module: 'auth', provider: saved.provider.toLowerCase() },
    });

    reply.code(201).send(toAuthProviderDto(saved as any));
  });

  app.patch('/auth/providers/:providerId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { providerId } = request.params as { providerId: string };
    const current = await db.query.authProviderConfigs.findFirst({
      where: eq(authProviderConfigs.id, providerId),
    });
    if (!current) {
      reply.code(404).send({ error: 'Provider config not found' });
      return;
    }
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      current.projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, current.projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | { enabled?: boolean; clientId?: string; scopes?: string[] }
      | undefined;
    const [updated] = await db
      .update(authProviderConfigs)
      .set({
        ...(typeof body?.enabled === 'boolean' ? { enabled: body.enabled } : {}),
        ...(body?.clientId?.trim() ? { clientId: body.clientId.trim() } : {}),
        ...(Array.isArray(body?.scopes) ? { scopesJson: body.scopes } : {}),
      })
      .where(eq(authProviderConfigs.id, current.id))
      .returning();
    await logAudit({
      projectId: updated.projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'auth.provider.update',
      resourceType: 'auth_provider_config',
      resourceId: updated.id,
      metadataJson: { module: 'auth', provider: updated.provider.toLowerCase() },
    });
    reply.send(toAuthProviderDto(updated as any));
  });

  app.post('/auth/providers/:providerId/rotate-secret', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }
    const { providerId } = request.params as { providerId: string };
    const current = await db.query.authProviderConfigs.findFirst({
      where: eq(authProviderConfigs.id, providerId),
    });
    if (!current) {
      reply.code(404).send({ error: 'Provider config not found' });
      return;
    }
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      current.projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, current.projectId, Role.ADMIN);
    if (!role) {
      return;
    }
    const body = request.body as { clientSecret?: string } | undefined;
    const clientSecret = body?.clientSecret?.trim();
    if (!clientSecret) {
      reply.code(400).send({ error: 'clientSecret is required' });
      return;
    }

    const rotated = await rotateAuthProviderSecret({
      projectId: current.projectId,
      provider: current.provider,
      clientSecret,
    });
    await logAudit({
      projectId: rotated.projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'auth.provider.rotate_secret',
      resourceType: 'auth_provider_config',
      resourceId: rotated.id,
      metadataJson: { module: 'auth', provider: rotated.provider.toLowerCase() },
    });
    reply.send(toAuthProviderDto(rotated as any));
  });

  app.get('/me', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    reply.send({ user: auth.user });
  });

  app.patch(
    '/me',
    {
      schema: {
        body: z.object({
          name: z.string().min(1).optional(),
          email: z.string().email().optional(),
          currentPassword: z.string().optional(),
          newPassword: z.string().min(8).optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }

      if (auth.viaToken) {
        reply.code(403).send({ error: 'Token sessions cannot update profile' });
        return;
      }

      const body = request.body as {
        name?: string;
        email?: string;
        currentPassword?: string;
        newPassword?: string;
      };

      const name = body.name?.trim();
      const newPassword = body.newPassword?.trim();
      const currentPassword = body.currentPassword;

      const wantsName = typeof body.name !== 'undefined';
      const wantsPassword = typeof body.newPassword !== 'undefined';

      if (typeof body.email !== 'undefined') {
        reply.code(400).send({ error: 'Email updates are not supported' });
        return;
      }

      if (!wantsName && !wantsPassword) {
        reply.code(400).send({ error: 'No changes provided' });
        return;
      }

      if (wantsName && !name) {
        reply.code(400).send({ error: 'Name is required' });
        return;
      }

      if (wantsPassword && !newPassword) {
        reply.code(400).send({ error: 'New password is required' });
        return;
      }

      if (wantsPassword && !currentPassword) {
        reply.code(400).send({ error: 'Current password is required' });
        return;
      }

      if (wantsPassword) {
        const credential = await db.query.account.findFirst({
          where: and(eq(account.userId, auth.user!.id), eq(account.providerId, 'credential')),
        });
        if (!credential?.password) {
          reply.code(404).send({ error: 'User not found' });
          return;
        }
        const valid = await verifyPassword(currentPassword ?? '', credential.password);
        if (!valid) {
          reply.code(401).send({ error: 'Invalid credentials' });
          return;
        }
      }

      if (wantsPassword && newPassword) {
        await db
          .update(account)
          .set({ password: await hashPassword(newPassword) })
          .where(and(eq(account.userId, auth.user!.id), eq(account.providerId, 'credential')));
      }

      const [updated] = await db
        .update(users)
        .set(wantsName && name ? { name } : {})
        .where(eq(users.id, auth.user!.id))
        .returning();

      reply.send({ user: toUserDto(updated) });
    },
  );

  app.get(
    '/projects/:projectId/auth/clients',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) {
        return;
      }
      const { projectId } = request.params as { projectId: string };
      const moduleEnabled = await requireProjectModuleEnabled(
        request,
        reply,
        projectId,
        ProjectModuleKey.AUTH,
      );
      if (!moduleEnabled) {
        return;
      }
      const role = await requireProjectRole(request, reply, projectId, Role.VIEWER);
      if (!role) {
        return;
      }

      const query = request.query as { limit: number; cursor?: string };
      const limit = query.limit;
      const cursor = query.cursor;

      const allClients = await db.query.authClients.findMany({
        where: and(eq(authClients.projectId, projectId), isNull(authClients.deletedAt)),
        orderBy: [desc(authClients.createdAt)],
      });
      let start = 0;
      if (cursor) {
        const idx = allClients.findIndex((c) => c.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const clients = allClients.slice(start, start + limit + 1);

      let nextCursor: string | undefined = undefined;
      if (clients.length > limit) {
        const nextItem = clients.pop();
        nextCursor = nextItem?.id;
      }

      reply.send({
        data: clients.map(toAuthClientDto),
        nextCursor,
      });
    },
  );

  app.post('/projects/:projectId/auth/clients', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }

    const { projectId } = request.params as { projectId: string };
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | { name?: string; type?: 'public' | 'confidential'; redirectUris?: string[] }
      | undefined;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400).send({ error: 'name is required' });
      return;
    }
    const type = body?.type?.toLowerCase() === 'confidential' ? 'CONFIDENTIAL' : 'PUBLIC';
    const redirectUris = (body?.redirectUris ?? [])
      .map((uri) => uri?.trim())
      .filter((uri): uri is string => Boolean(uri));

    const clientId = `ac_${generateToken().slice(0, 24)}`;
    const rawSecret = type === 'CONFIDENTIAL' ? `acs_${generateToken()}` : null;
    const [client] = await db
      .insert(authClients)
      .values({
        projectId,
        name,
        type: type as AuthClientTypeT,
        clientId,
        clientSecretHash: rawSecret ? hashToken(rawSecret) : null,
        redirectUrisJson: redirectUris,
      })
      .returning();

    await logAudit({
      projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'auth.client.create',
      resourceType: 'auth_client',
      resourceId: client.id,
      // SECURITY: rawSecret is intentionally excluded from metadataJson to prevent log leakage.
      metadataJson: { module: 'auth', type: client.type, clientId: client.clientId },
    });

    // SECURITY: The raw clientSecret is returned exactly once upon creation. 
    // It is hashed before database storage and cannot be retrieved again. 
    // Clients must securely store this value immediately, as it will not be exposed in any future API responses.
    reply.code(201).send({
      client: toAuthClientDto(client),
      ...(rawSecret ? { clientSecret: rawSecret } : {}),
    });
  });

  app.patch('/auth/clients/:clientId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }

    const { clientId } = request.params as { clientId: string };
    const current = await db.query.authClients.findFirst({
      where: and(eq(authClients.id, clientId), isNull(authClients.deletedAt)),
    });
    if (!current) {
      reply.code(404).send({ error: 'Auth client not found' });
      return;
    }
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      current.projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, current.projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    const body = request.body as
      | {
          name?: string;
          redirectUris?: string[];
          rotateSecret?: boolean;
        }
      | undefined;

    const redirectUris = Array.isArray(body?.redirectUris)
      ? body.redirectUris
          .map((uri) => uri?.trim())
          .filter((uri): uri is string => Boolean(uri))
      : undefined;

    const shouldRotate = body?.rotateSecret === true && current.type === 'CONFIDENTIAL';
    const rawSecret = shouldRotate ? `acs_${generateToken()}` : null;

    const [updated] = await db
      .update(authClients)
      .set({
        ...(body?.name?.trim() ? { name: body.name.trim() } : {}),
        ...(redirectUris !== undefined ? { redirectUrisJson: redirectUris } : {}),
        ...(rawSecret ? { clientSecretHash: hashToken(rawSecret) } : {}),
      })
      .where(eq(authClients.id, current.id))
      .returning();

    await logAudit({
      projectId: updated.projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: shouldRotate ? 'auth.client.rotate_secret' : 'auth.client.update',
      resourceType: 'auth_client',
      resourceId: updated.id,
      // SECURITY: rawSecret is intentionally excluded from metadataJson to prevent log leakage.
      metadataJson: {
        module: 'auth',
        clientId: updated.clientId,
        rotated: shouldRotate,
      },
    });

    // SECURITY: The raw clientSecret is returned exactly once on rotation.
    // It is hashed before database storage and cannot be retrieved again.
    // The caller must securely store it immediately.
    reply.send({
      client: toAuthClientDto(updated),
      ...(rawSecret ? { clientSecret: rawSecret } : {}),
    });
  });

  app.delete('/auth/clients/:clientId', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) {
      return;
    }
    if (!auth.user) {
      reply.code(403).send({ error: 'User session required' });
      return;
    }

    const { clientId } = request.params as { clientId: string };
    const current = await db.query.authClients.findFirst({
      where: and(eq(authClients.id, clientId), isNull(authClients.deletedAt)),
    });
    if (!current) {
      reply.code(404).send({ error: 'Auth client not found' });
      return;
    }
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      current.projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }
    const role = await requireProjectRole(request, reply, current.projectId, Role.ADMIN);
    if (!role) {
      return;
    }

    await db
      .update(authClients)
      .set({ deletedAt: new Date() })
      .where(eq(authClients.id, current.id));
    await logAudit({
      projectId: current.projectId,
      actorUserId: auth.user.id,
      actorServiceAccountId: auth.serviceAccountId ?? null,
      action: 'auth.client.delete',
      resourceType: 'auth_client',
      resourceId: current.id,
      metadataJson: { module: 'auth', clientId: current.clientId },
    });
    reply.send({ ok: true });
  });
}
