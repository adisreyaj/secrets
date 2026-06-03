# Security Best Practices Report — Secrets Manager

**Date**: 2026-06-01
**Scope**: Full-stack audit (Fastify backend + React frontend + CLI/SDK)
**Audit type**: Active — systematic scan against OWASP and platform-specific best practices

---

## Executive Summary

Secrets Manager is a well-architected application with strong foundations: AES-256-GCM encryption at rest, SHA-256 hashed tokens, bcrypt password hashing, CSRF protection, Helmet security headers, and comprehensive audit logging. Most security fundamentals are handled correctly.

This report identifies **1 critical**, **4 high**, **6 medium**, and **3 low** severity findings. The most important issues are the complete absence of runtime input schema validation (every route handler uses raw TypeScript type assertions), CORS origin bypass for requests without an `Origin` header, in-memory abuse protection that won't scale, and sparse rate limiting coverage.

---

## Severity Breakdown

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 4 |
| Medium   | 6 |
| Low      | 3 |

---

## Critical Findings

### CRIT-001: No runtime input validation on any route handler

**Severity**: Critical  
**Location**: All route handler files in `apps/server/src/server/routes/*.ts`  
**Impact**: An attacker can send unexpected types (arrays where strings are expected, nested objects, prototype pollution attempts) that bypass business logic checks because TypeScript type assertions (`as Type`) provide zero runtime protection.

**Evidence**: Every route handler uses patterns like:
```typescript
// apps/server/src/server/routes/projectCore.ts:21
const body = request.body as { name?: string; organizationId?: string } | undefined;

// apps/server/src/server/routes/secretPatch.ts:24
const body = request.body as { key?: string; value?: string } | undefined;

// apps/server/src/server/routes/auth.ts:78
const body = request.body as { email?: string; password?: string; name?: string } | undefined;
```

No route uses a schema validation library (zod, ajv, joi, etc.). Fastify supports schema-based validation natively via its `schema` option on route registration, but this is not used anywhere.

**Fix**: Adopt runtime validation (e.g., zod) and apply it at every route boundary. With Fastify, this can be done declaratively via the `schema` property on route options. At minimum, validate:
- Request body shape and types
- Query parameter types (strings can be arrays/objects in Fastify)
- Route parameter types

**Mitigation**: Prisma parameterizes all database queries, preventing SQL injection. But type confusion, logic bypass, and unexpected crashes remain possible.

---

## High Findings

### HIGH-001: In-memory `LoginAbuseProtector` doesn't persist across restarts or scale

**Severity**: High  
**Location**: `apps/server/src/server/services/auth/abuseProtection.ts:7`  
**Impact**: An attacker who can cause a server restart (or deploy a new instance behind a load balancer) resets all login attempt tracking, allowing unlimited brute-force attempts.

**Evidence**: The `LoginAbuseProtector` class uses a plain `Map<string, LoginAttemptState>` in memory:
```typescript
// apps/server/src/server/services/auth/abuseProtection.ts:7-8
export class LoginAbuseProtector {
  private readonly attempts = new Map<string, LoginAttemptState>();
```

The class is instantiated but never wired into any route handler in the current codebase — it exists but is not actively used for login rate limiting. Instead, `@fastify/rate-limit` is used for `/auth/login` (10/min) and `/auth/register` (5/min) at `apps/server/src/server/routes/auth.ts:76,126`.

**Fix**: Either:
1. Wire `LoginAbuseProtector` into the login flow for per-user+per-IP tracking (complementing the IP-based rate limiter), and back it with persistent storage (Redis/database), or
2. Remove the dead code if it's not intended to be used.

### HIGH-002: Rate limiting only covers auth routes; state-changing endpoints unprotected

**Severity**: High  
**Location**: `apps/server/src/app.ts:64` — `await app.register(rateLimit, { global: false });`  
**Impact**: An attacker can flood unprotected endpoints (bulk secret creation, API token creation, project creation) with requests, exhausting resources or triggering financial costs (e.g., email sends, database I/O).

**Evidence**: Rate limiting is registered with `global: false`, meaning only routes with explicit `config: { rateLimit: { ... } }` are protected. Only two routes have this:
- `/auth/register` — 5/minute (`apps/server/src/server/routes/auth.ts:76`)
- `/auth/login` — 10/minute (`apps/server/src/server/routes/auth.ts:126`)

