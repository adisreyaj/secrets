# Security Checklist

## Critical

- [ ] **Add runtime input validation** — All route handlers use `as Type` assertions without schema validation. Adopt zod or Fastify's built-in schema validation at every route boundary.

## High

- [x] **Fix CORS origin bypass** — `app.ts:55` allows requests with no `Origin` header (`if (!origin) callback(null, true)`). Reject missing origins.
- [x] **Extend rate limiting to all mutating endpoints** — Currently only `/auth/register` and `/auth/login` have rate limits. Add to API token creation, bulk secrets, project/environment mutations.
- [x] **Set explicit body size limits** — No `bodyLimit` configured on Fastify instance. Set per-route or globally.
- [ ] **Wire `LoginAbuseProtector` into login flow or remove dead code** — Exists in `abuseProtection.ts` but never used.

## Medium

- [ ] **Harden CSRF cookie** — Consider `SameSite=Strict` for the `sm_csrf` cookie.
- [x] **Default `cookieSecure` to `true`** — Currently defaults to `false`. Use `COOKIE_SECURE !== 'false'` so production is safe by default.
- [ ] **Add rate limits on API token creation and bulk secret endpoints** — e.g., 30/min for token creation, 10/min for bulk.
- [ ] **Enforce per-value size limits on bulk secrets** — Currently capped at 500 entries but no per-value limit.
- [ ] **Add upper bound on audit retention days** — e.g., `value > 3650` max.
- [ ] **Document one-time client secret pattern** — `clientSecret` returned in creation response; ensure no proxy/log leakage.

## Low

- [ ] **Add CSP to frontend HTML shell** — No `<meta http-equiv>` CSP in `index.html`. Add via meta tag or reverse proxy.
- [x] **Add SRI for Google Fonts CDN or self-host** — `index.html` loads fonts without integrity hashes.
- [ ] **Remove `.env` from git tracking** — Committed PostHog key (publishable, but bad hygiene). Keep only `.env.example`.

## Already Done ✅

- AES-256-GCM encryption for secrets at rest with random IV
- SHA-256 hashing for all tokens before DB storage
- bcrypt with salt rounds of 12 for passwords
- Helmet security headers with restrictive CSP (`default-src 'none'`, `frame-ancestors 'none'`)
- CSRF double-submit cookie pattern protecting cookie-authenticated writes
- Session cookie is `httpOnly`
- Comprehensive audit logging for all create/update/delete operations
- Parameterized queries via Prisma (prevents SQL injection)
- No `eval()` or `dangerouslySetInnerHTML` in React
- No localStorage/sessionStorage for sensitive tokens
- Token-based auth with scoped permissions (read-only, environment-scoped)
- Audit log sanitization with sensitive field redaction
- No open redirects or `postMessage` usage
- CORS rejects missing origins (prevents origin-less requests from bypassing CORS)
- Global rate limiting at 200 req/min (per-route limits on auth endpoints: 5-10/min)
- Body size limit set to 1MB on Fastify instance
- `cookieSecure` defaults to `true` in production (only set false explicitly)
- Constant-time client secret comparison using `timingSafeEqual`
- `allowPublicKeyRetrieval` removed from MariaDB adapter
- Password policy: min 8 chars, uppercase, lowercase, digit
- All sessions invalidated on password change
- Session TTL reduced from 7 days → 24 hours
- ID enumeration prevented: routes return 404 instead of 403 for unauthorized access
- `requireEnvironmentScope` enforced on DELETE, ROLLBACK, and COPY (source) endpoints
- Environment scope enforced on single-secret create (consistent with bulk)
- Logging captures all 4xx+ status codes and all mutation methods
- Resend API calls use 5-second timeout via AbortController
- Resend error messages sanitized (no raw API response forwarded)
- Google Fonts stylesheet loaded with `crossorigin` attribute
- Global error handler returns generic 500 message; only validation errors include details
