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

## Module Contract Matrix

### Secrets

- Purpose: secure environment-scoped key/value management.
- Management API endpoints:
  - `GET /environments/:id/secrets`
  - `POST /environments/:id/secrets`
  - `PATCH /secrets/:id`
  - `DELETE /secrets/:id`
  - `POST /secrets/:id/copy`
- Runtime API endpoints:
  - Not exposed directly for client-side runtime usage.
  - Secrets are consumed through trusted service-side integrations.

### Flags

- Purpose: runtime feature delivery (boolean and multivariate).
- Management API endpoints:
  - `GET /projects/:projectId/flags`
  - `POST /projects/:projectId/flags`
  - `GET /flags/:flagId`
  - `PATCH /flags/:flagId`
  - `DELETE /flags/:flagId`
  - `POST /flags/:flagId/variants`
  - `GET /flags/:flagId/variants`
  - `PATCH /flag-variants/:variantId`
  - `DELETE /flag-variants/:variantId`
  - `POST /flags/:flagId/rules`
  - `GET /flags/:flagId/rules`
  - `PATCH /flag-rules/:ruleId`
  - `DELETE /flag-rules/:ruleId`
  - `PUT /flags/:flagId/environments/:environmentId/override`
  - `GET /projects/:projectId/flag-sdk-keys`
  - `POST /projects/:projectId/flag-sdk-keys`
  - `POST /flag-sdk-keys/:keyId/rotate`
  - `DELETE /flag-sdk-keys/:keyId`
- Runtime API endpoints:
  - `POST /runtime/flags/evaluate`
  - `POST /runtime/flags/evaluate/batch`

### Auth

- Purpose: native auth management and runtime identity/token flows.
- Management API endpoints:
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
- Runtime API endpoints:
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
   - Configure auth core settings (`/projects/:projectId/auth/config`) and provider/client credentials.
   - Manage flags, variants, rules, and environment overrides.
   - Issue and rotate runtime flag SDK keys.
   - Maintain environment-scoped secrets and secret copy workflows.
2. Runtime app flow:
   - End user authenticates via runtime auth endpoints and receives access/refresh tokens.
   - App/server evaluates flags through runtime endpoints using SDK key auth.
   - Trusted backend services fetch/use secrets for downstream integrations.
3. Runtime identity + config dependency flow:
   - Auth runtime identity establishes subject context (`subjectKey`) for flag evaluation.
   - Flag results drive runtime behavior while secrets remain server-side only.
   - Audit and approval controls remain management-plane concerns.

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

Equivalent auth header:

```http
x-flag-sdk-key: <flag-sdk-key>
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

Expected success shape (representative):

```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  },
  "accessToken": "<jwt-access-token>",
  "refreshToken": "<opaque-or-jwt-refresh-token>"
}
```

## Related Docs

- `docs/releases/phase1-feature-flags-readiness.md`
- `docs/security/auth-security-pass.md`
- `docs/testing/cross-module-e2e.md`

## Review Sign-Off

- Engineering reviewer: _Pending update in ticket `SRE-45` comments._
- Non-engineering reviewer: _Pending update in ticket `SRE-45` comments._
