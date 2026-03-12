# Task Plan

- [x] Inspect current feature-flag update flow (API + UI) for valueType changes during edit.
- [x] Add API validation to reject valueType transitions between BOOLEAN and JSON on edit/update.
- [x] Update UI edit flow to prevent selecting/changing valueType for existing flags.
- [x] Add or update tests covering forbidden type change attempts.
- [x] Run targeted tests and verify no regressions.
