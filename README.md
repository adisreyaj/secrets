# Secrets Manager

A focused secrets management platform built with Fastify (TypeScript), Prisma/MySQL, and a React web app.

Core capabilities:
- organize secrets by project and environment
- create, update, copy, rollback, and delete secrets
- export secrets as `.env` or CSV
- manage API tokens for CLI/SDK access
- view audit history for secret changes

## Quick start

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

## CLI usage

Run a command with injected secrets:

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

## Environment variables

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

Web app environment variables (Vite):

- `VITE_POSTHOG_KEY` PostHog project API key
- `VITE_POSTHOG_HOST` PostHog host (default `https://app.posthog.com`)
- `VITE_ERROR_TRACKING_PROVIDER` error tracking provider (default `posthog`)
- `VITE_ERROR_TRACKING_DEBUG` set to `true` to enable PostHog debug logs
- Error tracking is enabled only in production (`import.meta.env.PROD`)

## Project structure

- `apps/server` Fastify API + Prisma schema
- `apps/web` React app
- `packages/shared` Shared DTO types
- `packages/cli` Secrets CLI
- `packages/sdk` Node SDK

## Notes

- API tokens are shown only once on creation.
- `.env` export is available for editors/admins.
- Role enforcement: Admin, Editor, Viewer.
- The product scope is intentionally limited to secrets management.

## Recovery

See [`docs/recovery.md`](docs/recovery.md) for detailed recovery procedures —
covering lost secrets, lost tokens, lost MASTER_KEY, disaster recovery, backup
recipes, and prevention checklists.
