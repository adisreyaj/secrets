import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { hashPassword, verifyPassword } from './auth.js';
import { config } from './config.js';
import {
    account,
    db,
    passkey as passkeyTable,
    session,
    users,
    verification,
} from './db/index.js';

const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET?.trim() ||
  process.env.MASTER_KEY?.trim() ||
  'dev-only-better-auth-secret-change-me';

const betterAuthBaseUrl =
  process.env.BETTER_AUTH_URL?.trim() ||
  process.env.AUTH_RUNTIME_BASE_URL?.trim() ||
  process.env.PORTLESS_URL?.trim() ||
  `http://localhost:${config.port}`;

/** RP ID must match the page origin host (web app), not the API host. */
const passkeyRpID =
  process.env.PASSKEY_RP_ID?.trim() ||
  (() => {
    try {
      return new URL(config.appOrigin).hostname;
    } catch {
      return 'localhost';
    }
  })();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: users,
      session,
      account,
      verification,
      passkey: passkeyTable,
    },
  }),
  secret: betterAuthSecret,
  baseURL: betterAuthBaseUrl,
  trustedOrigins: config.appOrigins,
  advanced: {
    cookiePrefix: 'sm',
    useSecureCookies: config.cookieSecure,
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      httpOnly: true,
    },
  },
  session: {
    expiresIn: config.sessionTtlHours * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    password: {
      hash: hashPassword,
      verify: async ({ hash, password }) => verifyPassword(password, hash),
    },
  },
  user: {
    additionalFields: {},
  },
  plugins: [
    passkey({
      rpID: passkeyRpID,
      rpName: process.env.PASSKEY_RP_NAME?.trim() || 'Secrets',
      origin: config.appOrigins,
    }),
  ],
});

export type DashboardAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export async function getDashboardSession(
  headers: Headers | IncomingHttpHeaders,
): Promise<DashboardAuthSession | null> {
  const normalized = headers instanceof Headers ? headers : fromNodeHeaders(headers);
  return auth.api.getSession({ headers: normalized });
}

export function applyAuthSetCookies(
  reply: { header: (name: string, value: string | string[]) => unknown },
  headers: Headers,
): void {
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (() => {
          const single = headers.get('set-cookie');
          return single ? [single] : [];
        })();

  for (const cookie of setCookies) {
    reply.header('set-cookie', cookie);
  }
}
