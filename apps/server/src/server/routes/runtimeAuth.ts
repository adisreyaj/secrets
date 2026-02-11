import { AuthIdentityProvider, ProjectModuleKey } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  ensureAuthProjectConfig,
  issueAuthSessionWithRefresh,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  revokeAuthSession,
  rotateAuthRefreshToken,
} from '../services/auth/core.js';
import {
  rotateLocalPassword,
  registerLocalIdentity,
  verifyLocalCredentials,
} from '../services/auth/localIdentity.js';
import { buildProjectJwks, signProjectAccessToken } from '../services/auth/jwt.js';
import { hashToken } from '../../auth.js';
import { prisma } from '../../db.js';
import { sendError } from '../http/replies.js';
import {
  buildEmailVerificationEmail,
  buildPasswordResetEmail,
  createAuthEmailProvider,
} from '../services/auth/email.js';
import { config } from '../../config.js';
import { LoginAbuseProtector } from '../services/auth/abuseProtection.js';
import { decryptProviderSecret } from '../services/auth/providerConfigs.js';
import { logAudit } from '../services/audit.js';
import { isPrismaUniqueError } from '../services/prismaErrors.js';

type OauthStatePayload = {
  projectId: string;
  provider: 'google' | 'github';
  redirectUri?: string;
  expiresAt: number;
};

const oauthStateStore = new Map<string, OauthStatePayload>();

