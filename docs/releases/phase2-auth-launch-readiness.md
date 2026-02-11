# Phase 2 Auth Launch Checklist and Rollback Runbook

Date: 2026-02-11  
Scope: Native Auth launch (email/password + Google/GitHub, management + runtime APIs).

## Execution Tracking

- Execution parent: `SRE-52` (`REL-AUTH-OPS-000`)
- Execution subtasks:
  - `SRE-53` infra/config verification evidence
  - `SRE-54` release-branch test/build verification evidence
  - `SRE-55` management workflow launch validation
  - `SRE-56` runtime workflow launch validation
  - `SRE-57` observability and alert readiness verification
  - `SRE-58` pilot smoke test and cohort enablement gate
  - `SRE-59` rollback drill and comms protocol verification
  - `SRE-60` sign-off capture and readiness doc finalization
- Detailed evidence log: `docs/releases/phase2-auth-verification-log.md`

## Pre-Launch Checklist

- [ ] Confirm migrations are applied in target environment:
  - `auth_project_config`
  - `auth_end_users`
  - `auth_identities`
  - `auth_sessions`
  - `auth_refresh_tokens`
  - `auth_signing_keys`
  - `auth_password_reset_tokens`
  - `auth_email_verification_tokens`
  - `auth_clients`
  - `auth_provider_configs`
- [ ] Confirm required env/config values are present:
  - auth runtime base URL
  - OAuth callback-compatible base URL
  - email provider settings
  - auth abuse protection limits
- [ ] Verify project module toggles for pilot projects (`auth` enabled).
- [ ] Verify provider credentials are configured per pilot project.
- [ ] Verify auth approval rules for gated changes are configured as required.
- [ ] Verify audit retention policy and auth audit filtering.
- [x] Run server test suite in release branch:
  - `pnpm -C apps/server test`
- [x] Run web build/test in release branch:
  - `pnpm -C apps/web test --run`
  - `pnpm -C apps/web build`
- Test/build evidence captured in `docs/releases/phase2-auth-verification-log.md` (`SRE-54`).

## Launch Checklist

1. Deploy API and web artifacts to production.
2. Enable Auth module for approved project cohort.
3. Validate management workflows:
   - auth config read/write
   - provider CRUD/rotation
   - client CRUD/rotation
   - Evidence logged in `docs/releases/phase2-auth-verification-log.md` (`SRE-55`)
4. Validate runtime workflows:
   - signup/login/logout/refresh
   - password reset and email verification
   - OAuth start/callback
   - JWKS fetch
   - Evidence logged in `docs/releases/phase2-auth-verification-log.md` (`SRE-56`)
5. Validate observability:
   - auth runtime error rate
   - auth route latency
   - auth audit events emitted and queryable
   - Evidence logged in `docs/releases/phase2-auth-verification-log.md` (`SRE-57`)
6. Execute smoke tests on one pilot project before full cohort enablement.
   - Pilot sequence and go/no-go gate in `docs/releases/phase2-auth-verification-log.md` (`SRE-58`)

## Post-Launch Verification

- [ ] No sustained 5xx spikes on `/runtime/auth/*` and `/projects/:id/auth/*`.
- [ ] Login lockout protections trigger as expected under repeated bad credentials.
- [ ] Approval-gated auth writes behave as expected.
- [ ] No plaintext provider secrets appear in approvals metadata.
- [ ] Support/on-call runbook links shared with operations.

## Rollback Triggers

- Sustained auth runtime 5xx above agreed threshold.
- Token verification/JWKS failure impacting client traffic.
- Provider callback failures across cohort.
- Security issue involving auth secrets/tokens.

## Rollback Procedure

1. Disable Auth module for affected projects (module toggle).
2. Revert web auth management surface exposure if needed.
3. Roll back server deployment to prior known-good release.
4. Invalidate newly issued auth sessions if compromise is suspected.
5. Revoke/rotate provider secrets and auth client secrets as needed.
6. Preserve audit logs and incident artifacts for investigation.

## Dependencies and Data Implications

- Auth data is persisted in project-scoped auth tables and should not be dropped during rollback.
- Session/token data created during incident window may need revocation.
- Approval requests and audit logs remain authoritative evidence and must be retained.

## Communication Plan

1. Notify stakeholders of rollback start with impact scope.
2. Provide 15-minute updates until mitigation complete.
3. Publish incident summary with root cause and corrective actions.

## Sign-Off

- Engineering lead: _Pending update in ticket `SRE-46` comments._
- Product/Operations: _Pending update in ticket `SRE-46` comments._
