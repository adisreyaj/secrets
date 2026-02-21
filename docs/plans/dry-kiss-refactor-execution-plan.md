# DRY/KISS Refactor Execution Plan with Linear Phase Tickets

Date: 2026-02-11
Project: Super App: Secrets + Flags + Auth

## Summary

Create a new Linear parent issue for DRY/KISS improvements, create 4 phase child issues, then implement Phase 1 first (server quick wins) with commit-per-task and status updates.

## Public API / Interface Impact

- No intended public contract changes:
  - Server HTTP paths/response shapes remain unchanged.
  - Web API client public usage (`api` facade) remains backward compatible.
  - CLI command surface and exit codes remain unchanged.
- Internal refactor targets:
  - Shared server helpers for duplicate logic.
  - Route/app decomposition for readability and cohesion.
  - Web mutation/query orchestration extraction into reusable helpers/hooks.
- If an API-affecting change becomes unavoidable, split it into a separate explicit ticket.

## Linear Ticket Plan

Create in team `Sreyaj`, project `Super App: Secrets + Flags + Auth`.

1. Parent issue:
   - Title: `ARCH-DRY-001 DRY/KISS refactor wave (server + web + cli)`
   - Description:
     - Goal: reduce duplication and simplify high-complexity modules.
     - Scope hotspots:
       - `apps/server/src/app.ts`
       - `apps/web/src/lib/api.ts`
       - `apps/web/src/pages/AuthSettingsPage.tsx`
       - `apps/web/src/pages/FlagsPage.tsx`
     - Definition of Done: all 4 phase children complete with no regressions.

2. Child phase issues (under parent):
   - `ARCH-DRY-001.1 Server DRY quick wins`
   - `ARCH-DRY-001.2 Server route decomposition (app.ts split)`
   - `ARCH-DRY-001.3 Web API + page orchestration consolidation`
   - `ARCH-DRY-001.4 CLI/internal consistency cleanup`

3. Status policy per issue:
   - `Todo -> In Progress -> Done`
   - Completion comment includes:
     - summary
     - files changed
     - commit hash
     - validation result

## Implementation Plan (Kickoff = Phase 1)

### Phase 1: Server DRY quick wins

- Consolidate duplicate helpers:
  - `isPrismaUniqueError`
  - `normalizeIdentifier`
- Replace ad-hoc `reply.code(...).send({ error })` with shared reply/error helpers where behavior is identical:
  - `apps/server/src/server/http/replies.ts`
  - `apps/server/src/server/http/errors.ts`
- Likely touched files:
  - `apps/server/src/app.ts`
  - `apps/server/src/server/routes/flags.ts`
  - `apps/server/src/server/routes/organizations.ts`
  - `apps/server/src/server/routes/runtimeAuth.ts`

### Phase 2: Server decomposition

- Reduce `apps/server/src/app.ts` to composition root.
- Move grouped route handlers into domain route modules while preserving path/behavior.

### Phase 3: Web DRY/KISS

- Decompose `apps/web/src/lib/api.ts` into domain clients behind a compatibility facade.
- Extract repeated mutation/invalidation patterns from large pages into shared hooks/helpers.

### Phase 4: CLI consistency

- Unify duplicate request/response parsing logic in:
  - `packages/cli/src/clients/api.ts`
- Keep command UX unchanged.

## Test Cases and Validation Scenarios

1. Server:
   - Run server tests and verify no status/message regressions in auth/flags/secrets/approvals routes.
2. Web:
   - Run web tests for page data loading, mutation feedback, and cache invalidation behavior.
3. CLI:
   - Run CLI tests to confirm error mapping and output parity.
4. Smoke checks:
   - Auth settings updates, flags CRUD/rules/sdk keys, secret CRUD/copy/rollback paths.

## Commit and Progress Rules

1. One commit per completed task unit.
2. Commit message format: `refactor: <issue-key> <short action>` (1-2 lines).
3. Linear update after each completed task:
   - move status
   - add completion comment with hash and validation

## Assumptions and Defaults

1. Ticket strategy: new DRY/KISS parent plus 4 phase children.
2. Kickoff phase: Phase 1 server quick wins.
3. Existing unrelated files remain untouched during this effort.
