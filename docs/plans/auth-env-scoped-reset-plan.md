# Auth UX Simplification and Environment-Scoped Reset (FF-Parity)

## Summary
Implement Auth with the same mental model as the new Feature Flags architecture:

- Environment-first management flow remains canonical:
  - `Projects -> Auth Management -> Environments -> Auth`
- Explicit per-environment Auth config is the only source of truth.
- Remove project-level implicit behavior for Auth config/providers/clients.
- Consolidate create/edit interactions into side sheets, reduce fragmented forms.
- Add environment diff for Auth configuration.
- Runtime APIs become environment-scoped (`environmentId` canonical).
- Compatibility choice: **immediate hard cutover** (no long-lived legacy write/read paths).

This plan uses the FF reset implementation as the structural reference for schema, route shape, query keys, and UX patterns.

---

## Goals and Success Criteria

1. Users can manage Auth policy/providers/clients only in selected environment context.
2. Runtime Auth operations resolve environment explicitly and use that environment’s Auth config.
3. No “project-level fallback” for mutable Auth settings.
4. Users can compare Auth settings across environments before promotion.
5. UI follows existing module-first + env-tab patterns already established in Secrets/FF.
6. All server/web tests pass with env-scoped Auth behavior.

---

## Locked Decisions

1. Runtime identifier:
- Canonical input is **`environmentId`** (not `projectId`) for runtime Auth endpoints.

2. Client scoping:
- Auth clients are **environment-scoped** (same as providers/config).

3. Compatibility:
- **Immediate hard cutover** for deprecated project-scoped Auth config/provider/client routes.
- Keep route-level browser redirects only for page URLs already in place (`/projects/:id/auth` -> `/projects/:id/auth/environments`).

---

## Public API / Interface Changes

## Shared types (`packages/shared/src/index.ts`)

Add/replace Auth DTOs with env-scoped equivalents:

1. `AuthEnvironmentConfigDto`
- `id`
- `projectId`
- `environmentId`
- `nativeAuthEnabled`
- `emailPasswordEnabled`
- `accessTokenTtlMinutes`
- `refreshTokenTtlDays`
- `labels: string[]`
- `createdAt`
- `updatedAt`

2. `AuthEnvironmentProviderDto`
- `id`
- `projectId`
- `environmentId`
- `provider: 'google' | 'github'`
- `enabled`
- `clientId`
- `scopes: string[]`
- `createdAt`
- `updatedAt`

3. `AuthEnvironmentClientDto`
- `id`
- `projectId`
- `environmentId`
- `name`
- `clientId`
- `type: 'public' | 'confidential'`
- `redirectUris: string[]`
- `createdAt`
- `updatedAt`
- `deletedAt?: string | null`

4. `AuthEnvironmentSnapshotDto` + `AuthEnvironmentDiffDto`
- snapshot includes config + providers + clients (normalized)
- diff booleans:
  - `configChanged`
  - `providersChanged`
  - `clientsChanged`

Deprecate old project-level DTO usage in web callsites.

---

## Backend API contract (`apps/server/src/server/routes/auth.ts`, `apps/server/src/server/routes/runtimeAuth.ts`)

## Management endpoints (canonical, env-scoped)

1. Config
- `GET /projects/:projectId/auth/config?environmentId=...`
- `PUT /projects/:projectId/auth/config`
  - body requires `environmentId`
  - body supports config fields + labels

2. Providers
- `GET /projects/:projectId/auth/providers?environmentId=...`
- `POST /projects/:projectId/auth/providers`
  - body requires `environmentId`
- `PATCH /auth/providers/:providerId`
  - body requires `environmentId`
- `POST /auth/providers/:providerId/rotate-secret`
  - body requires `environmentId`

3. Clients
- `GET /projects/:projectId/auth/clients?environmentId=...`
- `POST /projects/:projectId/auth/clients`
  - body requires `environmentId`
- `PATCH /auth/clients/:clientId`
  - body requires `environmentId`
- `DELETE /auth/clients/:clientId`
  - body requires `environmentId` (or query param, pick one and keep consistent)

4. Diff
- `GET /projects/:projectId/auth/diff?fromEnvironmentId=...&toEnvironmentId=...`

## Runtime endpoints (canonical, env-scoped)

Change runtime input contracts to require `environmentId`, and derive `projectId` from environment:
- `POST /runtime/auth/signup`
- `POST /runtime/auth/login`
- `POST /runtime/auth/logout`
- `POST /runtime/auth/token/refresh`
- `POST /runtime/auth/password/forgot`
- `POST /runtime/auth/password/reset`
- `POST /runtime/auth/email/verify/request`
- `POST /runtime/auth/email/verify/confirm`
- `GET /runtime/auth/jwks?environmentId=...`
- `GET /runtime/auth/oauth/:provider/start?environmentId=...`
- `GET /runtime/auth/oauth/:provider/callback?...` (state carries environment)

Remove projectId-required runtime behavior for these endpoints.

---

## Data Model Changes (`apps/server/prisma/schema.prisma`)

Create explicit env-scoped Auth config entities:

1. `AuthEnvironmentConfig`
- `id`
- `projectId`
- `environmentId`
- `nativeAuthEnabled`
- `emailPasswordEnabled`
- `accessTokenTtlMinutes`
- `refreshTokenTtlDays`
- `labelsJson`
- timestamps
- unique `(projectId, environmentId)`

