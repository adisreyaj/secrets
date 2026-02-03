# Secrets CLI (Zero-Friction)

## Quick Start

Run any command with injected secrets (no setup required):

```bash
SECRETS_TOKEN=... SECRETS_ENV=dev secrets run -- npm run dev
```

Optional export:

```bash
SECRETS_TOKEN=... SECRETS_ENV=dev secrets export --format dotenv --out .env.local
```

## Environment Variables

- `SECRETS_TOKEN` API token (required)
- `SECRETS_ENV` environment id or slug (required)
- `SECRETS_PROJECT` project id or slug (required when env is a slug)
- `SECRETS_API_BASE_URL` API base URL (default `http://localhost:3001`)

## Commands

- `secrets run -- <cmd>` injects secrets and runs the command
- `secrets export --format dotenv [--out <file>]` writes dotenv output
- `secrets list` prints secret keys
- `secrets get <key>` prints a single secret value

## Optional Config File

Create `.secretsrc.json` to avoid flags or env vars (never include tokens):

```json
{
  "apiBaseUrl": "http://localhost:3001",
  "projectSlug": "acme",
  "environmentSlug": "dev"
}
```

If the file exists, CLI will use it. Env vars/flags always override.