function issueOauthState(payload: Omit<OauthStatePayload, 'expiresAt'>): string {
  const token = `oas_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  oauthStateStore.set(token, {
    ...payload,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return token;
}

function consumeOauthState(state: string): OauthStatePayload | null {
  const value = oauthStateStore.get(state);
  if (!value) {
    return null;
  }
  oauthStateStore.delete(state);
  if (value.expiresAt <= Date.now()) {
    return null;
  }
  return value;
}
import {
  requireProjectAuthSession,
  requireProjectModuleEnabled,
} from '../auth/guards.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const authEmailProvider = createAuthEmailProvider();
  const loginProtector = new LoginAbuseProtector(
    Math.max(1, config.authLoginMaxAttempts),
    Math.max(1_000, config.authLoginLockMs),
  );
  const logRuntimeAuth = async (
    projectId: string,
    action: string,
    resourceType: string,
    resourceId?: string | null,
    metadataJson?: Record<string, unknown> | null,
  ) => {
    await logAudit({
      projectId,
      actorUserId: null,
      actorServiceAccountId: null,
      action,
      resourceType,
      resourceId: resourceId ?? null,
      metadataJson: { module: 'auth', ...(metadataJson ?? {}) },
    });
  };

  app.post(
    '/runtime/auth/signup',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as
      | {
          projectId?: string;
          email?: string;
          password?: string;
          displayName?: string | null;
        }
      | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim();
    const password = body?.password;
    if (!projectId || !email || !password) {
      sendError(reply, 400, 'projectId, email, and password are required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const config = await ensureAuthProjectConfig(projectId);
    if (!config.nativeAuthEnabled || !config.emailPasswordEnabled) {
      sendError(reply, 403, 'Email/password signup is disabled for this project');
      return;
    }

    try {
      const { endUser } = await registerLocalIdentity({
        projectId,
        email,
        password,
        displayName: body?.displayName ?? null,
      });
      const issued = await issueAuthSessionWithRefresh({
        projectId,
        endUserId: endUser.id,
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        accessTokenTtlMinutes: config.accessTokenTtlMinutes,
        refreshTokenTtlDays: config.refreshTokenTtlDays,
      });
      const access = await signProjectAccessToken({
        projectId,
        endUserId: endUser.id,
        sessionId: issued.session.id,
        expiresInMinutes: config.accessTokenTtlMinutes,
      });
      await logRuntimeAuth(projectId, 'auth.signup', 'auth_end_user', endUser.id, {
        method: 'password',
      });

      reply.code(201).send({
        endUser: {
          id: endUser.id,
          projectId: endUser.projectId,
          email: endUser.email,
          displayName: endUser.displayName,
        },
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        sessionToken: issued.sessionToken,
        refreshToken: issued.refreshToken,
        sessionExpiresAt: issued.sessionExpiresAt.toISOString(),
        refreshExpiresAt: issued.refreshExpiresAt.toISOString(),
      });
      return;
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        sendError(reply, 409, 'Email already exists for this project');
        return;
      }
      throw error;
    }
    },
  );

  app.post(
    '/runtime/auth/login',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as
      | {
          projectId?: string;
          email?: string;
          password?: string;
        }
      | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim();
    const password = body?.password;
    if (!projectId || !email || !password) {
      sendError(reply, 400, 'projectId, email, and password are required');
      return;
    }
    const loginKey = `${projectId}:${email.toLowerCase()}:${request.ip}`;
    const lockState = loginProtector.isLocked(loginKey);
    if (lockState.locked) {
      const retryAfter = Math.ceil((lockState.retryAfterMs ?? 0) / 1000);
      await logRuntimeAuth(projectId, 'auth.login.locked', 'auth_end_user', null, {
        email,
        ipAddress: request.ip,
        retryAfterSeconds: retryAfter,
      });
      reply.code(429).send({ error: 'Too many login attempts', retryAfterSeconds: retryAfter });
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const config = await ensureAuthProjectConfig(projectId);
    if (!config.nativeAuthEnabled || !config.emailPasswordEnabled) {
      sendError(reply, 403, 'Email/password login is disabled for this project');
      return;
    }

    const verified = await verifyLocalCredentials({ projectId, email, password });
    if (verified.status === 'disabled') {
      loginProtector.recordFailure(loginKey);
      await logRuntimeAuth(projectId, 'auth.login.blocked', 'auth_end_user', null, {
        email,
        reason: 'disabled',
      });
      sendError(reply, 403, 'Account is disabled');
      return;
    }
    if (verified.status !== 'ok') {
      const failure = loginProtector.recordFailure(loginKey);
      if (failure.locked) {
        await logRuntimeAuth(projectId, 'auth.login.locked', 'auth_end_user', null, {
          email,
          ipAddress: request.ip,
          retryAfterSeconds: Math.ceil((failure.retryAfterMs ?? 0) / 1000),
        });
        reply.code(429).send({
          error: 'Too many login attempts',
          retryAfterSeconds: Math.ceil((failure.retryAfterMs ?? 0) / 1000),
        });
        return;
      }
      await logRuntimeAuth(projectId, 'auth.login.failed', 'auth_end_user', null, {
        email,
      });
      sendError(reply, 401, 'Invalid credentials');
      return;
    }
    loginProtector.clear(loginKey);

    const issued = await issueAuthSessionWithRefresh({
      projectId,
      endUserId: verified.endUser.id,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
      accessTokenTtlMinutes: config.accessTokenTtlMinutes,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
    });
    const access = await signProjectAccessToken({
      projectId,
      endUserId: verified.endUser.id,
      sessionId: issued.session.id,
      expiresInMinutes: config.accessTokenTtlMinutes,
    });
    await logRuntimeAuth(projectId, 'auth.login', 'auth_end_user', verified.endUser.id, {
      method: 'password',
    });

    reply.send({
      endUser: verified.endUser,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      sessionToken: issued.sessionToken,
      refreshToken: issued.refreshToken,
      sessionExpiresAt: issued.sessionExpiresAt.toISOString(),
      refreshExpiresAt: issued.refreshExpiresAt.toISOString(),
    });
    },
  );

  app.post(
    '/runtime/auth/logout',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as { projectId?: string } | undefined;
    const projectId = body?.projectId?.trim();
    if (!projectId) {
      sendError(reply, 400, 'projectId is required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const session = await requireProjectAuthSession(request, reply, projectId);
    if (!session) {
      return;
    }

    await revokeAuthSession(session.sessionId);
    await logRuntimeAuth(projectId, 'auth.logout', 'auth_session', session.sessionId, {
      endUserId: session.endUserId,
    });
    reply.send({ ok: true });
    },
  );

  app.post(
    '/runtime/auth/token/refresh',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as
      | {
          projectId?: string;
          refreshToken?: string;
        }
      | undefined;
    const projectId = body?.projectId?.trim();
    const refreshToken = body?.refreshToken?.trim();
    if (!projectId || !refreshToken) {
      sendError(reply, 400, 'projectId and refreshToken are required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const config = await ensureAuthProjectConfig(projectId);
    const rotated = await rotateAuthRefreshToken({
      projectId,
      refreshToken,
      accessTokenTtlMinutes: config.accessTokenTtlMinutes,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
    });
    if (!rotated) {
      sendError(reply, 401, 'Invalid refresh token');
      return;
    }
    const access = await signProjectAccessToken({
      projectId,
      endUserId: rotated.refresh.endUserId,
      sessionId: rotated.refresh.sessionId,
      expiresInMinutes: config.accessTokenTtlMinutes,
    });
    await logRuntimeAuth(projectId, 'auth.token.refresh', 'auth_refresh_token', rotated.refresh.id, {
      endUserId: rotated.refresh.endUserId,
      sessionId: rotated.refresh.sessionId,
    });

    reply.send({
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      sessionToken: rotated.sessionToken,
      refreshToken: rotated.refreshToken,
      sessionExpiresAt: rotated.sessionExpiresAt.toISOString(),
      refreshExpiresAt: rotated.refresh.expiresAt.toISOString(),
    });
    },
  );

  app.post(
    '/runtime/auth/password/forgot',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as { projectId?: string; email?: string } | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim().toLowerCase();
    if (!projectId || !email) {
      sendError(reply, 400, 'projectId and email are required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const endUser = await prisma.authEndUser.findFirst({
      where: { projectId, email },
      select: { id: true },
    });
    if (!endUser) {
      await logRuntimeAuth(projectId, 'auth.password.forgot', 'auth_end_user', null, {
        email,
        userFound: false,
      });
      reply.send({ ok: true });
      return;
    }

    const issued = await issuePasswordResetToken({
      projectId,
      endUserId: endUser.id,
    });
    const emailMessage = buildPasswordResetEmail({ resetToken: issued.token });
    try {
      await authEmailProvider.send({
        to: email,
        subject: emailMessage.subject,
        text: emailMessage.text,
      });
    } catch (error) {
      app.log.error(
        {
          event: 'auth.email.send_failed',
          provider: authEmailProvider.name,
          flow: 'password_reset',
          projectId,
          email,
          error: error instanceof Error ? error.message : String(error),
        },
        'failed to send password reset email',
      );
    }
    await logRuntimeAuth(projectId, 'auth.password.forgot', 'auth_password_reset_token', issued.record.id, {
      email,
      endUserId: endUser.id,
    });

    reply.send({ ok: true, resetToken: issued.token });
    },
  );

  app.post(
    '/runtime/auth/password/reset',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as
      | { projectId?: string; token?: string; password?: string }
      | undefined;
    const projectId = body?.projectId?.trim();
    const token = body?.token?.trim();
    const password = body?.password;
    if (!projectId || !token || !password) {
      sendError(reply, 400, 'projectId, token, and password are required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const record = await prisma.authPasswordResetToken.findFirst({
      where: {
        projectId,
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, endUserId: true },
    });
    if (!record) {
      sendError(reply, 401, 'Invalid or expired token');
      return;
    }

    await rotateLocalPassword({
      projectId,
      endUserId: record.endUserId,
      nextPassword: password,
    });
    await prisma.authPasswordResetToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    await logRuntimeAuth(projectId, 'auth.password.reset', 'auth_end_user', record.endUserId, {
      resetTokenId: record.id,
    });

    reply.send({ ok: true });
    },
  );

  app.post(
    '/runtime/auth/email/verify/request',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as { projectId?: string; email?: string } | undefined;
    const projectId = body?.projectId?.trim();
    const email = body?.email?.trim().toLowerCase();
    if (!projectId || !email) {
      sendError(reply, 400, 'projectId and email are required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const endUser = await prisma.authEndUser.findFirst({
      where: { projectId, email },
      select: { id: true },
    });
    if (!endUser) {
      await logRuntimeAuth(projectId, 'auth.email.verify.request', 'auth_end_user', null, {
        email,
        userFound: false,
      });
      reply.send({ ok: true });
      return;
    }

    const issued = await issueEmailVerificationToken({
      projectId,
      endUserId: endUser.id,
    });
    const emailMessage = buildEmailVerificationEmail({
      verificationToken: issued.token,
    });
    try {
      await authEmailProvider.send({
        to: email,
        subject: emailMessage.subject,
        text: emailMessage.text,
      });
    } catch (error) {
      app.log.error(
        {
          event: 'auth.email.send_failed',
          provider: authEmailProvider.name,
          flow: 'email_verification',
          projectId,
          email,
          error: error instanceof Error ? error.message : String(error),
        },
        'failed to send email verification email',
      );
    }
    await logRuntimeAuth(
      projectId,
      'auth.email.verify.request',
      'auth_email_verification_token',
      issued.record.id,
      {
        email,
        endUserId: endUser.id,
      },
    );
    reply.send({ ok: true, verificationToken: issued.token });
    },
  );

  app.post(
    '/runtime/auth/email/verify/confirm',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const body = request.body as { projectId?: string; token?: string } | undefined;
    const projectId = body?.projectId?.trim();
    const token = body?.token?.trim();
    if (!projectId || !token) {
      sendError(reply, 400, 'projectId and token are required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const record = await prisma.authEmailVerificationToken.findFirst({
      where: {
        projectId,
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, endUserId: true },
    });
    if (!record) {
      sendError(reply, 401, 'Invalid or expired token');
      return;
    }

    await prisma.authEmailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    await prisma.authEndUser.update({
      where: { id: record.endUserId },
      data: { emailVerifiedAt: new Date() },
    });
    await logRuntimeAuth(projectId, 'auth.email.verify.confirm', 'auth_end_user', record.endUserId, {
      verificationTokenId: record.id,
    });

    reply.send({ ok: true });
    },
  );

  app.get('/runtime/auth/jwks', async (request, reply) => {
    const query = request.query as { projectId?: string } | undefined;
    const projectId = query?.projectId?.trim();
    if (!projectId) {
      sendError(reply, 400, 'projectId is required');
      return;
    }

    const authModuleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!authModuleEnabled) {
      return;
    }

    const jwks = await buildProjectJwks(projectId);
    reply.send(jwks);
  });

  app.get('/runtime/auth/oauth/:provider/start', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== 'google' && provider !== 'github') {
      sendError(reply, 400, 'provider must be google or github');
      return;
    }
    const query = request.query as { projectId?: string; redirectUri?: string } | undefined;
    const projectId = query?.projectId?.trim();
    if (!projectId) {
      sendError(reply, 400, 'projectId is required');
      return;
    }
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }

    const providerConfig = await prisma.authProviderConfig.findFirst({
      where: {
        projectId,
        provider: provider === 'google' ? AuthIdentityProvider.GOOGLE : AuthIdentityProvider.GITHUB,
        enabled: true,
      },
    });
    if (!providerConfig) {
      reply.code(404).send({ error: `${provider} OAuth is not configured for this project` });
      return;
    }

    const state = issueOauthState({
      projectId,
      provider,
      redirectUri: query?.redirectUri?.trim() || undefined,
    });
    const callbackUrl = `${config.authRuntimeBaseUrl}/runtime/auth/oauth/${provider}/callback`;
    const authUrl =
      provider === 'google'
        ? new URL('https://accounts.google.com/o/oauth2/v2/auth')
        : new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', providerConfig.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    if (provider === 'google') {
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.googleOauthScopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
    } else {
      authUrl.searchParams.set('scope', config.githubOauthScopes.join(' '));
    }
    authUrl.searchParams.set('state', state);
    await logRuntimeAuth(projectId, 'auth.oauth.start', 'auth_provider_config', providerConfig.id, {
      provider,
    });

    reply.send({ provider, projectId, state, authUrl: authUrl.toString() });
  });

  app.get('/runtime/auth/oauth/:provider/callback', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== 'google' && provider !== 'github') {
      sendError(reply, 400, 'provider must be google or github');
      return;
    }
    const query = request.query as
      | {
          state?: string;
          code?: string;
          mockEmail?: string;
          mockSub?: string;
        }
      | undefined;
    const stateValue = query?.state?.trim();
    if (!stateValue) {
      sendError(reply, 400, 'state is required');
      return;
    }
    const oauthState = consumeOauthState(stateValue);
    if (!oauthState) {
      sendError(reply, 401, 'Invalid or expired state');
      return;
    }
    const moduleEnabled = await requireProjectModuleEnabled(
      request,
      reply,
      oauthState.projectId,
      ProjectModuleKey.AUTH,
    );
    if (!moduleEnabled) {
      return;
    }

    const providerConfig = await prisma.authProviderConfig.findFirst({
      where: {
        projectId: oauthState.projectId,
        provider:
          provider === 'google' ? AuthIdentityProvider.GOOGLE : AuthIdentityProvider.GITHUB,
        enabled: true,
      },
    });
    if (!providerConfig) {
      reply.code(404).send({ error: `${provider} OAuth is not configured for this project` });
      return;
    }

    let email = query?.mockEmail?.trim().toLowerCase();
    let providerSubject = query?.mockSub?.trim();
    if (!email || !providerSubject) {
      const code = query?.code?.trim();
      if (!code) {
        sendError(reply, 400, 'code is required');
        return;
      }

      const callbackUrl = `${config.authRuntimeBaseUrl}/runtime/auth/oauth/${provider}/callback`;
      const secret = decryptProviderSecret(providerConfig);
      const tokenResp =
        provider === 'google'
          ? await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: providerConfig.clientId,
                client_secret: secret,
                redirect_uri: callbackUrl,
                grant_type: 'authorization_code',
                code,
              }),
            })
          : await fetch('https://github.com/login/oauth/access_token', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                client_id: providerConfig.clientId,
                client_secret: secret,
                code,
                redirect_uri: callbackUrl,
              }),
            });
      if (!tokenResp.ok) {
        sendError(reply, 401, 'OAuth token exchange failed');
        return;
      }
      const tokenJson = (await tokenResp.json()) as { access_token?: string };
      if (!tokenJson.access_token) {
        sendError(reply, 401, 'OAuth token exchange failed');
        return;
      }

      if (provider === 'google') {
        const profileResp = await fetch(
          `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(tokenJson.access_token)}`,
        );
        if (!profileResp.ok) {
          sendError(reply, 401, 'OAuth profile fetch failed');
          return;
        }
        const profile = (await profileResp.json()) as { sub?: string; email?: string };
        email = profile.email?.trim().toLowerCase();
        providerSubject = profile.sub?.trim();
      } else {
        const userResp = await fetch('https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${tokenJson.access_token}`,
          },
        });
        if (!userResp.ok) {
          sendError(reply, 401, 'OAuth profile fetch failed');
          return;
        }
        const userProfile = (await userResp.json()) as { id?: number; email?: string | null };
        providerSubject = userProfile.id ? String(userProfile.id) : undefined;
        email = userProfile.email?.trim().toLowerCase();
        if (!email) {
          const emailResp = await fetch('https://api.github.com/user/emails', {
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${tokenJson.access_token}`,
            },
          });
          if (emailResp.ok) {
            const emails = (await emailResp.json()) as Array<{
              email?: string;
              primary?: boolean;
              verified?: boolean;
            }>;
            const preferred =
              emails.find((item) => item.primary && item.verified)?.email ??
              emails.find((item) => item.verified)?.email;
            email = preferred?.trim().toLowerCase();
          }
        }
      }
    }

    if (!email || !providerSubject) {
      sendError(reply, 401, 'OAuth profile is missing required identity fields');
      return;
    }

    let identity = await prisma.authIdentity.findFirst({
      where: {
        projectId: oauthState.projectId,
        provider:
          provider === 'google' ? AuthIdentityProvider.GOOGLE : AuthIdentityProvider.GITHUB,
        providerSubject,
      },
      include: { endUser: true },
    });

    let endUser = await prisma.authEndUser.findFirst({
      where: { projectId: oauthState.projectId, email },
    });

    if (identity?.endUser && endUser && identity.endUser.id !== endUser.id) {
      reply
        .code(409)
        .send({ error: 'OAuth identity conflicts with an existing account email' });
      return;
    }

    if (!identity) {
      if (!endUser) {
        endUser = await prisma.authEndUser.create({
          data: {
            projectId: oauthState.projectId,
            email,
            emailVerifiedAt: new Date(),
          },
        });
      }

      const existingProviderIdentity = await prisma.authIdentity.findFirst({
        where: {
          projectId: oauthState.projectId,
          endUserId: endUser.id,
          provider:
            provider === 'google' ? AuthIdentityProvider.GOOGLE : AuthIdentityProvider.GITHUB,
        },
      });
      if (existingProviderIdentity && existingProviderIdentity.providerSubject !== providerSubject) {
        reply
          .code(409)
          .send({ error: 'OAuth provider account is already linked with a different subject' });
        return;
      }

      if (existingProviderIdentity) {
        identity = await prisma.authIdentity.findFirst({
          where: { id: existingProviderIdentity.id },
          include: { endUser: true },
        });
      } else {
        identity = await prisma.authIdentity.create({
          data: {
            projectId: oauthState.projectId,
            endUserId: endUser.id,
            provider:
              provider === 'google' ? AuthIdentityProvider.GOOGLE : AuthIdentityProvider.GITHUB,
            providerSubject,
          },
          include: { endUser: true },
        });
      }
    } else {
      endUser = identity.endUser;
    }

    if (!endUser) {
      sendError(reply, 500, 'OAuth login failed to resolve end user');
      return;
    }

    const authConfig = await ensureAuthProjectConfig(oauthState.projectId);
    const issued = await issueAuthSessionWithRefresh({
      projectId: oauthState.projectId,
      endUserId: endUser.id,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
      accessTokenTtlMinutes: authConfig.accessTokenTtlMinutes,
      refreshTokenTtlDays: authConfig.refreshTokenTtlDays,
    });
    const access = await signProjectAccessToken({
      projectId: oauthState.projectId,
      endUserId: endUser.id,
      sessionId: issued.session.id,
      expiresInMinutes: authConfig.accessTokenTtlMinutes,
    });

    await logRuntimeAuth(oauthState.projectId, 'auth.oauth.login', 'auth_identity', identity?.id ?? null, {
      provider,
      endUserId: endUser.id,
    });

    reply.send({
      provider,
      endUser: {
        id: endUser.id,
        projectId: endUser.projectId,
        email: endUser.email,
      },
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      sessionToken: issued.sessionToken,
      refreshToken: issued.refreshToken,
      sessionExpiresAt: issued.sessionExpiresAt.toISOString(),
      refreshExpiresAt: issued.refreshExpiresAt.toISOString(),
      redirectUri: oauthState.redirectUri ?? null,
    });
  });
}
