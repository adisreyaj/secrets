# Task Plan

- [x] Inspect current feature-flag update flow (API + UI) for valueType changes during edit.
- [x] Add API validation to reject valueType transitions between BOOLEAN and JSON on edit/update.
- [x] Update UI edit flow to prevent selecting/changing valueType for existing flags.
- [x] Add or update tests covering forbidden type change attempts.
- [x] Run targeted tests and verify no regressions.

---

# UI Fixes Implementation Plan

## Overview
This plan addresses all issues identified in the UI Audit Report. The work is organized by priority and dependency order.

---

## Phase 1: Critical Fixes (Imports & Package Issues)

### Task 1: Standardize Import Paths
**Priority:** HIGH  
**Files to Modify:** 13 UI components

**Current Issue:** Mixed import patterns
- Some use: `import { cn } from '../../lib/utils'`
- Some use: `import { cn } from '@/lib/utils'`

**Files to Fix:**
1. `button.tsx`
2. `badge.tsx`
3. `input.tsx`
4. `select.tsx`
5. `dialog.tsx`
6. `sheet.tsx`
7. `checkbox.tsx`
8. `switch.tsx`
9. `tooltip.tsx`
10. `textarea.tsx`
11. `table.tsx`
12. `popover.tsx`
13. `calendar.tsx`
14. `json-code-editor.tsx`
15. `dropdown-menu.tsx`

**Action:** Replace all `../../lib/utils` with `@/lib/utils`

**Verification:** Search for remaining relative imports to utils

---

### Task 2: Fix Switch Component Import
**Priority:** HIGH  
**File:** `switch.tsx`

**Current:**
```typescript
import { Switch as SwitchPrimitive } from 'radix-ui'
```

**Required:**
```typescript
import * as SwitchPrimitive from '@radix-ui/react-switch'
```

**Additional Steps:**
1. Install package: `pnpm add @radix-ui/react-switch`
2. Update component code if API differs

**Verification:** Component renders and functions correctly

---

## Phase 2: Add Missing Core Components

### Task 3: Install Label Component
**Priority:** HIGH

**shadcn Component:** `@radix-ui/react-label`

**Installation:**
```bash
cd apps/web
npx shadcn@latest add label
```

**Purpose:** Form accessibility - associate labels with inputs

**Verification:** Component exists and exports correctly

---

### Task 4: Install Skeleton Component
**Priority:** HIGH

**shadcn Component:** Skeleton (no Radix dependency)

**Installation:**
```bash
cd apps/web
npx shadcn@latest add skeleton
```

**Purpose:** Loading state placeholders

**Usage Pattern:**
```tsx
<Skeleton className="h-4 w-[250px]" />
```

**Verification:** Component renders with pulse animation

---

### Task 5: Install Alert Dialog Component
**Priority:** MEDIUM

**shadcn Component:** `@radix-ui/react-alert-dialog`

**Installation:**
```bash
cd apps/web
npx shadcn@latest add alert-dialog
```

**Purpose:** Critical user actions requiring confirmation

**Verification:** Full component set exports (AlertDialog, AlertDialogTrigger, etc.)

---

### Task 6: Install Command Component
**Priority:** LOW

**shadcn Component:** `cmdk` + custom implementation

**Installation:**
```bash
cd apps/web
npx shadcn@latest add command
```

**Purpose:** Search/command palette interface

**Dependencies:**
- `cmdk` package
- Existing Dialog component

**Verification:** Command palette opens and filters correctly

---

### Task 7: Install Progress Component
**Priority:** LOW

**shadcn Component:** `@radix-ui/react-progress`

**Installation:**
```bash
cd apps/web
npx shadcn@latest add progress
```

**Purpose:** Visual progress indicators for async operations

**Verification:** Progress bar renders with correct width

---

### Task 8: Install Separator Component
**Priority:** LOW

**shadcn Component:** `@radix-ui/react-separator`

**Installation:**
```bash
cd apps/web
npx shadcn@latest add separator
```

**Purpose:** Visual dividers between content sections

**Verification:** Horizontal and vertical separators render correctly

---

## Phase 3: Component Fixes

### Task 9: Fix Destructive Button Colors
**Priority:** MEDIUM
**File:** `button.variants.ts`

**Current:**
```typescript
destructive: 'border border-rose-200/10 bg-rose-500/10 text-rose-400...'
```

**Required:**
```typescript
destructive: 'border border-destructive/20 bg-destructive/10 text-destructive hover:border-destructive/30 hover:bg-destructive/20'
```

**Note:** Verify `--destructive` variable exists in both theme files

**Verification:** Button renders with theme-consistent destructive colors

---

### Task 10: Fix Sheet Component Exports
**Priority:** MEDIUM
**File:** `sheet.tsx`

**Current Issue:** `SheetPortal` and `SheetOverlay` are defined but not exported

**Required Addition:**
```typescript
export {
  Sheet,
  SheetPortal,        // ADD
  SheetOverlay,       // ADD
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,        // ADD if missing
  SheetTitle,
  SheetDescription,
}
```

**Verification:** All exports available for import

---

### Task 11: Fix Calendar Caption Label
**Priority:** LOW
**File:** `calendar.tsx`

**Current:**
```typescript
caption_label: 'text-sm ',
```

**Required:**
```typescript
caption_label: 'text-sm font-medium',
```

**Verification:** Calendar month/year label renders correctly

---

## Phase 4: Verification & Cleanup

### Task 12: Run Linting
**Priority:** HIGH

**Commands:**
```bash
cd apps/web
pnpm lint
```

**Fix any issues that arise**

---

### Task 13: Run Type Check
**Priority:** HIGH

**Commands:**
```bash
cd apps/web
pnpm build  # or npx tsc --noEmit
```

**Ensure zero TypeScript errors**

---

### Task 14: Verify Build
**Priority:** HIGH

**Commands:**
```bash
cd apps/web
pnpm build
```

**Ensure build completes without errors**

---

## Dependencies Summary

### New Packages to Install
```bash
# Radix UI primitives
pnpm add @radix-ui/react-label
pnpm add @radix-ui/react-alert-dialog
pnpm add @radix-ui/react-progress
pnpm add @radix-ui/react-separator
pnpm add @radix-ui/react-switch

# Command palette
pnpm add cmdk
```

---

## Success Criteria

- [ ] All UI components use `@/lib/utils` import
- [ ] Switch uses `@radix-ui/react-switch` package
- [ ] Label component exists and is exportable
- [ ] Skeleton component exists and works
- [ ] Alert Dialog component exists and works
- [ ] Destructive button uses CSS variables
- [ ] Sheet exports all sub-components
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Build succeeds

---

## Rollback Plan

If any shadcn installation fails:
1. Check components.json configuration
2. Verify package.json dependencies
3. Run with `--yes` flag: `npx shadcn@latest add [component] --yes`
4. Manual installation from shadcn/ui website as fallback

