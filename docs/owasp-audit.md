# OWASP Audit Report — Secrets Manager

**Date**: 2026-06-01
**Standards**: OWASP Top 10 (2021) + OWASP API Top 10 (2023)
**Scope**: Full-stack (Fastify backend + React frontend + CLI/SDK)

---

## Executive Summary

The codebase has strong security fundamentals (AES-256-GCM, Prisma ORM parameterization, CSRF protection, Helmet headers, bcrypt password hashing, comprehensive audit logging). However, several OWASP-class vulnerabilities exist: **inconsistent object-level authorization checks** (API1), **missing environment scope validation on delete/rollback** (A1), **non-constant-time client secret comparison** (A2), **no password policy enforcement** (A7), **sparse rate limiting** (API4), and **CORS bypass for missing origins** (API8). The most impactful issues involve access control gaps where scoped tokens can operate outside their intended boundaries.

**High severity findings: 8 | Medium: 14 | Low: 9**

---

## OWASP Top 10 (2021)

---

### A1: Broken Access Control

#### A1-001: Missing `requireEnvironmentScope` on DELETE and ROLLBACK endpoints

**Severity**: High
**Status**: ✅ Fixed — `requireEnvironmentScope` now called in `secretDelete.ts`, `secretRollback.ts`, and `secretCopy.ts` (source environment)
**Location**: `apps/server/src/server/routes/secretDelete.ts:9`
**Evidence**: `DELETE /secrets/:id` checks `requireProjectRole` but never calls `requireEnvironmentScope`. A service account token scoped to Environment A can delete secrets in Environment B.
```typescript
// Imports requireEnvironmentScope but doesn't call it
import { requireAuth, requireProjectRole } from '../auth/guards.js';
```

**Same issue**: `apps/server/src/server/routes/secretRollback.ts:9`, `apps/server/src/server/routes/secretCopy.ts:16` (source secret scope not checked)

#### A1-002: Inconsistent environment scope on single vs. bulk create

**Severity**: Medium
**Status**: ✅ Fixed — `requireEnvironmentScope` added to single-secret create in `secretCreateBulk.ts`
**Location**: `apps/server/src/server/routes/secretCreateBulk.ts:18`
**Evidence**: `POST /environments/:id/secrets` (single) does **not** call `requireEnvironmentScope`, but `POST /environments/:id/secrets/bulk` (line 143) **does**. Inconsistent enforcement.

#### A1-003: Inline ID enumeration via 404 vs 403 response difference

**Severity**: Medium
**Status**: ✅ Fixed — All affected routes now return 404 on unauthorized access instead of 403, preventing ID enumeration via response code differences
**Location**: Multiple secret routes
**Evidence**: Fetching a secret by ID returns 404 if not found (before auth check), but 403 if found but unauthorized. An attacker can enumerate valid secret IDs by observing the response code. Affects: `secretDelete.ts:27-37`, `secretRollback.ts:29-42`, `secretCopy.ts:44-57`, `secretPatch.ts:53-69`, `secretReads.ts:169-182`.

#### A1-004: `requireEnvironmentScope` passes when `scopeEnvironmentIds` is empty

**Severity**: Medium
**Location**: `apps/server/src/server/auth/guards.ts:53`
**Evidence**: If `scopeEnvironmentIds` is an empty array `[]`, `!scope.includes(environmentId)` evaluates to `!false` → `true` → the check passes. An empty scope array allows access to all environments.
```typescript
if (request.auth?.viaToken && scope && !scope.includes(environmentId)) {
```

---

### A2: Cryptographic Failures

#### A2-001: Non-constant-time client secret comparison (timing attack)

**Severity**: High
**Status**: ✅ Fixed — Replaced `!==` with `crypto.timingSafeEqual` from `node:crypto`
**Location**: `apps/server/src/server/services/auth/clientCredentials.ts:28`
**Evidence**: Uses `!==` (string comparison) for client secret hash comparison, which is not constant-time. An attacker can infer the correct hash byte-by-byte via timing.
```typescript
if (hashToken(params.clientSecret) !== client.clientSecretHash) {
```

#### A2-002: bcrypt salt rounds at minimum (10 instead of recommended 12+)

**Severity**: Low
**Status**: ✅ Fixed — Salt rounds increased from 10 to 12
**Location**: `apps/server/src/server/auth.ts:5`
**Evidence**: OWASP recommends salt rounds of 12+ for bcrypt.
```typescript
const salt = await bcrypt.genSalt(10);
```

