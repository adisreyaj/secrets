const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, '');
const normalizeListValue = (value: string) => value.trim().toLowerCase();
const parseAppOrigins = (value?: string) =>
  (value ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
const parseLogSinks = (value?: string) =>
  (value ?? 'console')
    .split(',')
    .map((sink) => normalizeListValue(sink))
    .filter(Boolean);

const appOrigins = parseAppOrigins(process.env.APP_ORIGIN);
const logFormat = process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty';
const logSinks = parseLogSinks(process.env.LOG_SINKS);

export const config = {
  port: Number(process.env.PORT ?? 3001),
  env: process.env.NODE_ENV ?? 'development',
  appOrigin: appOrigins[0]!,
  appOrigins,
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  apiTokenTtlDays: Number(process.env.API_TOKEN_TTL_DAYS ?? 90),
  cliLoginTtlMinutes: Number(process.env.CLI_LOGIN_TTL_MINUTES ?? 10),
  globalCliTokenTtlDays: Number(process.env.GLOBAL_CLI_TOKEN_TTL_DAYS ?? 30),
  enableGlobalCliTokens: process.env.ENABLE_GLOBAL_CLI_TOKENS !== 'false',
  inviteTtlDays: Number(process.env.INVITE_TTL_DAYS ?? 7),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  logFormat,
  logSinks,
  logRemoteEnabled: process.env.LOG_REMOTE_ENABLED === 'true',
};
