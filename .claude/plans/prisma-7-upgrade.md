# Prisma 7 Upgrade Plan

## Context

The CLI is warning that `package.json#prisma` (used for the seed command) will be removed in Prisma 7 and must migrate to a `prisma.config.ts` file. Current version is **6.19.0**. Prisma 7 is a major release with several breaking changes that go beyond just the config file.

This plan covers: (1) silencing the immediate warning in Prisma 6, and (2) everything needed for a full Prisma 7 upgrade.

---

## Impact Summary

### Immediate Warning (Prisma 6, low risk)
The only thing needed to fix the current CLI warning is creating `prisma.config.ts` and moving the seed command out of `package.json`.

### Full Prisma 7 Upgrade (high effort)

| Change | Impact | Files Affected |
|--------|--------|----------------|
| `prisma-client-js` → `prisma-client` generator | Low — rename in one place | `prisma/schema.prisma` |
| `output` path now required in generator | **High** — changes all import paths | All files importing from `@prisma/client` |
| Seed config moves to `prisma.config.ts` | Low — already handled in Phase 1 | `package.json`, `prisma.config.ts` |
| `multiSchema` exits preview (likely GA) | Low — remove from `previewFeatures` | `prisma/schema.prisma` |
| `prisma generate` no longer auto-runs with `migrate dev` | Medium — update scripts | `package.json` scripts |
| `PrismaClientKnownRequestError` import path changes | Medium — search & replace | API routes, server actions |
| Datasource `url`/`directUrl` can move to config | Low — optional but recommended | `prisma/schema.prisma`, `prisma.config.ts` |
| Node ≥ 20.19.0 required | Low — verify CI/prod | CI config, Dockerfile |

---

## Phase 1: Fix the Warning Now (Prisma 6 compatible)

Create `frontend/prisma.config.ts` — Prisma 6 already supports this file:

```typescript
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
```

Then remove the `"prisma"` key from `frontend/package.json`:

```diff
-  "prisma": {
-    "seed": "npx tsx prisma/seed.ts"
-  },
```

**Verification:** Run `npx prisma db seed` and confirm the warning is gone.

---

## Phase 2: Full Prisma 7 Upgrade

### Step 1 — Bump versions

In `frontend/package.json`:
```diff
-  "prisma": "^6.19.0",
-  "@prisma/client": "^6.19.0",
+  "prisma": "^7.0.0",
+  "@prisma/client": "^7.0.0",
```

Run `npm install`.

### Step 2 — Update `prisma/schema.prisma`

```diff
 generator client {
-  provider        = "prisma-client-js"
-  previewFeatures = ["multiSchema"]
+  provider = "prisma-client"
+  output   = "../src/generated/prisma"
 }
```

If `multiSchema` is confirmed GA in Prisma 7, remove it from `previewFeatures`. If still in preview, keep it. Verify in the Prisma 7 release notes.

Optionally move datasource URLs to `prisma.config.ts` (reduces duplication with `.env`):
```typescript
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
    directUrl: process.env.DIRECT_URL,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
```

### Step 3 — Update all `@prisma/client` imports

Since `output = "../src/generated/prisma"`, all import paths change:

```diff
-import { PrismaClient, Prisma, FirmRole } from '@prisma/client'
+import { PrismaClient, Prisma, FirmRole } from '@/generated/prisma'
```

Also update the runtime error import:
```diff
-import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
+import { Prisma } from '@/generated/prisma'
// Use: Prisma.PrismaClientKnownRequestError
```

Create a path alias in `frontend/tsconfig.json` if not already there:
```json
"@/generated/*": ["./src/generated/*"]
```

**Files to update** (search for `from '@prisma/client'`):
- `prisma/seed.ts`
- `app/api/**/*.ts` (connector routes, provision, audit, logo, etc.)
- `app/actions/**/*.ts`
- `lib/prisma.ts` (or wherever PrismaClient singleton is)

### Step 4 — Update `package.json` scripts

Since `prisma generate` no longer auto-runs with `migrate dev`, update:

```diff
-"db:migrate": "prisma migrate dev",
+"db:migrate": "prisma migrate dev && prisma generate",
```

The `build` script already explicitly runs `prisma generate` so it's fine:
```
"build": "prisma generate && NEXT_PUBLIC_BUILD_TIMESTAMP=... next build"
```

### Step 5 — Add `frontend/src/generated/` to `.gitignore`

Generated files should not be committed:
```
# frontend/.gitignore
src/generated/
```

### Step 6 — Run and verify

```bash
cd frontend
npx prisma generate          # generates client to src/generated/prisma/
npm run build                 # full build smoke test
npx prisma migrate dev        # verify migrations still work
npx prisma db seed            # verify seed still works
```

---

## Recommended Approach

**Do Phase 1 now** (5 min, zero risk) to silence the warning while staying on Prisma 6.

**Do Phase 2 as a dedicated PR** — the import path migration across all API routes and server actions is the bulk of the work. Run a global search-and-replace for `from '@prisma/client'` to get a count of affected files before starting.

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/prisma.config.ts` | Create (new) |
| `frontend/package.json` | Remove `prisma` key; update versions; update `db:migrate` script |
| `frontend/prisma/schema.prisma` | Update generator provider, add output, remove multiSchema if GA |
| `frontend/src/generated/` | Auto-generated by `prisma generate` (gitignored) |
| `frontend/tsconfig.json` | Add path alias for `@/generated/*` if needed |
| All files with `from '@prisma/client'` | Update import path to `@/generated/prisma` |