Unprotected state-changing endpoints include:
- `POST /projects/:id/api-tokens` — creates API tokens (`apps/server/src/server/routes/apiTokens.ts:11`)
- `POST /environments/:id/secrets/bulk` — bulk upserts up to 500 secrets (`apps/server/src/server/routes/secretCreateBulk.ts:117`)
- `PATCH /secrets/:id` — updates secrets (`apps/server/src/server/routes/secretPatch.ts:17`)
- `POST /projects` — creates projects (`apps/server/src/server/routes/projectCore.ts:15`)
- `POST /projects/:id/environments` — creates environments (`apps/server/src/server/routes/environments.ts:20`)

**Fix**: Add rate limiting to all mutating routes, either by enabling `global: true` with per-route overrides, or by adding explicit rate limit configs to each protected endpoint.

### HIGH-003: CORS allows requests without Origin header

**Severity**: High  
**Location**: `apps/server/src/app.ts:55-57`  
**Impact**: Server-to-server requests, curl, and scripts that omit the `Origin` header bypass CORS origin validation entirely, allowing any external service to send credentialed requests.

**Evidence**:
```typescript
// apps/server/src/app.ts:54-59
origin: (origin, callback) => {
  if (!origin) {
    callback(null, true);  // <-- Allows requests with no Origin header
    return;
  }
  callback(null, config.appOrigins.includes(origin.replace(/\/$/, '')));
},
```

This is partially mitigated by the CSRF middleware in `middleware.ts:229-233` which validates the Origin/Referer on write operations for cookie-authenticated requests. However, token-authenticated requests skip this check (`middleware.ts:225-227`).

**Fix**: Reject requests without an Origin header when credentials are enabled:
```typescript
if (!origin) {
  callback(new Error('Origin required'), false);
  return;
}
```

### HIGH-004: Body size limits not explicitly configured

**Severity**: High  
**Location**: `apps/server/src/app.ts` — no body limit configuration  
**Impact**: An attacker can send arbitrarily large JSON payloads to exhaust server memory. Fastify's default body limit is 100kb, but this can be overridden or routes may have custom parsers without limits.

**Evidence**: The app registers `cookie`, `helmet`, `cors`, and `rateLimit` plugins but does not set `bodyLimit` on the Fastify instance or per-route:
```typescript
// apps/server/src/app.ts
const app = Fastify({
  logger: ...,
  disableRequestLogging: true,
  // No bodyLimit configured
});
```

**Fix**: Set `bodyLimit` on the Fastify instance (e.g., `bodyLimit: 1048576` for 1MB) and configure stricter limits per-route where appropriate.

---

## Medium Findings

### MED-001: CSRF double-submit cookie is not httpOnly (by design, but increases exposure)

**Severity**: Medium  
**Location**: `apps/server/src/server/http/middleware.ts:171-177`  
**Impact**: Any XSS vulnerability in the application can read the CSRF token from the `sm_csrf` cookie and use it to forge state-changing requests.

**Evidence**:
```typescript
// apps/server/src/server/http/middleware.ts:171-177
reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
  httpOnly: false,  // Required for JavaScript to read it for double-submit pattern
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  maxAge: config.sessionTtlHours * 60 * 60,
});
```

This is a necessary trade-off of the double-submit cookie pattern. The alternative (synchronizer token pattern) would require server-side token state.

