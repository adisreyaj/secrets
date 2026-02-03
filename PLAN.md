# Secrets Manager MVP (React + Fastify + Prisma/MySQL)

**Summary**
We will build a monorepo with a Fastify TypeScript API and a React web app to manage projects, environments, and secrets, with full history, audit logs, and secure at-rest encryption. The MVP targets a single-tenant deployment with basic roles and supports a `.env` export flow for Node.js.

## Repo Structure
- `apps/server` for Fastify API, Prisma, and crypto utilities
- `apps/web` for React UI
- `packages/shared` for shared DTO types and API request/response shapes

## Core Features
- Projects and environments
- Secret CRUD with full history and rollback
- Audit log
- Basic roles: Admin, Editor, Viewer
- `.env` export endpoint and UI download button

## Security Model
- At-rest encryption using AES-256-GCM with a master key in `MASTER_KEY`
- Random IV per secret version, store `ciphertext`, `iv`, `tag`, and `key_version`
- Auth with email/password and server-side sessions stored in DB
- API tokens for programmatic access, stored as hashes and shown once on creation
- Same-site cookie auth for web, `Authorization: Bearer` for API tokens
- Login rate limiting and Origin checks on state-changing requests

## Data Model (Prisma)
- `users`: id, email, password_hash, name, created_at, updated_at
- `user_sessions`: id, user_id, token_hash, expires_at, created_at
- `projects`: id, name, created_at, updated_at
- `project_members`: id, project_id, user_id, role
- `environments`: id, project_id, name, created_at, updated_at
- `secrets`: id, environment_id, key, created_at, updated_at
- `secret_versions`: id, secret_id, ciphertext, iv, tag, key_version, created_by, created_at, is_active
- `api_tokens`: id, project_id, name, token_hash, created_by, created_at, last_used_at
- `audit_logs`: id, project_id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at

## Public API (REST)
- `POST /auth/register` create user, returns session cookie
- `POST /auth/login` create session cookie
- `POST /auth/logout` delete session
- `GET /me` current user
- `POST /projects` create project
- `GET /projects` list projects
- `POST /projects/:id/members` add member and role
- `POST /projects/:id/environments` create environment
- `GET /projects/:id/environments` list environments
- `GET /environments/:id/secrets` list secrets, optionally include values for Admin/Editor
- `POST /environments/:id/secrets` create secret with initial version
- `PATCH /secrets/:id` add new version and set active
- `POST /secrets/:id/rollback` set active to previous version
- `DELETE /secrets/:id` soft-delete or mark inactive
- `GET /environments/:id/export?format=dotenv` returns `.env` text
- `POST /projects/:id/api-tokens` create token and return plaintext once
- `GET /audit?projectId=...` list audit events

## React UI
- Auth: login and register
- Projects list and create
- Project detail with environments list and create
- Environment secrets list with add, edit, rollback, delete
- Audit log view with filters
- API tokens management view with one-time token display
- `.env` export button
  
## Web Stack
- Vite
- TanStack Router
- TanStack Query
- Tailwind CSS 4

## Important Changes or Additions to Public APIs/Interfaces/Types
- Define shared request/response DTOs for each endpoint in `packages/shared`
- API token response includes plaintext token only on creation
- Secret list response includes `value` only when user has read permissions and `includeValues=true`

## Testing
- Unit tests for crypto helpers: encrypt/decrypt and invalid tag handling
- Integration tests for auth, secrets CRUD, versioning, rollback, and access control
- Integration test for `.env` export format
- API token auth path tests

## Implementation Steps
1. Scaffold monorepo with `pnpm` workspaces and TypeScript configs for `apps/server`, `apps/web`, and `packages/shared`.
2. Define Prisma schema and migrations for the data model and generate client.
3. Build auth flows with session cookies, password hashing, and rate-limited login.
4. Implement crypto utilities and secret versioning service layer.
5. Implement REST API endpoints with access control and audit logging.
6. Build React UI pages and services wired to API DTOs.
7. Add `.env` export endpoint and UI action.
8. Add tests and basic README with environment variables and local dev steps.

## New Libraries to Confirm Before Adding
- Server: `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `bcryptjs`, `supertest`, `vitest`
- Web: `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `vite`, `@vitejs/plugin-react`, `tailwindcss@4`, `postcss`, `autoprefixer`
- Shared: optional schema validation library if desired

## Assumptions
- Single-tenant deployment with a single workspace scope
- No CLI in MVP, `.env` export via API + UI only
- API and web app are served from the same origin in production
- Key rotation is deferred, but `key_version` is stored for future support
