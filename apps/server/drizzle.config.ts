import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim(),
  },
});