**Fix**: Consider using SameSite=Strict instead of Lax for the CSRF cookie (the JS doesn't need cross-site access). Ensure strong CSP and XSS mitigations are in place.

### MED-002: Session cookie `secure` defaults to false

**Severity**: Medium  
**Location**: `apps/server/src/config.ts:29` — `cookieSecure: process.env.COOKIE_SECURE === 'true'`  
**Impact**: In any deployment where HTTPS is expected but `COOKIE_SECURE` is not explicitly set, session and CSRF cookies will be transmitted in cleartext over HTTP, enabling session hijacking via network sniffing.

**Evidence**:
```typescript
// apps/server/src/config.ts:29
cookieSecure: process.env.COOKIE_SECURE === 'true',
```

The default is `false`, and this is used for both `sm_session` and `sm_csrf` cookies. The session token (`sm_session`) is httpOnly and sameSite=lax but not Secure by default.

**Note**: The code correctly documents this as configurable for local development over HTTP. The concern is production deployments that forget to set `COOKIE_SECURE=true`.

**Fix**: Consider defaulting to `true` (production-safe) with an explicit opt-out env var for local dev: `process.env.COOKIE_SECURE !== 'false'`.

### MED-003: No rate limiting on API token creation or bulk secret operations

**Severity**: Medium  
**Location**: `apps/server/src/server/routes/apiTokens.ts:11` and `apps/server/src/server/routes/secretCreateBulk.ts:117`  
**Impact**: An attacker with valid credentials can create thousands of API tokens or secrets, exhausting database storage and creating noise in audit logs.

**Evidence**: Both `POST /projects/:id/api-tokens` and `POST /environments/:id/secrets/bulk` have no rate limit config.

**Fix**: Add rate limiting to these endpoints (e.g., 30 requests per minute for API token creation, 10 requests per minute for bulk secret operations).

### MED-004: Bulk secret endpoint accepts 500 entries per request without size limit

**Severity**: Medium  
**Location**: `apps/server/src/server/routes/secretCreateBulk.ts:133-135`  
**Impact**: A single request with 500 entries of large values can cause prolonged database transactions, memory pressure, and potential DoS.

**Evidence**:
```typescript
// apps/server/src/server/routes/secretCreateBulk.ts:133-135
if (entries.length > 500) {
  sendError(reply, 400, 'Too many entries (max 500).');
  return;
}
```

No per-value size limit is enforced. A value could be multiple megabytes in size.

**Fix**: Add per-value size limits and consider reducing the batch limit.

### MED-005: Audit log retention has no upper bound

**Severity**: Medium  
**Location**: `apps/server/src/server/routes/projectSettings.ts:52-57`  
**Impact**: An admin can set audit retention to an extremely high number (e.g., `Number.MAX_SAFE_INTEGER`), causing unbounded audit log growth and potential storage exhaustion.

**Evidence**:
```typescript
// apps/server/src/server/routes/projectSettings.ts:52-57
if (body.auditRetentionDays !== null) {
  const value = Number(body.auditRetentionDays);
  if (!Number.isFinite(value) || value < 1) {
    sendError(reply, 400, 'auditRetentionDays must be >= 1 or null');
    return;
  }
}
```

No upper bound check (e.g., `value > 3650` for 10 years max).

**Fix**: Add a reasonable upper bound for retention days.

### MED-006: One-time client secrets returned in API response and potentially logged

**Severity**: Medium  
**Location**: `apps/server/src/server/routes/auth.ts:888-891`  
**Impact**: While client secrets are one-time (shown only on creation), they are returned in the API response body and could be logged by API clients, proxy servers, or browser dev tools.

**Evidence**:
```typescript
// apps/server/src/server/routes/auth.ts:888-891
reply.code(201).send({
  client: toAuthClientDto(client),
  ...(rawSecret ? { clientSecret: rawSecret } : {}),
});
```

The `clientSecret` is sent in the response alongside audit log metadata that includes `clientId`. This follows the OAuth2 pattern of one-time secret display, but must be clearly documented to prevent accidental leakage.

**Fix**: This is an accepted pattern, but ensure it's documented and that the response is not logged by API gateway/proxy.

---

## Low Findings

### LOW-001: No Content-Security-Policy in frontend HTML shell

**Severity**: Low  
**Location**: `apps/web/index.html` — no CSP meta tag  
**Impact**: The frontend SPA does not have a CSP in its HTML shell. While the API server sets CSP via helmet, the SPA is served separately by Vite dev server without CSP.

**Evidence**:
```html
<!-- apps/web/index.html:1-19 -->
<!-- No <meta http-equiv="Content-Security-Policy"> present -->
```

However, the API server's helmet CSP (`apps/server/src/app.ts:45-49`) sets `default-src 'none'` which would apply to API responses but not to the separately-served frontend assets.

**Fix**: Add a CSP via `<meta>` tag in `index.html` or configure CSP at the Vite/reverse-proxy level for the frontend origin.

### LOW-002: Google Fonts loaded from external CDN without Subresource Integrity (SRI)

**Severity**: Low  
**Location**: `apps/web/index.html:11-13`  
**Impact**: If Google Fonts CDN is compromised, the injected CSS could be used for data exfiltration via CSS-based attacks, though the practical risk is minimal.

**Evidence**:
```html
<!-- apps/web/index.html:11-13 -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Zalando+Sans:ital,wght@0,200..900;1,200..900&display=swap" rel="stylesheet">
```

**Fix**: Self-host the fonts or add SRI hashes. Given the low risk of Google Fonts CDN compromise, this is a defense-in-depth improvement.

### LOW-003: `.env` file committed with PostHog publishable key

**Severity**: Low  
**Location**: `apps/web/.env:7` — `VITE_POSTHOG_KEY=phc_cndfFpfkGKS0bCCz2viJDk7tR5tzhy0PPGg4ZLQ1TJM`  
**Impact**: PostHog publishable keys (prefix `phc_`) are designed to be public and client-side, so this does not expose a secret. However, committing any key to the repository is a hygiene concern and encourages the pattern of committing secrets.

**Evidence**:
```
// apps/web/.env
VITE_API_URL=http://localhost:3001
VITE_FF_PROVIDER=posthog
VITE_ERROR_TRACKING_PROVIDER=posthog
VITE_POSTHOG_KEY=phc_cndfFpfkGKS0bCCz2viJDk7tR5tzhy0PPGg4ZLQ1TJM
```

**Fix**: Remove `.env` from the repository (add to `.gitignore`) and keep only `.env.example` with placeholder values.

---

## Positive Observations

The following security controls are implemented correctly and worth highlighting:

- ✅ **AES-256-GCM encryption** for secrets at rest with random IV per value (`apps/server/src/crypto.ts`)
- ✅ **SHA-256 hashing** for all tokens before database storage (session tokens, API tokens, refresh tokens) (`apps/server/src/auth.ts:17-19`)
- ✅ **bcrypt with salt rounds of 10** for password hashing (`apps/server/src/auth.ts:5`)
- ✅ **Helmet security headers** with restrictive CSP (`default-src 'none'`, `frame-ancestors 'none'`) (`apps/server/src/app.ts:44-52`)
- ✅ **CSRF double-submit cookie pattern** protecting cookie-authenticated write operations (`apps/server/src/server/http/middleware.ts:235-249`)
- ✅ **Session cookie is httpOnly** (`apps/server/src/server/routes/auth.ts:106`)
- ✅ **Comprehensive audit logging** for all create/update/delete operations across all resources
- ✅ **Parameterized queries** via Prisma ORM, preventing SQL injection
- ✅ **No `eval()` or `dangerouslySetInnerHTML`** in the React frontend
- ✅ **No localStorage/sessionStorage for sensitive tokens** — only theme preferences and UI state stored
- ✅ **Token-based auth for SDK/CLI with scoped permissions** (read-only, environment-scoped service accounts)
- ✅ **Audit log sanitization** — sensitive fields redacted before logging (`apps/server/src/server/logging/sanitize.ts`)
- ✅ **No obvious XSS sinks** in the React codebase (no `innerHTML`, no `dangerouslySetInnerHTML`)
- ✅ **No open redirects** — no `res.redirect()` or frontend redirect from user input
- ✅ **No `postMessage` usage** in the frontend

---

## Recommendations (Priority Order)

1. **Add runtime input validation** (zod) to all route handlers — this is the single highest-impact change. Fastify's built-in schema validation should be used.
2. **Fix CORS origin bypass** — reject requests without an Origin header.
3. **Extend rate limiting** to cover all mutating endpoints, not just auth routes.
4. **Set explicit body size limits** on the Fastify instance and per-route where needed.
5. **Configure `trust proxy`** explicitly to match the deployment proxy topology.
6. **Wire `LoginAbuseProtector` into login flow** or remove the dead code.
7. **Add CSP to the frontend HTML shell** via meta tag or reverse proxy.
8. **Remove `.env` from git tracking** and keep only `.env.example` with placeholders.

---

*Report generated by security audit tool. Findings are based on static analysis of the codebase at commit time. Runtime configuration (reverse proxy settings, environment variables, deployment topology) may add or mitigate certain risks not visible in the code.*