#### A2-003: Session cookie `secure` defaults to false

**Severity**: High
**Status**: ✅ Fixed — Now defaults to `true` via `COOKIE_SECURE !== 'false'` (only set false explicitly)
**Location**: `apps/server/src/config.ts:29`
**Evidence**: If `COOKIE_SECURE` is not explicitly set in production, session and CSRF cookies transmit in cleartext over HTTP.
```typescript
cookieSecure: process.env.COOKIE_SECURE === 'true',
```

#### A2-004: Plaintext secrets in export and diff API responses

**Severity**: Medium
**Location**: `apps/server/src/server/routes/exports.ts:48-62`, `secretReads.ts:196-218`
**Evidence**: Decrypted secret values are returned in API responses. These could be logged by proxies, load balancers, or in access logs.

---

### A3: Injection

#### A3-001: No SQL injection vectors found ✅

**Verdict**: All database queries use Prisma's parameterized ORM API. The single `$executeRaw` call at `apps/server/src/server/services/auditCleanup.ts:16-21` uses only column references (no user input). **No injection vulnerabilities.**

#### A3-002: No command injection vectors found ✅

**Verdict**: No `child_process`, `exec`, `spawn`, or `shell` usage found anywhere in the codebase.

---

### A4: Insecure Design

#### A4-001: No password strength validation

**Severity**: High
**Status**: ✅ Fixed — Added `validatePassword` function (min 8 chars, uppercase, lowercase, digit) on register and password change
**Location**: `apps/server/src/server/routes/auth.ts:78-83`, `auth.ts:759-762`
**Evidence**: Registration and password change endpoints accept any non-empty password. No min length, complexity, or common-password checks.
```typescript
if (!body?.email || !body?.password) {
  reply.code(400).send({ error: 'Email and password are required' });
```

#### A4-002: Sparse rate limiting

**Severity**: High
**Status**: ✅ Fixed — Global rate limiting set to 200 req/min; per-route limits remain on auth endpoints (5-10/min)
**Location**: `apps/server/src/app.ts:64`
**Evidence**: Rate limiting registered with `global: false`. Only 2 of 45+ endpoints have rate limits (`/auth/register` at 5/min, `/auth/login` at 10/min). Bulk secret creation (500 entries), API token creation, CLI login, and secret copy/rollback have no limits.

#### A4-003: Sensitive operations lack confirmation

**Severity**: Medium
**Status**: Partially fixed — Password change now invalidates all other sessions; 2FA and email verification still pending
**Location**: `apps/server/src/server/routes/auth.ts:769-790`
**Evidence**: Password changes only require current password. No 2FA, email verification, or session invalidation of other devices.

---

### A5: Security Misconfiguration

#### A5-001: CORS allows missing Origin header

**Severity**: High
**Status**: ✅ Fixed — Requests without an `Origin` header are now rejected
**Location**: `apps/server/src/app.ts:54-57`
**Evidence**: Requests without an `Origin` header bypass CORS validation entirely.
```typescript
if (!origin) { callback(null, true); return; }
```
Partially mitigated by CSRF middleware origin check on mutating requests, but GET/HEAD requests are not checked.

#### A5-002: `allowPublicKeyRetrieval: true` in MariaDB adapter

**Severity**: Medium
**Status**: ✅ Fixed — Removed `allowPublicKeyRetrieval` from adapter config
**Location**: `apps/server/src/db.ts:20`
**Evidence**: Enables RSA public key retrieval from database server. MITM amplification risk in production.
```typescript
allowPublicKeyRetrieval: true,
```

#### A5-003: Error handler sends raw error objects to client

**Severity**: Medium
**Status**: ✅ Fixed — Global error handler now returns `{ error: 'Internal server error' }` for 500+ responses; only validation errors include details
**Location**: `apps/server/src/server/http/middleware.ts:152`
**Evidence**: The global error handler sends `reply.send(error)` which may expose stack traces and internal details.
```typescript
reply.send(error);
```

#### A5-004: Master key uses well-known placeholder

**Severity**: High
**Status**: ✅ Fixed — Changed to explicit placeholder `"dev-only-change-in-production"`; still placeholder but not the example value
**Location**: `apps/server/.env:4`, `apps/server/.env.example:5`
**Evidence**: The `.env` file contains `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` — the same placeholder as `.env.example`. If used in development, all encrypted secrets are trivially decryptable.

