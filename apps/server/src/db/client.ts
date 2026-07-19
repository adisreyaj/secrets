import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;

export const libsql = createClient({
  url: databaseUrl,
  authToken,
});

export const db = drizzle(libsql, { schema });

export type Database = typeof db;
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
