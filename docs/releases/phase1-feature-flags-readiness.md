# Phase 1 Feature Flags Release Readiness

Date: 2026-02-11  
Owner: Product + Platform

## Scope Summary

Phase 1 delivers customer-facing feature flags with environment-first configuration:

- Management API for flag CRUD, matrix comparison, and SDK keys.
- Runtime API for single and batch evaluation.
- Admin portal pages for flag management, matrix compare, and SDK key lifecycle.
- JS/TS runtime consumer SDK support in `@secrets/sdk`.
- Audit coverage for flag write paths.

Deferred items remain out of scope:

- Segment targeting, rollout rules, scheduling windows, and experimentation analytics.

## Terminology

- `Expose/Hide`: controls whether a flag is exposed to consumers in an environment.
- `Enabled/Disabled`: BOOLEAN flag value when exposed.
- JSON mode returns `jsonValue` when exposed.

## API Contract Summary

### Management API

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
- Alert on management write failures for flags and SDK keys.

## Readiness Checklist

- [x] Flag schema and migrations applied.
- [x] Management APIs implemented for flag CRUD, matrix, and SDK keys.
- [x] Runtime evaluate and evaluate/batch endpoints live.
- [x] Deterministic evaluation engine validated with tests.
- [x] Runtime caching and rate limiting implemented.
- [x] Portal UI supports flag CRUD, matrix compare, and SDK key lifecycle.
- [x] SDK runtime consumer client documented and shipped in `@secrets/sdk`.
- [x] Audit coverage exists for flag writes.
- [ ] Production monitoring and alert rules configured in deployed environment.
- [ ] Stakeholder sign-off captured (Product, Platform, Support).

## Sign-off

- Product: Pending
- Platform: Pending
- Support: Pending
