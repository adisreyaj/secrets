# Phase 1 Feature Flags Release Readiness

Date: 2026-02-10  
Owner: Product + Platform  
Release scope: Week 3 to Week 7 milestones from `super-app-execution-plan.md`

## Scope Summary

Phase 1 adds customer-facing feature flags to the existing project model:

- Management API for flags, variants, rules, overrides, and SDK keys.
- Runtime API for single and batch evaluation.
- Admin portal pages for flag management and SDK key lifecycle.
- JS/TS runtime consumer SDK support in `@secrets/sdk`.
- Audit + approval coverage for flag write paths.

Deferred items remain out of scope for this release:

- Segments, scheduling windows, dependencies, and analytics/experimentation.

## API Contract Summary

### Management API

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

### Runtime API

- `POST /runtime/flags/evaluate`
- `POST /runtime/flags/evaluate/batch`

Runtime authentication supports either:

- `Authorization: Bearer <sdk-key>`
- `x-flag-sdk-key: <sdk-key>`

## SDK Consumer Contract (`@secrets/sdk`)

Feature flags runtime client methods:

- `createFeatureFlagRuntimeClient({ baseUrl, sdkKey })`
- `client.evaluate({ environmentId, flagKey, subjectKey })`
- `client.evaluateBatch({ environmentId, subjectKey, flagKeys? })`
- `client.isEnabled({ environmentId, flagKey, subjectKey })`
- `client.getVariant({ environmentId, flagKey, subjectKey })`

Reference example:

```ts
import { createFeatureFlagRuntimeClient } from '@secrets/sdk'

const flags = createFeatureFlagRuntimeClient({
  baseUrl: 'http://localhost:3001',
  sdkKey: process.env.SECRETS_FLAG_SDK_KEY!,
})

const result = await flags.evaluate({
  environmentId: 'env_123',
  flagKey: 'checkout-redesign',
  subjectKey: 'user_42',
})
```

## Operational Expectations

Runtime target:

- `p95 < 120ms` in single-region deployment.

Guardrails implemented:

- Runtime endpoint rate limits (`/evaluate` and `/evaluate/batch`).
- In-process runtime catalog caching for low-latency repeated reads.
- Slow request logging (`flag.runtime.slow`, `flag.runtime.batch.slow`) when over target.
- SDK key rotation and revocation lifecycle.

## Monitoring and Alerts Checklist

Minimum production alerts before launch:

- Alert on sustained `5xx` rate for `/runtime/flags/*`.
- Alert on `401` spikes for runtime endpoints (expired/revoked SDK key patterns).
- Alert on `flag.runtime.slow` log volume increase and p95 regressions above 120ms.
- Alert on management write failures (`POST/PATCH/DELETE/PUT` flags endpoints).

Dashboards:

- Runtime request volume, latency, and non-2xx by endpoint.
- SDK key usage (`lastUsedAt`) and stale/unused key tracking.
- Approval queue depth and completion time for flag override writes.

## Rollback Runbook (Phase 1)

If release quality regresses:

1. Disable Feature Flags module for impacted projects using project module toggles.
2. Revoke compromised or noisy SDK keys from management API/UI.
3. Roll back web deployment if UI regression is isolated to portal.
4. Roll back server deployment if runtime or management API regression is confirmed.
5. Validate:
   - Existing Secrets module remains healthy.
   - Runtime error rate and p95 return to baseline.

## Readiness Checklist

- [x] Flag schema and migrations applied.
- [x] Management APIs implemented for flags, variants, rules, overrides, and SDK keys.
- [x] Runtime evaluate and evaluate/batch endpoints live.
- [x] Deterministic evaluation engine validated with tests.
- [x] Runtime caching and rate limiting implemented.
- [x] Portal UI supports flag CRUD, rules/variants UX, and SDK key lifecycle.
- [x] SDK runtime consumer client documented and shipped in `@secrets/sdk`.
- [x] Audit coverage exists for flag writes.
- [x] Approval reuse implemented for flag override writes.
- [ ] Production monitoring and alert rules configured in deployed environment.
- [ ] Stakeholder sign-off captured (Product, Platform, Support).

## Sign-off

- Product: Pending
- Platform: Pending
- Support: Pending
