# Web/API Integration Guide (Secrets + Flags + Auth)

Date: 2026-02-11  
Scope: Launch-ready integration contracts for the web portal and management/runtime APIs.

## Architecture Model

- `Project` is the tenant application boundary.
- Modules are project-scoped:
  - `secrets`
  - `flags`
  - `auth`
- API split:
  - Management API: operator/admin workflows from the portal.
  - Runtime API: app-consumed endpoints for auth and flag evaluation.

## Module Overview

### Secrets

- Purpose: secure environment-scoped key/value management.
- Primary management endpoints:
  - `GET /environments/:id/secrets`
  - `POST /environments/:id/secrets`
  - `PATCH /secrets/:id`
  - `DELETE /secrets/:id`
  - `POST /secrets/:id/copy`

### Flags

- Purpose: runtime feature delivery (boolean and multivariate).
- Primary management endpoints:
  - `GET /projects/:projectId/flags`
  - `POST /projects/:projectId/flags`
  - `POST /flags/:flagId/rules`
  - `POST /projects/:projectId/flag-sdk-keys`
- Primary runtime endpoints:
  - `POST /runtime/flags/evaluate`
  - `POST /runtime/flags/evaluate/batch`

### Auth

- Purpose: native auth management and runtime identity/token flows.
- Primary management endpoints:
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
- Primary runtime endpoints:
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

## Cross-Module Integration Patterns

1. Portal operator flow:
   - Configure auth settings/providers.
   - Manage runtime flags and SDK keys.
   - Maintain environment secrets.
2. Runtime app flow:
   - End user authenticates via auth runtime endpoints.
   - App evaluates runtime flags with SDK key.
   - App consumes secrets through service-side integration.

## Approval and Audit Model

- Approval rules can gate sensitive write operations (including auth config writes).
- Auth approval requests persist sensitive provider secrets in encrypted approval payload fields.
- Audit events are module-tagged (`metadata_json.module`) for filtering:
  - `module = "secrets"`
  - `module = "flags"`
  - `module = "auth"`

## Web UI Surfaces

- Auth settings page:
  - core config
  - provider config
  - key/secret rotation controls
  - auth-focused audit visibility
- Flags page:
  - flag CRUD
  - variants/rules
  - SDK key controls
- Secrets pages:
  - environments
  - secret CRUD and copy workflows

## Example Requests

### Auth config update (management)

```http
PUT /projects/project_1/auth/config
Content-Type: application/json
Authorization: Bearer <mgmt-token>

{
  "nativeAuthEnabled": true,
  "emailPasswordEnabled": true,
  "accessTokenTtlMinutes": 15,
  "refreshTokenTtlDays": 30
}
```

### Runtime flag evaluation

```http
POST /runtime/flags/evaluate
Authorization: Bearer <flag-sdk-key>
Content-Type: application/json

{
  "environmentId": "env_1",
  "flagKey": "checkout-redesign",
  "subjectKey": "user_123"
}
```

### Runtime auth login

```http
POST /runtime/auth/login
Content-Type: application/json

{
  "projectId": "project_1",
  "email": "user@example.com",
  "password": "StrongPass123!"
}
```

## Related Docs

- `docs/releases/phase1-feature-flags-readiness.md`
- `docs/security/auth-security-pass.md`
- `docs/testing/cross-module-e2e.md`

## Review Sign-Off

- Engineering reviewer: _Pending update in ticket `SRE-45` comments._
- Non-engineering reviewer: _Pending update in ticket `SRE-45` comments._
