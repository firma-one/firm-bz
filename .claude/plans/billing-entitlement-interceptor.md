# Plan: Route Interceptor for Billing Entitlements

**Status:** Not started. Written 2026-09-26 after two enforcement gaps shipped in one evening.

---

## 1. The problem

Entitlement checks are scattered `assert*` calls that each route must remember:

```ts
await assertWithinDocumentCap(orgId, 1)
await prisma.engagementDocument.create({ data: { firmId: orgId, … } })
```

Nothing enforces that the first line exists. On 2026-09-26 an audit found **5 document write
paths, only 3 guarded**:

- `index-file` — creates via upsert, accepts a `files` array, **no cap check at all**. The bulk
  indexing route, and the one path where a free-tier user could create unbounded documents.
- `documents/[documentId]/sharing` — creates on its `else` branch. It *looked* guarded because
  `assertWithinDeliverableCap` appears in the file, but that check sits on a different branch.

Both are now fixed (`e59b07d9`). The point is that neither was found by the design — they were
found by manually cross-referencing `engagementDocument` writes against cap call sites.

The same failure had already happened with AI metering: `recordAiUsage` was wired at one of four
call sites for two days (`7fb30703`). Fixed structurally by moving the gate onto the model client
(`getGuardedAnthropic`), which is the precedent this plan follows.

### Current call sites

| Cap | Sites | Risk |
|---|---|---|
| `assertWithinDocumentCap` | 9 | **High** — 5 write paths, 2 were missed |
| `assertWithinActiveEngagementCap` | 2 | Low |
| `assertWithinClientCap` | 2 | Low |
| `assertWithinFirmGroupCap` | 1 | Low |
| `assertWithinClientContactCap` | 1 | Low |
| `assertWithinDeliverableCap` | 1 | Low |

Risk is concentrated in documents because documents are created through many routes (Drive import,
linked files, intake, create-link, index-file). The other entities have one obvious creation path
each, where a missing check would be noticed immediately.

---

## 2. Two designs considered, and a correction

### 2a. Route interceptor — VIABLE (corrected)

I twice argued this did not fit. **Both objections were wrong**, and the record matters so the
next person does not re-derive them:

- **"It would duplicate the firmId lookup."** Wrong. It was true of the code as written —
  `resolveProjectContext` is a plain uncached function — but React `cache()` makes repeat calls
  within one request execute once. The duplication is an implementation detail, not a property of
  the pattern. (No `cache()` usage exists in the codebase yet; this would introduce it.)
- **"It would run the cap check before the permission check."** Wrong, because it assumed a
  cap-only interceptor. `requireProjectManage(request, projectId)` **already does auth AND returns
  the context containing `firmId`**, in that order. An interceptor that calls it gets both, in the
  correct sequence, in one place.

The shape:

```ts
export const POST = withProjectGuard(
  { cap: 'document', count: (body) => body.files?.length ?? 1 },
  async (request, { ctx, user, body }) => { … }   // firmId resolved and authorised already
)
```

**It is arguably better than the repository option**, because it also removes the duplicated
`requireProjectManage` call every project-scoped route makes today.

### 2b. Guarded repository — also viable

Put the check at the write rather than the route, following `getGuardedAnthropic`:

```ts
await documents.create({ data: { firmId, … } })   // check is not optional
```

`firmId` is already in `data`, so nothing is re-resolved, and `createMany` knows its own batch
size. Narrower blast radius than the interceptor: it touches the 5 document write paths rather
than every project-scoped route.

### Recommendation

**Start with the interceptor (2a)** for project-scoped routes, since it subsumes auth and cap in
one place and removes existing duplication. Reassess the repository afterwards — if the interceptor
covers every document write path, the repository may be redundant.

---

## 3. Open questions to settle before building

1. **Request body.** `count` needs the body, and reading it in the interceptor consumes the stream
   the handler then cannot read. Parse once in the interceptor and pass `body` through.
2. **Non-project routes.** `connectors/google-drive/import` has no `projectId` in the URL; it
   resolves `firmId` from a folder lookup on a body value. Needs either a second interceptor
   variant or an explicit escape hatch.
3. **Upsert semantics.** Already solved in `index-file` (`5ef8072e`): only genuinely new
   `externalId`s count, because re-indexing existing files creates nothing and a firm at its cap
   would otherwise be blocked from re-indexing. **The interceptor must preserve this** — a naive
   `count: (body) => body.files.length` reintroduces the bug.
4. **Scope.** All six caps, or documents only? The other five have one call site each.

---

## 4. Related cleanup (do NOT bundle)

`organizationId` is the old name for `firmId` — **298 occurrences**. A blind rename is unsafe:

- It appears in **Inngest event payloads** (`lib/inngest/types.ts`), which cross a process
  boundary. Events queued before a deploy carry the old key.
- It appears in **request body keys**, where renaming breaks callers.
- **A dozen files already use both names**, so a mechanical rename risks colliding or silently
  merging two distinct values.

Phased, following the `sandboxOnly` → `isAnchorFirm()` precedent
(`.claude/plans/refactor-is-anchor-firm.md`, same problem at 165 references):

- **Phase 1:** internal variables and function parameters only. No wire formats.
- **Phase 2:** Inngest payloads, accepting both keys for one deploy cycle.
- **Phase 3:** request body keys, same dual-accept approach.

One local variable was renamed in `index-file` (`3cf4c543`) because that file was being edited
anyway. Everything else is untouched.

---

## 5. Verification

- Every `engagementDocument` write path is reachable only through a guarded path.
- Re-indexing existing documents at the cap still succeeds (regression guard for `5ef8072e`).
- An unauthorised user gets 403, not a cap message — the cap must never leak that a firm exists
  or is at its limit.
- A batch that would straddle the cap is rejected whole, not partially applied.
