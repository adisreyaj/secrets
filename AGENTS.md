# AGENTS.md

## Quick Reference

### Commands

```bash
# Development (portless — stable .localhost URLs)
pnpm dev                    # Web (https://secrets.localhost) via portless
pnpm dev:server            # API (https://api.secrets.localhost) via portless
pnpm dev:full              # Web + API (both via portless)
pnpm dev:plain             # Web (:5173) without portless
pnpm dev:server:plain      # API (:3001) without portless

# Building
pnpm build:web             # Build web app (tsc + vite)
pnpm build:server          # Build server (tsc)
pnpm build:cli             # Build CLI package

# Testing (Vitest)
pnpm test:server           # Run all server tests
pnpm -C apps/server test   # Run server tests in watch mode
pnpm -C apps/web test      # Run web tests in watch mode
# Run single test file:
pnpm -C apps/server vitest run test/auth.core.service.test.ts
pnpm -C apps/web vitest run src/test/router.test.ts

# Linting & Formatting (oxlint + oxc)
pnpm lint:web              # Lint web app
pnpm lint:server           # Lint server
pnpm format:web            # Format web code
pnpm format:check:web      # Check formatting

# Database (Drizzle + Turso/libSQL)
pnpm db:generate           # Generate Drizzle migrations from schema
pnpm db:migrate            # Apply migrations
pnpm db:push               # Push schema (dev / fresh DB)
pnpm -C apps/server migrate:envelope  # One-time: re-encrypt existing secrets under DEK + AAD (run after deploy)
```

### Tech Stack

- **Web**: React 19 + TypeScript 5.9 + Tailwind 4 + Vite
- **Server**: Fastify 5 + Drizzle + Turso/libSQL + TypeScript (NodeNext)
- **Testing**: Vitest + Testing Library (jsdom for web, node for server)
- **Linting**: oxlint + oxc (not ESLint/Prettier)

## Code Style Guidelines

### Imports

**Use path aliases:**
```typescript
// ✅ Good
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ❌ Bad
import { cn } from '../../lib/utils'
import { Button } from '../../../components/ui/button'
```

**Import order:**
1. React/Node built-ins
2. Third-party packages (alphabetical)
3. Internal aliases (`@/lib`, `@/components`)
4. Relative imports (sibling files only)
5. Type-only imports: `import type { Foo } from '...'`

### Naming Conventions

- **Components**: PascalCase (`Button.tsx`, `AlertDialog.tsx`)
- **Hooks**: camelCase starting with `use` (`useTheme.ts`)
- **Utils**: camelCase (`formatDate.ts`)
- **Types**: PascalCase with type suffix (`UserDto.ts`, `ButtonProps.ts`)
- **Test files**: Same name + `.test.ts` (`auth.service.test.ts`)
- **Constants**: SCREAMING_SNAKE_CASE for exports

### Types & Interfaces

```typescript
// Prefer interfaces for component props
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

// Use type for unions/tuples
type Theme = 'light' | 'dark' | 'system'

// Always export types that are part of public API
export type { Theme }
```

### Component Structure

```typescript
import * as React from 'react'

// 1. Forward ref pattern
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    return <button ref={ref} className={cn('base', className)} {...props} />
  }
)

// 2. Set displayName
Button.displayName = 'Button'

// 3. Export at bottom
export { Button }
```

### Error Handling

```typescript
// Server: Use Fastify's error handler pattern
// Return structured errors with codes
return reply.status(400).send({ 
  error: 'VALIDATION_ERROR', 
  message: 'Invalid input' 
})

// Client: Use React Query error handling
// Prefer throwing in loaders/mutations
```

### Testing Patterns

**Server tests:**
```typescript
import { describe, expect, it, vi } from 'vitest'

// Mock at top level with vi.hoisted
vi.mock('../src/db.js', () => ({ ... }))

describe('service', () => {
  it('should do something', async () => {
    // Arrange
    const input = { foo: 'bar' }
    
    // Act
    const result = await serviceFunction(input)
    
    // Assert
    expect(result).toEqual(expected)
  })
})
```

**Web tests:**
```typescript
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />)
    expect(screen.getByText('Label')).toBeInTheDocument()
  })
})
```

### Tailwind & Styling

```typescript
// Use cn() utility for all class merging
className={cn('base-classes', conditional && 'conditional-class', className)}

// shadcn/ui components use CSS variables
// Colors: bg-background, text-foreground, border-border
// Don't hardcode colors - use theme tokens
```

### Git Workflow

1. **Plan**: Write tasks to `tasks/todo.md` for 3+ step tasks
2. **Verify**: Run tests before committing
3. **Commit**: Small, focused commits with clear messages
4. **No force push**: Never force push to main

### Key Constraints

- **TypeScript**: Strict mode enabled, no `any` without justification
- **Node**: >=20.19 required
- **Package manager**: pnpm only (10.28.2)
- **Monorepo**: Workspaces in `apps/*` and `packages/*`

### Drizzle / Database

- Schema in `apps/server/src/db/schema.ts` (enums in `apps/server/src/db/enums.ts`)
- After schema changes: `pnpm db:generate` then `pnpm db:migrate` (or `pnpm db:push` for local/dev)
- Client: `import { db } from '../db/index.js'`
- Local: `DATABASE_URL=file:./data/local.db` · Turso: `libsql://...` + `DATABASE_AUTH_TOKEN`

### Environment Variables

- Web: `.env` in `apps/web/` (Vite: `import.meta.env.VITE_*`)
- Server: `.env` in `apps/server/` (dotenv)
- Never commit secrets - use `.env.example` as template
- `DATABASE_URL` is Turso/libSQL (file DB or remote); optional `DATABASE_AUTH_TOKEN` for Turso cloud

### Encryption (Envelope + AAD)

All secret ciphertexts are AES-256-GCM with a 12-byte IV, 16-byte auth tag, and a
mandatory AAD string that binds the ciphertext to its context.

- `MASTER_KEY` (env var, 32 raw bytes / 64 hex chars) is the **KEK** — it never
  touches secret data directly.
- Each `Environment` has a 32-byte **DEK** stored in `Environment.encryptedDek`,
  encrypted with the KEK under AAD `env:<envId>;secret_id:dek`.
- Secrets inside an environment are encrypted with that environment's DEK under
  AAD `env:<envId>;secret_key:<key>`.
- When a secret's key is renamed, every historical `SecretVersion` is re-encrypted
  with the new AAD to keep the binding deterministic.
- Auth provider configs use `aadForGeneric({ provider, projectId, scope: 'auth_provider_config' })`.
- JWT signing keys use `auth:signing_key:<kid>`.
- All decrypt paths throw `DecryptionError`; `apps/server/src/server/http/middleware.ts`
  maps that to a 500 with no ciphertext leak.
- Key rotation: just re-encrypt the DEK under a new KEK version. Secret ciphertexts
  stay the same. See `envCrypto.ts` and the `migrate:envelope` script.
