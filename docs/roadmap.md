# Phase/Infisical/Envie Parity Roadmap

This document turns the product plan into an implementation-ready roadmap with a
feature matrix, phases, APIs, data model deltas, and acceptance tests.

## Scope and Assumptions

- Target audience: dev teams/SMBs
- Deployment: SaaS-first while preserving a clear self-host path
- Delivery horizon: 3–6 months

## Feature Matrix (Source-Based)

Legend: ✅ = present, 🟡 = partial, ⛔ = absent

| Feature Area | Phase | Infisical | Envie | EnvKey | envsecrets/envless | This App (Today) |
| --- | --- | --- | --- | --- | --- | --- |
| CLI-first secret injection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Browser-based CLI login | ✅ | ✅ | 🟡 | ✅ | 🟡 | ⛔ |
| Environment inheritance/branches | 🟡 | ✅ | 🟡 | ✅ | 🟡 | ⛔ |
| Secret versioning + rollback | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ |
| Audit logs | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ |
| Custom roles / granular RBAC | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ⛔ |
| Service accounts | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ⛔ |
| Approval workflows | 🟡 | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Secret syncs/integrations | ✅ | ✅ | 🟡 | 🟡 | ⛔ | ⛔ |
| Rotation & dynamic secrets | 🟡 | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| BYOK / KMS wrapping | 🟡 | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Client-side/zero-knowledge | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ⛔ |

Notes:
- The matrix is directional and used for prioritization, not a claim of strict parity.
- Competitor baselines: phase.dev, infisical.com, envie.cloud, envkey.com.

## Phase 0 (Weeks 0–3): Frictionless Core Parity

Goal: Match day-one DX with minimal setup.

### Features
- CLI login via browser/SSO magic link
- `secrets init` to link repo/project and optionally import `.env`
- Auto-detect `.env` and warn if not in `.gitignore`
- Global secret search + quick filters by environment/app
- Git-style diff view + 1-click rollback
- KV editor with boolean toggles
- Bulk edit/import improvements and CSV export
- Export dry-run mode and warn-on-overwrite
- CLI/SDK error messages with fixes and next steps

### API Additions
- `POST /auth/cli-login` (start browser-based login)
- `POST /auth/cli-login/complete` (poll/complete)
- `GET /secrets/diff?secretId=&from=&to=`

### Data Model Additions
- `cli_login_sessions` (id, user_id, code, expires_at, consumed_at)
- `secret_diffs` (computed on-demand; no persistence required)

### Acceptance Tests
- CLI login flow completes without manual token copy
- `init` links project and imports `.env`
- `.env` detection warns when missing `.gitignore` entry
- Diff view shows only changed keys and supports rollback
- Export dry-run prints destination and summary only

## Phase 1 (Weeks 4–10): Team & Governance Parity

Goal: Team governance with sane defaults.

### Features
- Custom roles with granular permissions by project/environment/folder
- Service accounts as principals with scoped tokens
- IP allow-listing per project/environment
- Approval workflows for sensitive secrets/paths
- Time-limited access tokens
- Audit log filters + retention policy controls
- Environment branching + inheritance
- Folder/namespace hierarchy and tags

### API Additions
- `GET/POST /projects/:id/roles`
- `GET/POST /service-accounts`
- `POST /secrets/approve`
- `POST /tokens` with `expires_at`
- `GET/POST /projects/:id/ip-allowlist`

### Data Model Additions
- `roles`, `role_permissions`
- `service_accounts`, `service_account_tokens`
- `ip_allowlist_entries`
- `approval_requests` (secret_id, requested_by, status, approver_id)
- `folders`, `tags`, `secret_tags`
- `environment_branches` (parent_id, branch_type)

### Acceptance Tests
- Role matrix prevents unauthorized CRUD/approve
- Service account token only accesses assigned scopes
- IP allowlist blocks non-whitelisted addresses
- Approvals required for flagged secrets
- Environment branch inheritance resolves correctly

## Phase 2 (Weeks 11–18): Delivery & Security Automation

Goal: Integrations and automation to reduce secret sprawl.

### Features
- Native syncs: GitHub Actions, Vercel, AWS Secrets Manager, Kubernetes, Terraform
- Sync status dashboard + drift detection
- Scheduled rotation for DB/cloud services
- Dynamic secrets (short-lived credentials broker)
- Webhooks for secret change events
- BYOK / KMS key wrapping
- Optional client-side encryption (zero-knowledge mode)

### API Additions
- `POST /integrations/:provider`
- `GET /sync-jobs/:id/status`
- `POST /secrets/rotate`
- `POST /secrets/dynamic`
- `POST /webhooks`
- `POST /kms/wrap-key`

### Data Model Additions
- `integrations`, `sync_jobs`, `sync_job_events`
- `rotation_policies`, `rotation_events`
- `webhooks`
- `kms_keys` (metadata only)

### Acceptance Tests
- Sync jobs retry and report status accurately
- Drift detection flags mismatched secrets
- Rotation is atomic and auditable
- Webhooks fire with correct payload
- KMS wrapping path is enforced if enabled

## Phase 3 (Weeks 19–24): Enterprise-Grade Controls

Goal: Advanced compliance and policy controls.

### Features
- SSO/SAML + SCIM
- Compliance exports (SOC2-friendly audit packages)
- Policy-as-code rules for changes
- Admin dashboards + usage metrics + health checks

### API Additions
- `POST /sso/saml`
- `POST /scim/*`
- `GET /compliance/exports`
- `POST /policies`
- `GET /admin/metrics`

### Data Model Additions
- `sso_connections`, `scim_provisioning`
- `policies`
- `compliance_exports`

### Acceptance Tests
- SSO login and SCIM provisioning work end-to-end
- Policy rules block non-compliant changes
- Compliance exports include required audit data

## Low-Friction Design Principles

- `SECRETS_TOKEN` + `secrets run` remains the primary path
- Advanced features default to safe, zero-config behavior
- CLI never requires config when env vars exist
- SaaS-first UX: auto-project creation, default envs, guided import

