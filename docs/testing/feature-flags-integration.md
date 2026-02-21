# Feature Flags Test Guide

This guide covers where and how to add tests for feature flags.

## Run the suite

From repo root:

```bash
pnpm --filter server test
```

## Current integration coverage

`apps/server/test/flags.integration.test.ts` covers:

- Management create flow seeds config across all existing environments.
- Matrix endpoint returns all environment cells for each flag.
- SDK key creation for runtime auth.
- Runtime evaluation through `@secrets/sdk` runtime client.
- Runtime missing-config behavior is consistent (`reason = flag_not_configured`).
- Batch runtime evaluation response shape.

## Adding new scenarios

When adding cases, prefer extending the same integration flow test file if the setup is shared:

1. Add endpoint-level behavior assertions through `app.inject`.
2. If runtime consumption behavior changes, assert through `createFeatureFlagRuntimeClient`.
3. Keep deterministic inputs (`subjectKey`, variant keys) to avoid flaky expectations.
4. Add regression checks for:
   - Authorization failures (`401/403`)
   - Invalid payloads (`400`)
   - Not found behavior (`404`)
   - Environment coverage behavior after creating environments

If a scenario is purely algorithmic (no HTTP), add it under evaluation unit tests in `apps/server/test/flags.evaluation.test.ts`.
