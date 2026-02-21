# Super App Execution Plan

Date: 2026-02-10
Owner: Product + Platform
Status: Draft (scope locked from stakeholder answers)

## Goal

Evolve the current secrets product into a super app with 3 modules per customer app (project):

- Secrets (existing)
- Feature Flags (Phase 1)
- Auth Management (Phase 2)

`Project` remains the customer application entity.

## Locked Product Decisions

- Add organization-level grouping above projects.
- Feature flags in Phase 1 support:
  - Server-side + client-side evaluation
  - Boolean + JSON flags
  - No segments, no scheduling, no dependencies, no analytics (for now)
- Auth in Phase 2 supports:
  - Native auth first (not integration-first)
  - Simplified JWT/session model (no full OIDC compliance in initial release)
  - Email/password + Google + GitHub
  - No magic link, no MFA, no custom domains in initial release
- Existing project API tokens/service accounts should be reused for management APIs where possible.
- Existing PostHog feature flags remain internal-only and separate from customer-facing flags.
- Initial deployment target: single region.

## Architecture Direction

- Keep existing Secrets module intact.
- Add Flags and Auth as project modules.
- Introduce clear API split:
  - Management API: admin portal operations
  - Runtime API: consumer app runtime operations
- Refactor monolithic route handling in `apps/server/src/app.ts` into module route files before scaling.

## Prisma Migration Plan

| Migration | Purpose | Schema Changes |
| --- | --- | --- |
| `2026xxxxxx_orgs_and_modules` | Add organization model + module toggles | `organizations`, `organization_members`, `projects.organization_id`, `project_modules` |
| `2026xxxxxx_flags_core` | Feature flag core entities | `feature_flags`, `feature_flag_environment_configs` |
| `2026xxxxxx_flags_keys_history` | Runtime keys + change history | `feature_flag_sdk_keys`, `feature_flag_change_history` |
| `2026xxxxxx_approvals_module_scope` | Extend approvals beyond secrets | Approval model adds module/resource metadata (non-breaking) |
| `2026xxxxxx_auth_core` | Native auth core entities | `auth_project_config`, `auth_end_users`, `auth_identities`, `auth_sessions`, `auth_refresh_tokens` |
| `2026xxxxxx_auth_tokens_keys` | JWT and recovery flows | `auth_signing_keys`, `auth_password_reset_tokens`, `auth_email_verification_tokens`, `auth_clients` |
| `2026xxxxxx_auth_providers` | Social provider config and secrets | `auth_provider_configs` (Google/GitHub), encrypted provider secrets |

## Endpoint Contract List

### Management API

#### Feature Flags

- `GET /projects/:projectId/flags`
- `POST /projects/:projectId/flags`
- `GET /flags/:flagId`
- `PATCH /flags/:flagId`
- `DELETE /flags/:flagId`
- `GET /projects/:projectId/flag-sdk-keys`
- `POST /projects/:projectId/flag-sdk-keys`
- `POST /flag-sdk-keys/:keyId/rotate`
- `DELETE /flag-sdk-keys/:keyId`

#### Auth Management

- `GET /projects/:projectId/auth/config`
- `PUT /projects/:projectId/auth/config`
- `GET /projects/:projectId/auth/providers`
- `POST /projects/:projectId/auth/providers`
- `PATCH /auth/providers/:providerId`
- `POST /auth/providers/:providerId/rotate-secret`
- `GET /projects/:projectId/auth/clients`
- `POST /projects/:projectId/auth/clients`
- `PATCH /auth/clients/:clientId`
- `DELETE /auth/clients/:clientId`

### Runtime API

#### Feature Flags Runtime

- `POST /runtime/flags/evaluate`
- `POST /runtime/flags/evaluate/batch`

#### Auth Runtime

- `POST /runtime/auth/signup`
- `POST /runtime/auth/login`
- `POST /runtime/auth/logout`
- `POST /runtime/auth/token/refresh`
- `POST /runtime/auth/password/forgot`
- `POST /runtime/auth/password/reset`
- `POST /runtime/auth/email/verify/request`
- `POST /runtime/auth/email/verify/confirm`
- `GET /runtime/auth/oauth/:provider/start`
- `GET /runtime/auth/oauth/:provider/callback`
- `GET /runtime/auth/jwks`
- `GET /runtime/auth/me`

