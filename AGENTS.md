# AGENTS.md

## Quick Reference

### Commands

```bash
# Development
pnpm dev                    # Start web + server in parallel
pnpm dev:web               # Web only (Vite)
pnpm dev:server            # Server only (Fastify + TypeScript watch)

# Building
pnpm build:web             # Build web app (tsc + vite)
pnpm build:server          # Build server (tsc + prisma)
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

# Database
pnpm prisma:generate       # Generate Prisma client
pnpm prisma:migrate        # Run migrations
```

### Tech Stack

- **Web**: React 19 + TypeScript 5.9 + Tailwind 4 + Vite
- **Server**: Fastify 5 + Prisma + TypeScript (NodeNext)
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

### Prisma / Database

- Schema in `apps/server/prisma/schema.prisma`
- After schema changes: `pnpm prisma:migrate` then `pnpm prisma:generate`
- Use Prisma types in DTOs: `ProjectDto`, `EnvironmentDto`

### Environment Variables

- Web: `.env` in `apps/web/` (Vite: `import.meta.env.VITE_*`)
- Server: `.env` in `apps/server/` (dotenv)
- Never commit secrets - use `.env.example` as template