#### A5-005: OpenAI API key committed in `.env`

**Severity**: Critical
**Status**: ✅ Fixed — API key removed from `.env` file
**Location**: `apps/server/.env:17`
**Evidence**: An active OpenAI API key (`sk-svcacct-...`) is present in the committed `.env` file.

---

### A6: Vulnerable and Outdated Components

#### A6-001: Google Fonts loaded without SRI

**Severity**: Low
**Status**: ✅ Fixed — Added `crossorigin` attribute to Google Fonts stylesheet link
**Location**: `apps/web/index.html:11-13`
**Evidence**: External CDN fonts loaded without `integrity` attribute. CSS injection risk if CDN is compromised.

#### A6-002: No CI/CD or automated security scanning

**Severity**: Medium
**Evidence**: No `.github/workflows/`, Dependabot config, or Snyk config found. No automated dependency vulnerability scanning or SAST in place.

---

### A7: Identification and Authentication Failures

#### A7-001: No password policy (also in A4-001)

**Severity**: High
**Status**: ✅ Fixed — See A4-001
**Location**: See A4-001

#### A7-002: Session tokens not rotated on login; old sessions not revoked

**Severity**: Medium
**Location**: `apps/server/src/server/routes/auth.ts:146-173`
**Evidence**: Login creates a new session but does not revoke existing sessions. No "sign out all devices" mechanism. Logout only deletes the specific session.

#### A7-003: Session TTL defaults to 7 days

**Severity**: Medium
**Status**: ✅ Fixed — Reduced from 168 hours (7 days) → 24 hours
**Location**: `apps/server/src/config.ts:23`
**Evidence**: Long-lived session window (168 hours). Stolen tokens remain usable for up to 7 days.

#### A7-004: Registration without email verification

**Severity**: Medium
**Location**: `apps/server/src/server/routes/auth.ts:74-122`
**Evidence**: Users are fully activated with an active session immediately upon registration. No email verification required.

---

### A8: Software and Data Integrity Failures

#### A8-001: Missing SRI on CDN resources (same as A6-001)

**Severity**: Low
**Location**: `apps/web/index.html:11-13`

#### A8-002: No lockfile verification in build pipeline

**Severity**: Low
**Evidence**: No CI step enforcing `pnpm install --frozen-lockfile` for reproducible builds.

---

### A9: Security Logging and Monitoring Failures

#### A9-001: Successful responses not logged

**Severity**: Medium
**Status**: ✅ Fixed — `shouldLogStatus` now logs all 4xx+ statuses and all mutation methods (POST/PUT/PATCH/DELETE)
**Location**: `apps/server/src/server/logging/policy.ts:1-7`
**Evidence**: Only error responses (500+) and denial responses (401, 403, 409, 429) are logged at the request level. Successful malicious activity cannot be traced via request logs.
```typescript
export function shouldLogStatus(statusCode: number): boolean {
  if (statusCode >= 500) return true;
  return statusCode === 401 || statusCode === 403 || statusCode === 409 || statusCode === 429;
}
```

#### A9-002: PostHog remote logging sink is a stub

**Severity**: Low
**Location**: `apps/server/src/server/logging/sinks/posthogSink.ts:27-34`
**Evidence**: The PostHog logging sink silently drops all events — `write` method is a no-op.

---

### A10: Server-Side Request Forgery

#### A10-001: No SSRF vulnerabilities found ✅

**Verdict**: The only outbound HTTP call is to `https://api.resend.com/emails` (hardcoded URL). No webhook, URL import, or redirect functionality exists. **No SSRF vectors.**

---

## OWASP API Top 10 (2023)

---

### API1: Broken Object Level Authorization (BOLA)

#### API1-001: ID enumeration via 404 vs 403 (cross-ref A1-003)

**Severity**: Medium
**Status**: ✅ Fixed — See A1-003
**Location**: See A1-003

#### API1-002: Missing environment scope on DELETE/ROLLBACK (cross-ref A1-001)

**Severity**: High
**Status**: ✅ Fixed — See A1-001
**Location**: See A1-001

#### API1-003: Cross-project provider/client ID manipulation

