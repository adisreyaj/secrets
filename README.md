# Secrets Manager MVP

A lightweight secrets manager built with Fastify (TypeScript), Prisma/MySQL, and a React web app. Focused on simple, secure secret storage for Node.js workflows with zero-friction injection and optional `.env` export.

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

5. Start the web app:

```bash
pnpm dev:web
```

## Zero-Friction CLI Usage

Run any command with injected secrets (no setup required):

```bash
SECRETS_TOKEN=... SECRETS_ENV=dev secrets run -- npm run dev
```

First-time login and setup:

```bash
secrets login
secrets init
```

Optional export:

```bash
SECRETS_TOKEN=... SECRETS_ENV=dev secrets export --format dotenv --out .env.local
```

Optional config file (`.secretsrc.json`) is supported but not required.
See `docs/cli.md` for CLI details and `.secretsrc.example.json` for a sample config.

## Environment Variables

Required in `apps/server/.env`:

- `DATABASE_URL` MySQL connection string
- `MASTER_KEY` 32-byte key (64 hex chars or 32-byte base64)
- `MASTER_KEY_VERSION` optional key version (default `v1`)
- `APP_ORIGIN` app origin (or comma-separated origins) allowed for browser writes, e.g. `https://app.example.com,https://www.app.example.com`
- `SESSION_TTL_HOURS` session lifespan
- `COOKIE_SECURE` set to `true` in production
- `PORT` API port (default `3001`)

CLI/SDK environment variables:

- `SECRETS_TOKEN` API token
- `SECRETS_ENV` environment id or slug
- `SECRETS_PROJECT` project id or slug (required when env is a slug)
- `SECRETS_API_BASE_URL` API base URL (default `http://localhost:3001`)

## Project Structure

- `apps/server` Fastify API + Prisma schema
- `apps/web` React app
- `packages/shared` Shared DTO types
- `packages/cli` Secrets CLI
- `packages/sdk` Node SDK

## Notes

- API tokens are shown only once on creation.
- `.env` export is available for editors/admins.
- Role enforcement: Admin, Editor, Viewer.
- Roadmap and parity plan: see `docs/roadmap.md`.
