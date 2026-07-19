import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL ??= ':memory:';
process.env.MASTER_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_SECRET ??= 'test-better-auth-secret';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
