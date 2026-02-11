# Auth Security Pass (SEC-001)

Date: 2026-02-11  
Scope: Tokens, secrets handling, and runtime/management auth endpoint abuse scenarios.

## Findings

1. **Sensitive provider secrets in approval metadata (fixed)**
- Risk: OAuth provider client secrets were included in `approval_requests.metadata_json` for approval-gated auth config updates.
- Fix:
  - Moved provider secrets into encrypted approval payload fields (`payload_ciphertext`, `payload_iv`, `payload_tag`, `payload_key_version`).
  - Removed plaintext secret fields from approval metadata.
  - Updated approval apply path to read encrypted payload for provider upsert and secret rotation.

2. **Runtime auth abuse/audit signal gaps (fixed)**
- Risk: Critical auth runtime actions lacked consistent audit events for incident triage and abuse forensics.
- Fix:
  - Added audit events for signup, login (success/failure/locked), logout, token refresh, password reset flows, email verification flows, and OAuth start/login.
  - All new events include `metadata_json.module = "auth"` for filtering.

## Regression Coverage

- `apps/server/test/auth.approvals.routes.test.ts`
  - Verifies auth config approval queue/apply behavior.
  - Verifies provider secrets are persisted in encrypted payload fields and not in metadata.
- `apps/server/test/runtime-auth.routes.test.ts`
  - Verifies auth audit events are emitted across runtime auth flows.

## Operational Notes

- Auth approval rules are currently matched against global (`environment_id = null`) rules and materialized into a project environment context for compatibility with existing approval schema.
- Stakeholder sign-off record should be tracked in Linear issue `SRE-42` comments after review.
