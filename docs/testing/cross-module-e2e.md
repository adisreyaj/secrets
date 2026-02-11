# Cross-Module E2E Suite (QA-AUTH-001)

This suite validates representative end-to-end interactions across:

- Auth management (`/projects/:projectId/auth/config`)
- Secrets module access (`/environments/:id/secrets`)
- Flags management/runtime (`/projects/:projectId/flags`, `/projects/:projectId/flag-sdk-keys`, `/runtime/flags/evaluate`)

## Test File

- `apps/server/test/cross-module.e2e.test.ts`

## Run Locally

```bash
pnpm -C apps/server test
```

To run only the cross-module test:

```bash
pnpm -C apps/server test -- test/cross-module.e2e.test.ts
```

## How To Extend

1. Add new state fixtures for the additional module entities in `state`.
2. Extend the mocked Prisma model methods used by the new endpoints.
3. Add one scenario at a time, keeping assertions focused on module boundaries:
   - auth config or runtime auth behavior
   - secrets read/write behavior
   - flags management/runtime evaluation behavior
4. Keep scenarios deterministic:
   - avoid time-sensitive assertions unless strictly needed
   - assert response shapes and critical status transitions

## CI Behavior

The suite runs under the same `pnpm -C apps/server test` command used in CI.