## Delivery Backlog (Week-by-Week)

### Week 1

- `ARCH-001` Route modularization scaffold: move monolith from `apps/server/src/app.ts` into module routers.
- `ARCH-002` Shared auth/guard/error middleware extraction.
- `ARCH-003` Shared DTO/query key prep in `packages/shared`.

### Week 2

- `TEN-001` Org schema + org membership APIs.
- `TEN-002` Project-to-organization binding.
- `TEN-003` Project modules toggle model and UI gates.

### Week 3

- `FF-001` Flags schema migration and Prisma model wiring.
- `FF-002` Flags management CRUD (flags + environment configs).
- `FF-003` Audit event coverage for flags.

### Week 4

- `FF-004` Evaluation engine (boolean + JSON).
- `FF-005` Environment configuration support.
- `FF-006` Reuse approval workflows for flag writes where needed.

### Week 5

- `FF-007` SDK key create/rotate/revoke.
- `FF-008` Runtime evaluate and evaluate/batch endpoints.
- `FF-009` Rate limiting, caching, and perf validation.

### Week 6

- `WEB-FF-001` Flags list/detail/editor pages.
- `WEB-FF-002` Boolean/JSON value editor UX.
- `WEB-FF-003` SDK key management UI.

### Week 7

- `SDK-FF-001` JS/TS runtime consumer SDK.
- `QA-FF-001` Feature flags E2E/integration suite.
- `REL-FF-001` Phase 1 release docs and readiness checklist.

### Week 8

- `AUTH-001` Auth core schema and services.
- `AUTH-002` Local identity and password services.
- `AUTH-003` Project-scoped auth guards.

### Week 9

- `AUTH-004` Signup/login/logout + refresh flow.
- `AUTH-005` JWT signing and JWKS endpoint.
- `AUTH-006` Password reset and email verification token flows.

### Week 10

- `AUTH-007` Email provider adapter + Resend implementation.
- `AUTH-008` Auth clients and runtime credential model.
- `AUTH-009` Runtime auth hardening (rate limits, abuse protections).

### Week 11

- `AUTH-SOC-001` Google OAuth provider flow.
- `AUTH-SOC-002` GitHub OAuth provider flow.
- `AUTH-SOC-003` Callback/account-linking and conflict rules.

### Week 12

- `WEB-AUTH-001` Auth settings UI.
- `WEB-AUTH-002` Provider config and policy UI.
- `WEB-AUTH-003` Key/secret rotation controls and audit visibility.

### Week 13

- `AUTH-APPROVAL-001` Approval gates for auth config changes.
- `AUTH-AUDIT-001` Full audit event coverage for auth actions.
- `SEC-001` Security pass (tokens, secrets, endpoint abuse tests).

### Week 14

- `QA-AUTH-001` Cross-module E2E tests (Secrets + Flags + Auth).
- `DOC-001` Integration docs for web/API launch scope.
- `REL-AUTH-001` Phase 2 launch checklist and rollback runbook.

## Must-Have Acceptance Gates

### Phase 1 (Feature Flags)

- Portal can create/update/delete boolean and JSON flags.
- Consumer apps can evaluate flags via runtime API (server and client usage).
- JSON value evaluation behavior is stable.
- Environment configuration works.
- Approval + audit coverage exists for all write operations.

### Phase 2 (Auth)

- Native auth works end-to-end for email/password + Google/GitHub.
- Access + refresh token flows are operational.
- Public key discovery (`JWKS`) is available for JWT verification.
- Auth settings are manageable in the admin portal.
- Resend-based verification/reset flows are operational.
- Approval + audit coverage exists for auth configuration writes.

## Default Operational Choices (Can Be Revised)

- Runtime performance target for flags: `p95 < 120ms` in single region.
- Access token TTL: `15 minutes`.
- Refresh token TTL: `30 days`.
- End-user email uniqueness: project-scoped (not global).
- Module defaults: enabled for new projects, manually enabled for existing projects.

## Deferred Items (Explicitly Out of Initial Scope)

- Feature flag segments
- Scheduled flag windows
- Flag dependencies/prerequisites
- Flag exposure analytics and experimentation
- Full OIDC compliance
- Magic link login
- MFA
- Enterprise SSO/SAML
- Custom auth domains
- Billing/pricing enforcement
- Data residency controls
