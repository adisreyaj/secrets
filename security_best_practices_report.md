# Security Best Practices Report

## Executive Summary
This codebase shows several solid security foundations (hashed passwords, encrypted secrets at rest, cookie-based sessions with `HttpOnly` + `SameSite`, CORS allowlist, and rate limiting on login). The main gaps are around defense-in-depth for cookie-based CSRF protections, missing security headers/CSP configuration, and long-lived API tokens without expiration. These are straightforward to address without major architectural change.

## High Severity

No high-severity issues were confirmed.

## Medium Severity

### [M-1] Cookie-authenticated state-changing requests lack CSRF tokens (Origin check only)
- **Rule ID:** EXPRESS-CSRF-001 / REACT-CSRF-001
- **Location:** `apps/server/src/app.ts:250-266`, `apps/web/src/lib/api.ts:34-44`
- **Evidence:**
  - Server enforces `Origin` matching for write methods but does not require a CSRF token.
  - Client sends cookie-authenticated requests (`credentials: 'include'`).
- **Impact:** If a browser or environment does not send/validate `Origin` consistently (or if origin validation is bypassed in a non-browser client), state‑changing requests can be susceptible to CSRF. Origin checks are helpful but are not a full CSRF defense.
- **Fix:** Add a CSRF token mechanism (synchronizer token or double-submit cookie) for all cookie-authenticated POST/PUT/PATCH/DELETE requests, and verify it server-side. Keep the Origin check as defense-in-depth.
- **Mitigation:** Continue enforcing strict `Origin` and `SameSite=Lax`, but treat this as partial protection only.
- **False positives / verify:** If all state-changing requests are performed exclusively by trusted non-browser clients that do not rely on cookies, CSRF may be less relevant. Otherwise, implement CSRF tokens.

### [M-2] Security headers/CSP are not configured in the app layer
- **Rule ID:** EXPRESS-HEADERS-001 / REACT-HEADERS-001
- **Location:** `apps/server/src/app.ts:182-192`
- **Evidence:** The server initializes Fastify with cookie/CORS/rate-limit only; no security header middleware (e.g., Helmet) or CSP configuration is present in app code.
- **Impact:** Missing `CSP`, `X-Content-Type-Options`, clickjacking protections, and `Referrer-Policy` reduces defense-in-depth against XSS and UI redress attacks.
- **Fix:** Add `@fastify/helmet` with a baseline CSP and headers appropriate for your deployment (prefer report-only first). If headers are set at the edge/CDN, document and verify them.
- **Mitigation:** Ensure security headers are enforced at the reverse proxy/edge if not in app code.
- **False positives / verify:** If an edge/CDN already injects headers, confirm the runtime response headers.

### [M-3] API tokens are long-lived with no expiration
- **Rule ID:** EXPRESS-AUTH-001 (token hygiene) / general best practice
- **Location:** `apps/server/prisma/schema.prisma:125-140`, `apps/server/src/app.ts:1425-1472`
- **Evidence:** `ApiToken` has no `expiresAt` field and is created without any expiry.
- **Impact:** Stolen tokens remain valid indefinitely unless manually revoked, increasing blast radius and persistence of compromise.
- **Fix:** Add `expiresAt` to `ApiToken`, enforce expiry checks on token auth, and allow optional expirations on creation (with sensible defaults). Consider rotation or one-time display of tokens (already done) plus UI to rotate/revoke.
- **Mitigation:** Encourage short-lived tokens or periodic rotation until expiration is implemented.
- **False positives / verify:** If tokens are always short-lived by operational policy and rotated frequently, risk is lower, but still best to enforce in code.

## Low Severity

### [L-1] Registration endpoint lacks brute-force / abuse throttling
- **Rule ID:** EXPRESS-AUTH-001
- **Location:** `apps/server/src/app.ts:271-307`
- **Evidence:** Login is rate-limited; registration is not.
- **Impact:** Attackers can create accounts in bulk or attempt enumeration at scale.
- **Fix:** Apply rate limiting to `/auth/register` (IP + account/email-based), or enforce via edge/WAF.
- **Mitigation:** Keep login throttling and consider captcha for public instances.
- **False positives / verify:** If registration is only enabled in closed/internal environments, this is lower risk.

## Notes & Positive Practices Observed
- Password hashing uses bcrypt with salt.
- Secrets are encrypted using AES-256-GCM with per-secret IVs and authentication tags.
- Session cookies are `HttpOnly` + `SameSite=Lax` and can be `Secure` in production.
- CORS is allowlisted to `APP_ORIGIN` with credentials enabled.
- Login endpoint rate-limits failed attempts.

