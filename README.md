# Secrets Manager MVP

A lightweight secrets manager built with Fastify (TypeScript), Prisma/MySQL, and Angular 21. Focused on simple, secure secret storage for Node.js workflows with `.env` export.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Configure the API environment:

```bash
cp apps/server/.env.example apps/server/.env
```

3. Run Prisma migrations:

```bash
pnpm prisma:migrate
```

4. Start the API server:

```bash
pnpm build:server
pnpm -C apps/server start
```

For local iteration, run the TypeScript compiler in watch mode:

```bash
pnpm dev:server
```

5. Start the Angular app:

```bash
pnpm dev:web
```

## Environment Variables

Required in `apps/server/.env`:

- `DATABASE_URL` MySQL connection string
- `MASTER_KEY` 32-byte key (64 hex chars or 32-byte base64)
- `MASTER_KEY_VERSION` optional key version (default `v1`)
- `APP_ORIGIN` the Angular app origin (default `http://localhost:4200`)
- `SESSION_TTL_HOURS` session lifespan
- `COOKIE_SECURE` set to `true` in production
- `PORT` API port (default `3001`)

## Project Structure

- `apps/server` Fastify API + Prisma schema
- `apps/web` Angular 21 app
- `packages/shared` Shared DTO types

## Notes

- API tokens are shown only once on creation.
- `.env` export is available for editors/admins.
- Role enforcement: Admin, Editor, Viewer.