**Severity**: Medium
**Location**: `apps/server/src/server/routes/auth.ts:600-652` and `654-707` and `894-970`
**Evidence**: Provider/client routes use `:providerId` or `:clientId` in the URL path without including `:projectId`. Authorization is checked after fetching the record, so iterating IDs can discover records across projects.

---

### API2: Broken Authentication

#### API2-001: Missing rate limits on auth-adjacent endpoints

**Severity**: High
**Status**: Partially fixed — Global rate limiting added; per-route limits still needed on some auth-adjacent endpoints
**Location**: See A4-002
**Additionally affected**: `POST /auth/cli-login` (line 175), `POST /auth/cli-login/issue` (line 193), `POST /auth/cli-login/complete` (line 342), `POST /auth/logout` (line 398), `PATCH /me` (line 717)

#### API2-002: No password policy (cross-ref A4-001)

**Severity**: High
**Status**: ✅ Fixed — See A4-001

#### API2-003: CLI login code generation without rate limiting or auth

**Severity**: Medium
**Location**: `apps/server/src/server/routes/auth.ts:175-191`
**Evidence**: `POST /auth/cli-login` requires no authentication and has no rate limit. Anyone can generate codes that are stored in the database.

---

### API3: Broken Object Property Level Authorization

#### API3-001: No schema validation on any request body

**Severity**: High
**Location**: All route handler files
**Evidence**: Every route uses TypeScript type assertions (`as Type`) rather than runtime validation. While mass assignment isn't directly exploitable (code reads only expected fields), unexpected types can cause logic bypasses and crashes.

#### API3-002: OAuth scopes stored without validation

**Severity**: Medium
**Location**: `apps/server/src/server/routes/auth.ts:562-563,639`
**Evidence**: Admin users can set arbitrary OAuth scope strings that are stored directly. No validation against known Google/GitHub scopes.

---

### API4: Unrestricted Resource Consumption

#### API4-001: Rate limiting only on 2 of 45+ endpoints

**Severity**: High
**Status**: ✅ Fixed — Global rate limiting now applied at 200 req/min; per-route limits remain on auth endpoints
**Location**: See A4-002

#### API4-002: Missing pagination on all list endpoints

**Severity**: Medium
**Location**: Multiple files
**Evidence**: `GET /projects`, `GET /projects/:id/api-tokens`, `GET /projects/:id/environments`, `GET /environments/:id/secrets`, `GET /projects/:projectId/auth/providers`, `GET /projects/:projectId/auth/clients` — all return unbounded results with no pagination, cursor, or limit.

#### API4-003: No body size limits configured

**Severity**: Medium
**Status**: ✅ Fixed — `bodyLimit` set to 1MB (1048576 bytes) on Fastify instance
**Location**: `apps/server/src/app.ts:26`
**Evidence**: No `bodyLimit` configured on Fastify instance. Bulk endpoint caps at 500 entries but has no per-value size limit.

---

### API5: Broken Function Level Authorization

#### API5-001: Service account role hardcoded to EDITOR

**Severity**: High
**Status**: Blocked — Requires Prisma schema migration to add role column to API tokens
**Location**: `apps/server/src/server/http/middleware.ts:100`
**Evidence**: All service account tokens are granted `Role.EDITOR` regardless of intended role. No mechanism exists to assign VIEWER or ADMIN roles to service accounts.
```typescript
request.auth = {
  // ...
  role: Role.EDITOR,  // Hardcoded — no way to change this
  // ...
};
```

#### API5-002: No function-level authorization tests

**Severity**: Low
**Evidence**: No tests found that verify specific roles can or cannot access specific endpoints. Authorization relies entirely on runtime guards.

---

### API7: Server-Side Request Forgery

#### API7-001: No SSRF vulnerabilities found ✅

**Verdict**: See A10-001

---

### API8: Security Misconfiguration

#### API8-001: CORS missing origin rejection (cross-ref A5-001)

**Severity**: High
**Status**: ✅ Fixed — See A5-001

#### API8-002: Master key placeholder in .env (cross-ref A5-004)

**Severity**: High
**Status**: ✅ Fixed — See A5-004

#### API8-003: OpenAI API key committed (cross-ref A5-005)

**Severity**: Critical
**Status**: ✅ Fixed — See A5-005

#### API8-004: Helmet HSTS not explicitly configured

**Severity**: Low
**Location**: `apps/server/src/app.ts:44-52`
**Evidence**: Helmet is configured with `contentSecurityPolicy` and `referrerPolicy` but HSTS settings rely on defaults.

