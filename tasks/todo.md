# Task Plan — Prisma → Drizzle + Turso migration

## Goals

- Replace Prisma/MySQL with Drizzle + Turso (libSQL)
- Keep better-auth dashboard auth (drizzle adapter)
- Keep envelope encryption, CLI tokens, Auth product module, web app
- Fresh DB OK — no data migration

## Progress

- [x] Inventory Prisma schema + all `@prisma/client` / `prisma.*` usages
- [x] Install `drizzle-orm`, `@libsql/client`, `drizzle-kit`, `@better-auth/drizzle-adapter`; remove Prisma deps
- [x] Port full schema to Drizzle (SQLite/libSQL) under `apps/server/src/db/`
- [x] Replace `db.ts` with Turso/libSQL client + drizzle
- [x] Wire better-auth drizzle adapter (`provider: "sqlite"`)
- [x] Convert all server routes/services/middleware from Prisma API → Drizzle
- [x] Update env examples, package scripts, AGENTS.md, README, nixpacks notes
- [x] Update tests (mock `db` / enums; libSQL unique-error helper)
- [x] Squash DB history to a single initial Drizzle migration (`drizzle/0000_init.sql`)
- [x] Remove `prisma/` directory, Prisma migrations, and leftover Prisma config
- [x] Verify `db:generate` (no-op) + `db:migrate` / `db:push` on fresh file DB
- [x] Build + lint + tests green (73 tests; lint warnings only in test mocks)

## Env

```bash
# Local file DB
DATABASE_URL="file:./data/local.db"
# Turso cloud
# DATABASE_URL="libsql://YOUR_DB-ORG.turso.io"
# DATABASE_AUTH_TOKEN="..."
```

## Local setup (fresh DB)

```bash
cp apps/server/.env.example apps/server/.env
# Ensure DATABASE_URL is file:./data/local.db (not MySQL)
mkdir -p apps/server/data
rm -f apps/server/data/local.db   # if resetting
pnpm db:migrate                   # preferred; applies drizzle/0000_init.sql
# or: pnpm db:push                # schema push without migration journal
pnpm build:server
pnpm dev:server
```

## Notes

- Auth product tables moved to Drizzle schema (no data migration).
- Bytes/blob columns preserved for ciphertexts; AAD/envelope semantics unchanged.
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` still required in each environment.
- Recovery/security docs still mention MySQL/Prisma in places — update when convenient.
- After schema edits: `pnpm db:generate` then `pnpm db:migrate`.
