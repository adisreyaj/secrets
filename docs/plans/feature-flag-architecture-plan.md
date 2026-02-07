# Feature Flag Architecture (React UI, Provider-Agnostic)

## Summary
Introduce a small, provider‑agnostic feature flag layer in `apps/web` that exposes a stable app API (`FeatureFlagProvider`, `useFeatureFlag`, `useFeatureFlags`, `useFlagEnabled`) and hides vendor details behind adapters. Implement a PostHog adapter first, wired with build‑time env configuration and an “anonymous then identify” identity strategy. UI gating is the only required use case for now.

## Goals & Success Criteria
- The UI can gate components/routes by flags without referencing PostHog directly.
- Swapping providers requires only a new adapter and a config change.
- Flags resolve client‑side only.
- Identity starts anonymous and switches to authenticated user when available.
- Configuration is build‑time env vars (Vite).

## In Scope
- New feature flag module with interfaces + PostHog adapter.
- App wiring in `apps/web/src/main.tsx` and auth integration.
- Clear fallback defaults for unknown flags.
- Minimal tests around adapter and hooks (if test harness exists in repo).

## Out of Scope
- Server‑side flag evaluation.
- Experiments / A/B tracking.
- Backend flag consistency.

## Architecture

### Public App API (Provider-Agnostic)
Create `apps/web/src/lib/feature-flags` with:

**Types**
- `FeatureFlagValue = boolean | string | number | null`
- `FeatureFlagProviderAdapter` interface:
  - `init(options): Promise<void> | void`
  - `identify(user): void`
  - `reset(): void`
  - `getFlag(key, defaultValue?): FeatureFlagValue`
  - `onFlagsChanged?(callback): () => void`
- `FeatureFlagConfig`:
  - `provider: 'posthog' | 'none' | string`
  - `posthogKey?: string`
  - `posthogHost?: string`
  - `debug?: boolean`

**React Layer**
- `FeatureFlagProvider` (context):
  - Creates adapter, initializes it once.
  - Manages a lightweight `version` state bump on flag change to re-render hooks.
- Hooks:
  - `useFeatureFlag<T>(key: string, defaultValue: T): T`
  - `useFlagEnabled(key: string, defaultValue = false): boolean`
  - `useFeatureFlags(keys: string[], defaults?: Record<string, FeatureFlagValue>)`

### Provider Selection
- `getFeatureFlagAdapter(config): FeatureFlagProviderAdapter`
- Default to `noop` adapter if config is missing or provider is `none`.

### PostHog Adapter (initial)
- Uses `posthog-js` and `posthog-js/react` if needed for convenience.
- Implements:
  - `init({ posthogKey, posthogHost, debug })` -> `posthog.init(...)`
  - `identify(user)` -> `posthog.identify(user.id, { email, name })`
  - `reset()` -> `posthog.reset()`
  - `getFlag(key, default)` -> `posthog.getFeatureFlag(key) ?? default`
  - `onFlagsChanged` -> `posthog.onFeatureFlags(callback)` to re-render.
- “Anonymous then identify”:
  - Initialize PostHog once on app start (anonymous).
  - On auth user change:
    - If `user` present -> `identify(user)`
    - Else -> `reset()` to return to anonymous.

### Config (build-time)
Use Vite env vars:
- `VITE_FF_PROVIDER` (default: `posthog`)
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST` (default: `https://app.posthog.com`)
- `VITE_FF_DEBUG` (optional)

Expose config through `apps/web/src/lib/feature-flags/config.ts`.

### Wiring in App
- `apps/web/src/main.tsx`:
  - Wrap existing providers with `<FeatureFlagProvider>`
  - Place it above `AuthProvider` so it can observe auth state, or place below and pass `user` in from `useAuth` inside.
- In `FeatureFlagProvider`:
  - Use `useAuth()` to read `user` for identify/reset.

### Usage Example
- Component:
  - `const enabled = useFlagEnabled('new_nav', false)`
  - Render UI accordingly.

## Files and Locations
- `apps/web/src/lib/feature-flags/index.ts` (public exports)
- `apps/web/src/lib/feature-flags/types.ts`
- `apps/web/src/lib/feature-flags/provider.tsx` (React context + provider)
- `apps/web/src/lib/feature-flags/adapters/noop.ts`
- `apps/web/src/lib/feature-flags/adapters/posthog.ts`
- `apps/web/src/lib/feature-flags/config.ts`
- Update `apps/web/src/main.tsx`
- Optional tests in `apps/web/src/test/feature-flags.test.ts`

## API/Interface Changes
- New public module `lib/feature-flags`.
- New env vars (document in README if there’s a UI env section).

## Testing
- Unit tests:
  - Noop adapter returns defaults.
  - Hook uses defaults when flag missing.
  - Provider triggers rerender on `onFlagsChanged` (mock adapter).
- Manual verification:
  - Flag off/on toggles UI.
  - Login changes identify; logout resets.

## Edge Cases
- Missing PostHog key: fall back to noop adapter and defaults.
- Flags not yet loaded: hooks return defaults.
- Rapid auth changes: adapter operations should be idempotent.

## Assumptions and Defaults
- Client-only flag evaluation (no SSR).
- UI gating only (no experiment tracking).
- Build-time config via Vite env vars.
- Identity: anonymous until user is available, then identify; reset on logout.
