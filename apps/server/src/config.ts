const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, '');
const parseAppOrigins = (value?: string) =>
  (value ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

const appOrigins = parseAppOrigins(process.env.APP_ORIGIN);

export const config = {
  port: Number(process.env.PORT ?? 3001),
  appOrigin: appOrigins[0]!,
  appOrigins,
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  apiTokenTtlDays: Number(process.env.API_TOKEN_TTL_DAYS ?? 90),
  cliLoginTtlMinutes: Number(process.env.CLI_LOGIN_TTL_MINUTES ?? 10),
  inviteTtlDays: Number(process.env.INVITE_TTL_DAYS ?? 7),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
