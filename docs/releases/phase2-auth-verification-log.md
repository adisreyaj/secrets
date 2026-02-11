# Phase 2 Auth Verification Log

Date: 2026-02-11  
Parent ticket: `SRE-52` (`REL-AUTH-OPS-000`)

## SRE-53 — Pre-launch infra/config verification evidence

Status: Complete (repository-level evidence captured; target environment checks remain launch-window actions).

### Checks and Evidence

1. Auth migrations and table coverage
- Evidence:
  - `apps/server/prisma/schema.prisma` maps all required models to tables:
    - `auth_project_configs`, `auth_end_users`, `auth_identities`, `auth_sessions`, `auth_refresh_tokens`, `auth_signing_keys`, `auth_password_reset_tokens`, `auth_email_verification_tokens`, `auth_clients`, `auth_provider_configs`.
  - Migrations present:
    - `apps/server/prisma/migrations/20260210220000_auth_core/migration.sql`
    - `apps/server/prisma/migrations/20260210221000_auth_tokens_keys/migration.sql`
    - `apps/server/prisma/migrations/20260211082000_auth_providers/migration.sql`

2. Required auth env/config values (code-level)
- Evidence:
  - `apps/server/src/config.ts` defines:
    - `AUTH_RUNTIME_BASE_URL`
    - `AUTH_EMAIL_PROVIDER`, `AUTH_EMAIL_FROM`, `AUTH_EMAIL_FROM_NAME`, `RESEND_API_KEY`
    - `AUTH_LOGIN_MAX_ATTEMPTS`, `AUTH_LOGIN_LOCK_MS`
    - OAuth scopes (`GOOGLE_OAUTH_SCOPES`, `GITHUB_OAUTH_SCOPES`)
- Note: OAuth callback-compatible external base URL is deployment-specific and must be verified in target environment settings during launch.

3. Project module toggles (`auth` enabled) support
- Evidence:
  - `project_modules` schema and migration include `AUTH` module:
    - `apps/server/prisma/migrations/20260210205500_project_modules/migration.sql`
  - API toggle/read endpoints:
    - `apps/server/src/app.ts` (`GET /projects/:id/modules`, `PUT /projects/:id/modules/:module`)
  - Auth routes gate on module enablement:
    - `apps/server/src/server/routes/auth.ts`
    - `apps/server/src/server/routes/runtimeAuth.ts`

4. Provider credentials configured per pilot project
- Evidence:
  - Provider config + secret rotation endpoints exist:
    - `apps/server/src/server/routes/auth.ts`
      - `GET /projects/:projectId/auth/providers`
      - `POST /projects/:projectId/auth/providers`
      - `PATCH /auth/providers/:providerId`
      - `POST /auth/providers/:providerId/rotate-secret`
- Note: Per-project credential presence in production pilots is an environment/runtime validation step.

5. Auth approval rules for gated changes
- Evidence:
  - Approval queuing logic for auth config/provider/client writes:
    - `apps/server/src/server/routes/auth.ts` (`maybeQueueAuthApproval`)
  - Approval rules UI/API surfaces:
    - `apps/web/src/pages/ApprovalRulesPage.tsx`
    - `apps/web/src/lib/api.ts`
  - Security hardening doc confirms encrypted payload usage for provider secrets:
    - `docs/security/auth-security-pass.md`

6. Audit retention policy and auth audit filtering
- Evidence:
  - Audit API:
    - `apps/server/src/app.ts` (`GET /audit`)
  - Retention cleanup job:
    - `apps/server/src/app.ts` (`runAuditRetentionCleanup`, project `auditRetentionDays`)
  - Auth module filter semantics:
    - `docs/integration/web-api-launch-scope.md` (`metadata_json.module = "auth"`)
    - `docs/security/auth-security-pass.md`

### Command Evidence (run in repo)

- `rg -n "auth_project_config|auth_end_users|auth_identities|auth_sessions|auth_refresh_tokens|auth_signing_keys|auth_password_reset_tokens|auth_email_verification_tokens|auth_clients|auth_provider_configs" apps/server/prisma -S`
- `rg -n "AUTH_|OAUTH|RESEND|EMAIL|ABUSE|RATE|LOCKOUT|TOKEN_TTL|BASE_URL|CALLBACK" apps/server/src apps/web/src .secretsrc.example.json README.md docs -S`
- `rg -n "module|project_modules|auth enabled|Auth module|toggle" apps/server apps/web docs -S`
- `rg -n "approval|Approval|audit|retention|module=Auth|auth\\.|auth_" apps/server/src apps/web/src docs -S`

### Outstanding Environment Validations

- Confirm target deployment env values and callback URLs.
- Confirm pilot project `auth` module enablement and provider credentials in production.
- Confirm approval rule records and audit retention settings in the target database.

## SRE-54 — Release-branch test/build verification evidence

Status: Complete (all required commands passed on 2026-02-11 local execution).

### Command Results

1. `pnpm -C apps/server test`
- Result: PASS
- Summary: `22` test files passed, `74` tests passed, duration `5.63s`.
- Notes: expected negative-path warnings (`401`, `403`, `409`, `429`) surfaced during auth and guard tests.

2. `pnpm -C apps/web test --run`
- Result: PASS
- Summary: `10` test files passed, `28` tests passed, duration `3.57s`.

3. `pnpm -C apps/web build`
- Result: PASS
- Summary: TypeScript + Vite production build completed.
- Notes: bundle size warning for a chunk above `500 kB` (non-failing warning).

## SRE-55 — Management workflow launch validation

Status: Complete (management workflow coverage validated at route and test level).

### Scope Validated

1. Auth config read/write
- Route evidence (`apps/server/src/server/routes/auth.ts`):
  - `GET /projects/:projectId/auth/config`
  - `PUT /projects/:projectId/auth/config`
- Behavior evidence:
  - Project module gate (`AUTH`) + role gate (`VIEWER`/`ADMIN`)
  - Approval path (`maybeQueueAuthApproval`) for config updates
  - Audit event `auth.config.update` with `metadataJson.module = "auth"`

2. Provider CRUD + secret rotation
- Route evidence:
  - `GET /projects/:projectId/auth/providers`
  - `POST /projects/:projectId/auth/providers`
  - `PATCH /auth/providers/:providerId`
  - `POST /auth/providers/:providerId/rotate-secret`
- Security/approval evidence:
  - Provider secret encryption prior to approval queueing
  - Encrypted approval payload flow for provider secrets (also documented in `docs/security/auth-security-pass.md`)

3. Client CRUD + secret rotation
- Route evidence:
  - `GET /projects/:projectId/auth/clients`
  - `POST /projects/:projectId/auth/clients`
  - `PATCH /auth/clients/:clientId` (includes `rotateSecret`)
  - `DELETE /auth/clients/:clientId`
- Test evidence:
  - `apps/server/test/auth.clients.routes.test.ts` covers create, rotate, list, and delete flow.

4. Approval-gated management writes
- Test evidence:
  - `apps/server/test/auth.approvals.routes.test.ts` validates approval queue/apply behavior for auth config/provider flows and ensures provider secrets are not in approval metadata.

### Command Evidence

- `rg -n "GET /projects/:projectId/auth/config|PATCH /projects/:projectId/auth/config|/projects/:projectId/auth/providers|/auth/providers/:providerId|rotate-secret|/projects/:projectId/auth/clients|/auth/clients/:clientId|/rotate-secret" apps/server/src/server/routes/auth.ts -S`
- `rg -n "auth config|providers|rotate|clients" apps/server/test/auth.*.test.ts apps/server/test/runtime-auth.routes.test.ts -S`
