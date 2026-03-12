# DB Normalization Roadmap (Phase 2+)

This document stages deeper normalization work after the Phase 1 index optimization pass.
Phase 2 items are intentionally deferred to avoid contract-breaking changes in the current release.

## Goals

- Reduce JSON-heavy persistence where relational modeling is a better fit.
- Improve queryability and index precision for rule/action and auth configuration lookups.
- Preserve API response shape where feasible; isolate breaking changes behind explicit migrations.

## Proposed Workstreams

### 1) Approval Rule Actions Normalization

- Current: `approval_rules.actions_json` (`Json`)
- Proposed table: `approval_rule_actions`
  - `id` (optional surrogate) or composite key
  - `rule_id` (FK -> `approval_rules.id`)
  - `action` (`ApprovalAction`)
- Indexes:
  - unique `(rule_id, action)`
  - lookup index for `(action)` and/or `(rule_id, action)`

### 2) Auth Client Redirect URIs Normalization

- Current: `auth_clients.redirect_uris_json` (`Json?`)
- Proposed table: `auth_client_redirect_uris`
  - `id` (optional)
  - `client_id` (FK -> `auth_clients.id`)
  - `uri` (string)
  - `sort_order` (int)
- Indexes:
  - unique `(client_id, uri)`
  - `(client_id, sort_order)`

### 3) Auth Provider Scopes Normalization

- Current: `auth_provider_configs.scopes_json` (`Json?`)
- Proposed table: `auth_provider_scopes`
  - `id` (optional)
  - `provider_config_id` (FK -> `auth_provider_configs.id`)
  - `scope` (string)
  - `sort_order` (int)
- Indexes:
  - unique `(provider_config_id, scope)`
  - `(provider_config_id, sort_order)`

### 4) Feature Flag Labels Normalization (Optional)

- Current: `feature_flag_environment_configs.labels_json`
- Proposed:
  - `feature_flag_labels` (dictionary)
  - `feature_flag_environment_config_labels` (join table)
- Do only if filtering/reporting by label needs to scale beyond JSON containment checks.

### 5) Membership Model Normalization Decision

- Evaluate moving from surrogate-id membership rows:
  - `project_members`
  - `organization_members`
- Toward composite primary keys:
  - `(project_id, user_id)`
  - `(organization_id, user_id)`
- This may require DTO/API contract updates where `id` is currently returned.

## Migration Strategy (Future)

1. Add new relational tables alongside existing JSON columns.
2. Backfill relational tables from JSON data.
3. Dual-write in server routes/services for one release window.
4. Read switch-over to relational tables.
5. Remove old JSON columns in a final cleanup migration.

## Non-goals for the Current Phase

- No API/DTO contract breaks.
- No changes to auth/flags/secrets runtime behavior.
- No soft-delete behavior changes.
