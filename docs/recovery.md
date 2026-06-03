# Recovery Guide

This document covers how to recover from the most common "I lost or forgot a
secret" situations — from the trivial to the catastrophic. Read it before you
need it.

> **The single most important rule:** the encrypted data in the database is
> only as recoverable as the **MASTER_KEY** (and the database itself). If you
> lose both, the data is gone permanently. Back up both, in **different
> systems**, on a schedule you actually test.

---

## 1. The big picture (read this first)

Every secret in this system is encrypted with **AES-256-GCM** under a chain:

```
MASTER_KEY (env var, 32 bytes)
   └─ wraps ─> per-Environment DEK (32 bytes, stored in `environments.encrypted_dek`)
                  └─ wraps ─> every SecretVersion ciphertext in that environment
```

Additional AAD strings (`env:<envId>;secret_key:<key>`, etc.) bind each
ciphertext to its context, but the actual key material is always the DEK, and
the DEK is always wrapped by the MASTER_KEY.

This means:

- **Lost MASTER_KEY** → every secret, every auth signing key, every provider
  config, every end-user password reset token in every environment is
  **unrecoverable**. The DEKs are wrapped, the auth signing private keys are
  wrapped, and the auth provider configs are wrapped — they all need the
  MASTER_KEY.
- **Lost a single DEK** (e.g. `encrypted_dek` blob for one environment is
  corrupt) → only the secrets in that one environment are unrecoverable.
