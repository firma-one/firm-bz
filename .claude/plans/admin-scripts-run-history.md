# Admin Scripts: Persisted Run History

## Context

`/system/admin-scripts` (`app/(app)/system/admin-scripts/page.tsx`, `app/api/system/admin-scripts/[scriptId]/route.ts`, `lib/admin-scripts/index.ts`) already lets a sysadmin list registered one-off scripts and run them server-side in the real prod runtime — no local script + prod `DATABASE_URL` needed. Each script exports `run(): Promise<ScriptResult>` (`{ status, summary: Record<model, {processed, skipped, errors}>, durationMs, error? }`), registered as `{ id, name, description, run }` in `lib/admin-scripts/index.ts`.

The gap: `ScriptResult` is computed live and returned in the HTTP response only — nothing is persisted. There's no "last run" history anywhere (no timestamp, no status, no who-ran-it, no summary) once the browser tab closes. Discovered while scoping the OneDrive guest pre-invite backfill (`.claude/plans/connector-microsoft-impl.md`, item 19, Part 4) — the first script added to this registry since it launched, and the first time this gap actually mattered in practice.

Worth its own small plan rather than folding into the backfill script, since every future admin script benefits from it, not just this one.

## Approach

Add a Prisma model to log each run, and write to it from the existing POST route — no changes needed to the script `run()` contract itself, and no changes to how scripts are registered.

### Schema change

New model, e.g.:

```prisma
model AdminScriptRun {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scriptId        String
  triggeredByUserId String @db.Uuid
  startedAt       DateTime @default(now())
  finishedAt      DateTime?
  status          String   // 'running' | 'success' | 'error'
  summary         Json?    // ScriptResult.summary, once finished
  durationMs      Int?
  error           String?  @db.Text
  dryRun          Boolean  @default(false)

  @@index([scriptId, startedAt])
  @@map("admin_script_runs")
  @@schema("platform")
}
```

Per this repo's Prisma-migration rule: `npx prisma migrate dev --name add_admin_script_run --create-only`, review the generated SQL, do not apply directly — user runs `npm run build` to apply, same as every other migration.

### Route changes

`app/api/system/admin-scripts/[scriptId]/route.ts`'s POST handler:
1. Before calling `script.run()`, insert an `AdminScriptRun` row with `status: 'running'`, `triggeredByUserId` from the already-resolved sysadmin session.
2. After `run()` resolves (success or thrown), update that row: `status`, `summary`, `durationMs`, `error`, `finishedAt`.
3. Keep returning the same `ScriptResult` shape in the HTTP response — the UI's existing render logic (status banner, per-model table) is untouched. This is additive persistence, not a response-shape change.

### UI changes

`app/(app)/system/admin-scripts/page.tsx`: add a collapsible "Run history" section per script card (or a shared history table below the list), fetched from a new `GET /api/system/admin-scripts/[scriptId]/runs` route — shows past runs (timestamp, triggered-by, status, duration, summary) so a sysadmin can confirm a script's last real execution without needing the browser tab that triggered it still open.

Reuse the existing per-model summary table rendering (`page.tsx` lines ~151-189) for historical runs too, rather than building a second table format.

### Dry-run mode

Scripts that call live external APIs (e.g. `onedrive-guest-backfill.ts`, which calls Graph) are riskier to run blind than the existing `encrypt-backfill.ts`, which only touches the local DB. Add a dry-run capability to the runner itself, not just this one script:

- Extend `AdminScript['run']` to accept an options param: `run: (opts?: { dryRun?: boolean }) => Promise<ScriptResult>`. Existing scripts (`encrypt-backfill.ts`) ignore the param — no behavior change, since a DB-only backfill has no external side effect to gate.
- A dry-run-aware script (like `onedrive-guest-backfill.ts`) checks `opts?.dryRun` and, when true, runs its full discovery/filtering logic (connector lookup, member/email resolution, eligibility filtering) but skips the actual external call (`adapter.preInviteGuest(...)`), counting matched rows as `processed` in the returned summary so the sysadmin can see exactly what a live run would touch — without mutating anything or hitting Graph.
- UI: add a "Dry Run" toggle or a second button (e.g. "Preview" next to "Run") on `page.tsx`, defaulting to dry-run **on** for any script that declares it supports dry-run (new `AdminScript.supportsDryRun?: boolean` field) — requires an explicit switch to "Live Run" before it fires. Scripts without `supportsDryRun` (e.g. `encrypt-backfill`) keep today's single "Run" button, unchanged.
- `AdminScriptRun` gains a `dryRun Boolean @default(false)` column so history correctly distinguishes preview runs from real ones — a dry run should never be mistaken for confirmation that guests were actually pre-created.
- Route (`[scriptId]/route.ts` POST): accept `{ dryRun?: boolean }` in the request body, pass through to `script.run(opts)`, and persist the flag on the `AdminScriptRun` row.

## What does NOT change

- `AdminScript`/`ScriptResult` interface, script registration pattern, or any existing script's `run()` implementation (including the newly-added `onedrive-guest-backfill.ts`).
- Auth gate (`isSysAdminUser()`) — unchanged, the new `runs` GET route reuses the same check.

## Regression Risk

**None to existing functionality.** Purely additive: new table, new write path in an existing route (wrapped so a persistence failure doesn't block the script's actual execution or response), new read-only history UI. No existing script behavior changes.

## Verification

1. `npx tsc --noEmit` clean after the migration + route + UI changes.
2. Run the existing `encrypt-backfill` script from the UI — confirm a new `AdminScriptRun` row is created and correctly finalized (status/summary/durationMs match what the UI already showed live), `dryRun: false`, and no dry-run toggle appears for it.
3. Run `onedrive-guest-backfill` in dry-run mode — confirm the summary reflects real matched-member counts with zero Graph calls made (check server logs for absence of `preCreateGuestInvitation` calls), and the history row is marked `dryRun: true`.
4. Run `onedrive-guest-backfill` live — confirm it now actually calls Graph and the history row is marked `dryRun: false`.
5. Trigger a script that throws — confirm the run row still finalizes with `status: 'error'` and the error message, rather than being left stuck at `'running'`.
6. Confirm the history UI shows past runs after a page refresh (i.e. actually reads from the DB, not just in-memory state), correctly distinguishing dry runs from live runs.
