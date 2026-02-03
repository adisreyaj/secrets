const normalizeOrigin = (value: string) => value.replace(/\/$/, '');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  appOrigin: normalizeOrigin(process.env.APP_ORIGIN ?? 'http://localhost:5173'),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  apiTokenTtlDays: Number(process.env.API_TOKEN_TTL_DAYS ?? 90),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