2. `AuthEnvironmentProviderConfig`
- `id`
- `projectId`
- `environmentId`
- `provider`
- `enabled`
- `clientId`
- encrypted secret fields
- `scopesJson`
- timestamps
- unique `(environmentId, provider)`

3. `AuthEnvironmentClient`
- `id`
- `projectId`
- `environmentId`
- `name`
- `type`
- `clientId`
- `clientSecretHash`
- `redirectUrisJson`
- timestamps/soft delete
- unique `(environmentId, clientId)`

Deprecate/replace old project-scoped config/provider/client tables:
- `AuthProjectConfig`
- `AuthProviderConfig`
- `AuthClient`

---

## Migration Strategy (hard cutover)

1. Create new env-scoped auth tables.
2. Backfill per project/environment:
- Config: clone project config to each environment (defaults if missing).
- Providers: clone each project provider to each environment.
- Clients: clone each project client to each environment.
- Labels default `[]`.
3. Integrity checks (migration must fail loudly if any env config missing).
4. Switch server code paths to new tables only.
5. Drop old project-scoped auth tables in same release (hard cutover).

---

## Web UX Plan (`apps/web/src/pages/AuthSettingsPage.tsx` + new auth feature components)

## Core UX
1. Keep existing module-first route flow and `EnvironmentTabsCard` at top.
2. Replace fragmented inline create/edit with side sheets:
- `AuthConfigSheet` (policy + labels)
- `AuthProviderSheet` (create/edit)
- `AuthClientSheet` (create/edit/rotate)
3. Add `Compare environments` action:
- source env = current tab
- target env picker
- diff modal/panel for config/providers/clients

## Page structure
1. Header:
- `Auth settings`
- explicit environment badge/context in subtitle
2. Sections:
- `Core policy` (view/edit in side sheet)
- `Providers registry` (list + create/edit/rotate via side sheet)
- `Clients registry` (list + create/edit/delete/rotate via side sheet)
3. Remove project-level wording; every action copy includes env name.

## UX safeguards
1. Destructive/rotate confirmations include environment name.
2. Empty states:
- no environments -> CTA create environment
- no providers/clients in env -> clear CTA in section.

---

## Query + API wiring (`apps/web/src/lib/queryKeys.ts`, `apps/web/src/lib/api.ts`)

1. Query keys include environment scope:
- `authConfig(projectId, environmentId)`
- `authProviders(projectId, environmentId)`
- `authClients(projectId, environmentId)`
- `authDiff(projectId, fromEnvironmentId, toEnvironmentId)`

2. API methods require/pass `environmentId` on all auth config/provider/client operations.
3. Invalidate only env-specific auth queries after mutations.

---

## Runtime/Auth service behavior changes

1. Runtime policy resolution:
- load `AuthEnvironmentConfig` by `environmentId`.
- enforce native/email-password toggles per environment.

2. OAuth provider resolution:
- load provider credentials from `AuthEnvironmentProviderConfig`.

3. Client credential auth:
- resolve from `AuthEnvironmentClient` for the runtime environment.

4. Tokens/sessions:
- keep existing user/session entities project-scoped initially.
- include `environmentId` in runtime metadata/logging/state payloads.
- ensure refresh/logout revalidate against environment-scoped policy.

---

## Routing and Compatibility

1. Keep current canonical UI routes:
- `/projects/:projectId/auth/environments`
- `/projects/:projectId/auth/environments/:environmentId`
2. Keep legacy page redirect:
- `/projects/:projectId/auth` -> `/projects/:projectId/auth/environments`
3. Remove legacy management API assumptions that omit `environmentId`.

---

## Test Plan

## Web tests
1. `router.test.ts`
- auth env routes still parse correctly.
2. Auth page behavior
- switching env tab refetches env-scoped config/providers/clients.
- create/edit payloads include selected `environmentId`.
- side sheets open for create/edit and close on success.
3. Diff
- compare action displays expected changed sections.
4. Regression
- secrets/flags pages unchanged.

## Server tests
1. Auth config CRUD with `environmentId`.
2. Provider/client CRUD + rotate with `environmentId`.
3. Auth diff endpoint accuracy across envs.
4. Runtime auth endpoints require `environmentId`.
5. Runtime policy/provider enforcement differs by env as configured.
6. Approval flow still works for auth keys with env metadata.

## E2E scenarios
1. Configure `dev` auth with native login enabled, `prod` disabled.
2. Signup/login succeeds in `dev`, blocked in `prod`.
3. Configure different OAuth credentials in `dev` vs `prod`.
4. Diff shows config/providers/clients divergence.

---

## Rollout Plan

1. Deploy order:
- server migration + backend first
- web next
- runtime clients/sdk updates after backend stabilizes
2. Communicate breaking API changes:
- all auth management writes now require `environmentId`
- runtime auth now uses `environmentId` canonical input
3. No compatibility grace window (per decision).

---

## Explicit Assumptions and Defaults

1. Environment-first auth flow in UI remains unchanged and is already canonical.
2. End-user/session domain remains project-scoped for this phase; only policy/provider/client config is env-scoped.
3. Labels are simple string arrays on auth environment config.
4. OAuth providers supported remain `google` and `github`.
5. Immediate hard cutover is acceptable operationally for this release.