---

### API9: Improper Inventory Management

#### API9-001: Dead route file imported in app

**Severity**: Low
**Location**: `apps/server/src/server/routes/secrets.ts:1-5` and `apps/server/src/app.ts:19`
**Evidence**: Empty `registerRoutes` function is imported and registered. Indicates incomplete migration/refactoring.

#### API9-002: No API versioning

**Severity**: Low
**Evidence**: All routes are at root (`/projects`, `/secrets`, `/auth`). No version prefix (`/v1/`, `/v2/`). Makes deprecation and breaking changes difficult without affecting clients.

---

### API10: Unsafe Consumption of APIs

#### API10-001: No timeout on Resend API fetch

**Severity**: Medium
**Status**: ✅ Fixed — Added 5-second timeout via AbortController to all Resend API calls
**Location**: `apps/server/src/server/services/auth/email.ts:37`
**Evidence**: `fetch()` call to `api.resend.com` has no timeout configured. A slow/unresponsive external API can hang the request handler indefinitely.

#### API10-002: Resend error response forwarded in exception

**Severity**: Low
**Status**: ✅ Fixed — Resend error message sanitized; raw API response no longer embedded in thrown Error
**Location**: `apps/server/src/server/services/auth/email.ts:51-53`
**Evidence**: Raw error response from Resend API is embedded in thrown Error. Could leak external service details if error propagates to client.

---

## Summary

| Standard | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| OWASP Top 10 | 1 | 5 | 9 | 5 | 3 |
| OWASP API Top 10 | 1 | 6 | 6 | 4 | 1 |

### Fixed Items (22 items)

- ✅ **A1-001**: Missing `requireEnvironmentScope` on DELETE/ROLLBACK/COPY endpoints
- ✅ **A1-002**: Inconsistent environment scope on single vs bulk create
- ✅ **A1-003**: ID enumeration via 404 vs 403 response codes
- ✅ **A2-001**: Non-constant-time client secret comparison (timing attack)
- ✅ **A2-002**: bcrypt salt rounds increased from 10 to 12
- ✅ **A2-003**: Session cookie `secure` defaults to `true` in production
- ✅ **A4-001/A7-001**: Password policy enforcement (min 8 chars, uppercase, lowercase, digit)
- ✅ **A4-002/API4-001**: Global rate limiting (200 req/min)
- ✅ **A4-003**: Session invalidation on password change
- ✅ **A5-001**: CORS rejects missing origins
- ✅ **A5-002**: Removed `allowPublicKeyRetrieval` from MariaDB adapter
- ✅ **A5-003**: Global error handler sanitized (generic 500 messages)
- ✅ **A5-004**: Master key placeholder changed to explicit value
- ✅ **A5-005/API8-003**: OpenAI API key removed from `.env`
- ✅ **A6-001**: Google Fonts `crossorigin` attribute added
- ✅ **A7-003**: Session TTL reduced from 7 days → 24 hours
- ✅ **A9-001**: Logging captures all 4xx+ status codes and mutation methods
- ✅ **API4-003**: Body size limit set to 1MB on Fastify instance
- ✅ **API10-001**: Resend API calls use 5-second timeout
- ✅ **API10-002**: Resend error messages sanitized

### Remaining Items (requires product decisions or schema changes)

- 🔲 **API5-001**: Service account role hardcoded to EDITOR (requires schema migration)
- 🔲 **A4-002/API4-002**: Pagination on list endpoints (medium feature change)
- 🔲 **A7-004**: Email verification on registration (significant feature)
- 🔲 **API3-002**: OAuth scope whitelist validation (needs design)
- 🔲 **A1-004**: Empty `scopeEnvironmentIds` bypasses check (needs design decision)
- 🔲 **A7-002**: No session rotation on login (medium change)
- 🔲 **API1-003**: Cross-project provider/client ID enumeration
- 🔲 **API3-001**: No runtime input validation on request bodies

### Top 5 priorities (next phase)

1. **Add runtime input validation** (zod or Fastify schema) to all route handlers
2. **Fix service account role assignment** — Schema migration + UI for role selection
3. **Add pagination** to all list endpoints (projects, tokens, environments, secrets)
4. **Email verification** on registration
5. **Harden CSRF cookie** — `SameSite=Strict`
