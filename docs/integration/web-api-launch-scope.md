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

### Flags

- Purpose: runtime feature delivery (boolean and JSON).
- Management API endpoints:
  - `GET /projects/:projectId/flags?environmentId=...`
  - `GET /projects/:projectId/flags/matrix`
  - `POST /projects/:projectId/flags`
  - `GET /flags/:flagId?environmentId=...`
  - `GET /flags/:flagId?includeAllEnvironments=true`
  - `PATCH /flags/:flagId`
  - `DELETE /flags/:flagId`
  - `GET /projects/:projectId/flag-sdk-keys`
  - `POST /projects/:projectId/flag-sdk-keys`
  - `POST /flag-sdk-keys/:keyId/rotate`
  - `DELETE /flag-sdk-keys/:keyId`
- Runtime API endpoints:
  - `POST /runtime/flags/evaluate`
  - `POST /runtime/flags/evaluate/batch`

Terminology in flags:

- `Expose/Hide` controls delivery visibility.
- `Enabled/Disabled` controls BOOLEAN value.
- JSON flags return `jsonValue` at runtime when exposed.

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

## Web UI Surfaces

- Flags Management (`/projects/:projectId/flags*`) owns:
  - flag CRUD
  - all-environment matrix compare
  - SDK key issue/rotate/revoke
  - flag-focused audit filtering (`metadata_json.module = "flags"`)
- Auth Settings (`/projects/:projectId/auth/*`) and Secrets (`/environments/:id/secrets*`) remain unchanged in ownership boundaries.

## Example Requests

### Flag create with all-environment defaults

```http
POST /projects/project_1/flags
Content-Type: application/json
Authorization: Bearer <mgmt-token>

{
  "key": "checkout-redesign",
  "name": "Checkout redesign",
  "valueType": "BOOLEAN",
  "exposed": true,
  "booleanValue": true,
  "runtime": "both",
  "labels": ["checkout", "beta"]
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

## Related Docs

- `docs/releases/phase1-feature-flags-readiness.md`
- `docs/testing/feature-flags-integration.md`
- `docs/testing/cross-module-e2e.md`
