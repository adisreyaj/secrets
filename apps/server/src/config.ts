export const config = {
  port: Number(process.env.PORT ?? 3001),
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:4200',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  cookieSecure: process.env.COOKIE_SECURE === 'true'
};