- **Lost a single secret value** → almost always recoverable through normal
  read paths (you probably just don't remember where you stored it).
- **Lost a CLI token** → trivially recoverable by logging in again.
- **Lost a web password** → requires an admin to reset your `User.passwordHash`
  directly in the database (there is no self-serve password reset endpoint).

The remaining sections walk through each scenario in detail.

---

## 2. Scenarios you can recover on your own

### 2.1 I forgot the value of a secret

You don't need to "recover" it — you just need to read it.

**Web UI:** open the project → environment → click the eye icon next to the
secret key. The current value is decrypted on the server and shown to you.
Role required: `VIEWER` or higher.

**CLI:**

```bash
# If you've already run `secrets login` and `secrets init`, just:
secrets get API_KEY

# If you have a token but no `.secretsrc.json`:
SECRETS_TOKEN=... SECRETS_PROJECT=acme SECRETS_ENV=prod secrets get API_KEY
```

Role required: any token scoped to the environment (or a project token with
editor access).

**SDK (Node):**

```ts
import { createSecretsClient } from '@secrets/sdk'

const client = createSecretsClient({
  token: process.env.SECRETS_TOKEN!,
  projectSlug: 'acme',
  environmentSlug: 'prod',
})

const value = await client.getSecret('API_KEY')
```

**Bulk dump (Editor/Admin only):**

```bash
secrets export --format dotenv --out .env.local
# or via curl:
curl -H "Authorization: Bearer $SECRETS_TOKEN" \
  "https://secrets.api.adi.so/environments/$ENV_ID/export?format=dotenv"
```

The export endpoint requires `EDITOR` role and is the fastest way to dump an
entire environment for backup or audit.

### 2.2 I overwrote a secret with the wrong value

Every `PATCH /secrets/:id` (and every value in `secretCreateBulk`) creates a
new `SecretVersion` row. The previous version is **never deleted** — it just
gets `isActive = false`.

**Web UI:** open the secret → "History" tab → click the version you want →
"Rollback to this version".

**API:**

```bash
# List version IDs (returns id, createdAt, isActive — no plaintext)
curl -H "Authorization: Bearer $SECRETS_TOKEN" \
  "https://secrets.api.adi.so/secrets/$SECRET_ID/versions"

# Rollback (EDITOR role)
curl -X POST -H "Authorization: Bearer $SECRETS_TOKEN" \
  "https://secrets.api.adi.so/secrets/$SECRET_ID/rollback" \
  -H "Content-Type: application/json" \
  -d '{"versionId": "ckl...the-version-id"}'
```

> **Caveat:** when a secret's **key** is renamed, every historical version is
> re-encrypted under the new key's AAD (`env:<envId>;secret_key:<newKey>`)
> inside the same `PATCH` transaction. The plaintext of old versions is
> preserved — only the AAD binding changes. You can still roll back to them.

### 2.3 I lost my CLI token (the `SECRETS_TOKEN` value)

`secrets login` is zero-friction: it opens your browser, authenticates you,
and stores the resulting token at `~/.config/secrets/auth.json`. Just run it
again.

```bash
secrets login          # interactive: opens browser, writes auth cache
secrets init           # interactive: select project + env, write .secretsrc.json
secrets list --debug   # verify
```

If you don't have a browser available, the project admin can mint a new
**project API token** for you from the web UI (Project → Settings → API
Tokens → Create). The new token is shown **once** and stored hashed in
`api_tokens.token_hash` — there is no way to retrieve it later.

### 2.4 I forgot my web password

There is no self-serve "forgot password" endpoint. Recovery requires an admin
to reset your password hash directly. Two options:

**Option A — admin resets your password via the web UI**

If you are still authenticated as an admin, go to Project Members → find your
user → reset password. (If the UI doesn't expose this, see Option B.)

**Option B — admin resets your password directly in MySQL**

```sql
-- First, generate a bcrypt hash for the new password (use a local Node REPL):
--   node -e "console.log(require('bcryptjs').hashSync('NEW_PASSWORD_HERE', 12))"

UPDATE users
SET password_hash = '<paste-bcrypt-hash-here>',
    updated_at = NOW()
WHERE email = 'you@example.com';
```

The user can now log in with the new password. Rotate the password through the
web UI on first login to make sure the bcrypt salt rounds are at the current
value (12+).

### 2.5 I lost access to a project (removed from members / lost role)

The `ProjectMember` rows control who can access a project. If you were
removed, only an existing project `ADMIN` can re-add you.

If you were the **only** admin, recovery requires either:

- another org-level admin granting you membership via the org admin UI, **or**
- directly inserting a row in MySQL:

```sql
INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
VALUES (
  'cm_new_membership',          -- any unique cuid
  'ck_project_id',              -- the project you need access to
  'ck_your_user_id',            -- your user row
  'ADMIN',
  NOW(), NOW()
);
```

The user_id can be found from `users` by email.

### 2.6 I lost access to an environment (token has wrong scope)

Service-account tokens can be scoped to specific environments via the
`ServiceAccountTokenEnvironment` join table. If your token no longer has the
environment listed, an admin must add it:

```sql
INSERT INTO service_account_token_environments
  (service_account_token_id, environment_id)
VALUES
  ('ck_token_id', 'ck_env_id');
```

Alternatively, mint a new token with the right scope from the web UI.

---

## 3. Scenarios that require a server / DB administrator

### 3.1 I lost the **MASTER_KEY** (catastrophic)

If `MASTER_KEY` is gone and no copy exists, **all encrypted data is
unrecoverable**. The application will return HTTP 500 on every encrypted
endpoint (the global error handler in `apps/server/src/server/http/middleware.ts`
maps `DecryptionError` to 500 with no ciphertext leak).

**Recovery is only possible if you have a backup of MASTER_KEY.** This is why
it must be stored somewhere independent of the database — see §5 for
recommendations.

Restoring once you find the key:

1. Update `apps/server/.env` with the recovered `MASTER_KEY` (and the
   matching `MASTER_KEY_VERSION` if you use key versioning).
2. Restart the server. The new process will be able to unwrap every DEK and
   every secret again.
3. If the key is from a different version, also restore any backup columns
   (`environments.encrypted_dek_backup`) — see §3.3 for key rotation.

If no copy of MASTER_KEY exists anywhere, the only option is to start over:
create a fresh `MASTER_KEY`, accept that all old secrets are lost, and have
users re-enter values.

### 3.2 I lost the **DEK** for one environment (e.g. `encrypted_dek` blob corrupted)

A DEK is 32 random bytes, encrypted with MASTER_KEY under AAD
`env:<envId>;secret_id:dek`, and stored in `environments.encrypted_dek`. If
that blob is corrupted (truncated, wrong bytes), the wrapped DEK is
unrecoverable and **every secret in that environment is lost**.

The app will respond with `DecryptionError` → HTTP 500 on first read of any
secret in that environment.

**Recovery path:**

1. **Restore from a database backup** that has the intact `encrypted_dek`
   blob for that environment. This is the only way to keep the existing
   ciphertexts.
2. **If you have the **backup** column** (`environments.encrypted_dek_backup`),
   the migration script in `apps/server/src/server/scripts/migrateEnvelopeEncryption.ts`
   can be extended to fall back to it. By default the app uses the primary
   column only.
3. **Last resort — wipe and re-create the environment.** The application
   automatically provisions a fresh DEK the next time a secret is created in
   the environment (see `getOrCreateEnvironmentDek` in
   `apps/server/src/server/services/envCrypto.ts`). All existing
   `SecretVersion` rows for that environment will be undecryptable and must
   be deleted or replaced:

   ```sql
   -- After DEK is lost, this hides all the now-undecryptable versions.
   -- The environment row stays; a new DEK will be provisioned on next write.
   UPDATE secrets SET deleted_at = NOW() WHERE environment_id = 'ck_env_id';
   ```

### 3.3 I want to rotate the **MASTER_KEY**

Enveloped encryption makes this safe and atomic. The new key is used only to
re-wrap DEKs — every secret ciphertext stays the same.

The current model in `crypto.ts` supports `MASTER_KEY_VERSION` (defaults to
`v1`) and each `SecretVersion` row records the `keyVersion` it was written
under. The runtime only honors the current `MASTER_KEY`/`MASTER_KEY_VERSION`
pair; older versions are still stored in `keyVersion` for audit but cannot be
decrypted without the old key (a TODO; see `owasp-audit.md`).

**Rotation procedure:**

1. Generate a new 32-byte key. **Keep a copy of the old key** until the
   rotation is fully verified.
2. Update `MASTER_KEY` to the new value in your secret store and set
   `MASTER_KEY_VERSION=v2`.
3. For each environment, re-wrap the DEK under the new key:

   ```ts
   // Pseudocode — adapt for your admin tool of choice.
   for (const env of await prisma.environment.findMany()) {
     if (!env.encryptedDek) continue;
     const wrapped = Buffer.from(env.encryptedDek); // iv|tag|ciphertext
     const dek = decryptSecretWithOldKey(wrapped, env.id);
     const rewrapped = encryptSecret(dek.toString('base64'), newMasterKey,
                                     aadForSecret(env.id, 'dek'));
     await prisma.environment.update({
       where: { id: env.id },
       data: { encryptedDek: packDekPayload(rewrapped) },
     });
   }
   ```

4. Restart the server with the new env vars. Verify reads still work for at
   least one secret per environment.
5. **Only after** you've confirmed step 4 succeeds, you may delete the old
   `MASTER_KEY` from your secret store.

If you store a **backup** in `environments.encrypted_dek_backup` (e.g. wrapped
under a different key version), this is the moment to update it as well.

### 3.4 I lost a **service-account token** or **API token** (project-scope)

Both token types are stored as `sha256(token)` hashes; the raw token is only
shown once at creation. There is no way to recover the raw value. Mint a new
one from the web UI and revoke the old one (`DELETE /projects/:id/api-tokens/:tokenId`).

### 3.5 I lost a **JWT signing key** (per-project)

Each project has its own `auth_signing_keys` row with a wrapped RSA private
key. The active key signs user-facing JWTs. If a signing key is lost:

- **Active key lost** → the project can no longer mint valid JWTs. Existing
  sessions will fail to validate (look for `kid` in JWT headers and verify
  against `auth_signing_keys.public_key_pem`).
- **Recovery:** run the `ensureActiveAuthSigningKey` function in
  `apps/server/src/server/services/auth/jwt.ts` — it auto-generates a new key
  pair if no active one is found. All existing end-user sessions for that
  project are invalidated, which is the correct behavior.

To force-rotate manually: mark the current key `retiredAt = NOW()` in MySQL
and restart the server. The next request to mint a token will create a new
key.

### 3.6 I lost a **provider config** (OAuth client secret, etc.)

Provider configs are encrypted with AAD
`auth:provider:<providerConfigId>`. The plaintext is shown once on creation.
If you lost the secret, you must rotate it on the upstream provider (Google
console, GitHub OAuth app, etc.) and re-enter it in the secrets manager.

### 3.7 Database lost / corrupted

A full database restore requires both the database dump **and** the matching
`MASTER_KEY`. Without the key, the dump is useless.

1. Take the application offline (`pnpm -C apps/server stop` or your platform's
   stop command).
2. Restore the MySQL dump:

   ```bash
   mysql --user=root --password secrets_manager < backup-YYYYMMDD.sql
   ```

3. Restore `MASTER_KEY` (and `MASTER_KEY_VERSION`) in `apps/server/.env`.
4. Start the server. Smoke-test by reading one secret from each environment.
5. If the backup pre-dates an envelope-encryption migration, run
   `pnpm -C apps/server migrate:envelope` to re-encrypt any legacy rows under
   the new DEK + AAD scheme.

If the dump is partial (some tables, some rows), inspect what survived before
restoring. The `SecretVersion` table is the only one with encrypted data;
other tables (`users`, `api_tokens`, `audit_logs`, etc.) hold hashes or
metadata that can be re-derived or recreated from a different backup.

---

## 4. Building a "rescue kit" you don't need to think about

Most recovery failures are not cryptographic — they are operational. A user
forgot a password, a token was never written down, the key file was on a
laptop that's now in a landfill. The defense is the same in every case:
**redundancy, tested periodically, in independent systems.**

| Asset                | Recommended backup                                                  | Recovery if lost                                  |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| MySQL database       | Nightly `mysqldump` (or managed RDS automated backup) off-host      | Restore from latest dump + MASTER_KEY             |
| `MASTER_KEY`         | Stored in 1Password / AWS Secrets Manager / Vault, **separately** from the DB | Catastrophic — only recoverable from this backup |
| `MASTER_KEY_VERSION` | Same as `MASTER_KEY`                                                | Tied to the key above                             |
| `apps/server/.env`   | Full copy in your secret store, versioned                           | Restore all env vars                              |
| Project API tokens   | Treat like the secrets they unlock; never store unencrypted        | Mint new ones from the web UI                     |
| `secrets login` cache| Not needed — re-login regenerates it                                | N/A                                               |

Test restores **at least once per quarter** by spinning up a fresh MySQL
instance, restoring a dump, pointing a copy of the server at it, and reading
one secret from every project. The first failed test is the one that saves
you.

---

## 5. Backup recipes

### 5.1 MySQL logical backup (daily)

```bash
# Cron entry on the DB host:
0 2 * * * /usr/bin/mysqldump \
  --user=backup --password=... --single-transaction --routines --triggers \
  secrets_manager | gzip > /backups/secrets-$(date +\%Y\%m\%d).sql.gz
```

Push the resulting `.sql.gz` to a different host (S3, Backblaze, rsync).
**Never** store the dump on the same host as the application.

### 5.2 Application secrets (env file)

Don't store `apps/server/.env` in git. Store it in one of:

- **AWS Secrets Manager / SSM Parameter Store** — versioned, audit-logged, IAM
  controlled.
- **HashiCorp Vault** — KV v2 with periodic forced rotation.
- **1Password / Bitwarden** — fine for small teams; use a shared "infra" vault
  with break-glass access logged.

Whatever you pick, the rule is: **the people who can read the dump cannot read
the key, and vice versa.** Otherwise the backup is equivalent to no backup.

### 5.3 Pre-migration snapshot

Before running `pnpm -C apps/server migrate:envelope` (or any future schema
migration that touches encrypted columns), take a full MySQL dump *and* a copy
of the current `MASTER_KEY`. The migration is idempotent, but if anything goes
wrong mid-run, you want both halves to roll back to.

---

## 6. Quick-reference: where each piece lives

| What                       | Where in the code / DB                                       |
| -------------------------- | ------------------------------------------------------------ |
| `MASTER_KEY` / version     | `apps/server/.env` (and your secret store)                  |
| DEK for environment N      | `environments.encrypted_dek` (binary, packed as `iv|tag|ct`) |
| DEK backup (optional)      | `environments.encrypted_dek_backup`                          |
| Secret ciphertext          | `secret_versions.ciphertext` + `iv` + `tag`                 |
| Secret AAD binding         | `env:<envId>;secret_key:<key>`                              |
| DEK AAD binding            | `env:<envId>;secret_id:dek`                                 |
| JWT signing key ciphertext | `auth_signing_keys.private_key_ciphertext` etc.            |
| JWT signing key AAD        | `auth:signing_key:<id>`                                     |
| Provider config ciphertext | `auth_provider_configs` (encrypted blob)                    |
| Provider config AAD        | `auth:provider:<id>`                                        |
| API / CLI token            | Only the **hash** is stored (`api_tokens.token_hash` etc.). Raw value is not recoverable by design. |
| User password              | `users.password_hash` (bcrypt, cost ≥ 12)                   |
| Audit log                  | `audit_logs` — never deleted automatically; respects `audit_retention_days` |

---

## 7. Things this guide cannot help with

- **If the secrets you lost were never stored in the system in the first
  place.** This is a vault, not a mind reader. If you never wrote a value
  down, there is nothing to recover.
- **If the value existed only in transit** (e.g. rotated by an upstream
  provider and never re-entered here). The system can only show you what's
  currently in the database.
- **If the upstream provider is gone** (you deleted the OAuth app, revoked the
  API key, etc.). Rotate the upstream credential first, then re-store the new
  value here.
- **If `MASTER_KEY` and all database backups are gone simultaneously.**
  Without either, the data is mathematically unrecoverable. This is not a
  limitation of the implementation; it is the property that makes the
  encryption worth using.

---

## 8. Prevention checklist

- [ ] MySQL is being backed up on a schedule, **off-host**, with at least 30
      days of retention.
- [ ] `MASTER_KEY` is stored in a system that **cannot** be deleted by the
      same person who has database access.
- [ ] At least two project admins know where the key is stored.
- [ ] A restore drill (full MySQL restore + MASTER_KEY + read every project)
      has been performed in the last 90 days.
- [ ] The application logs are being shipped to a place that survives a host
      loss (e.g. CloudWatch, Datadog, Loki).
- [ ] No production deployment relies on the same `MASTER_KEY` as a
      long-forgotten staging environment.
- [ ] Audit log retention is set (`audit_retention_days`) so that
      investigation is possible after the fact.

If you can tick all of those, you will not need most of this guide.
