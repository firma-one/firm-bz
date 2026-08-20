# Members UI: Simplify to 3 Roles with Internal/External Contributor Choice

## Context

The engagement member system has 4 underlying `EngagementRole` DB values (`eng_admin`, `eng_member`, `eng_ext_collaborator`, `eng_viewer`), each backed by a `Persona` row (`eng_admin` → "Engagement Lead", `eng_member` → "Contributor (Internal)", `eng_ext_collaborator` → "Contributor (External)", `eng_viewer` → "Reviewer"). Today's invite/change-role UI presents all 4 as separate flat options — this asks an inviter to pick between "Contributor (Internal)" and "Contributor (External)" as two unrelated list items, when they're really one role with a yes/no sub-choice.

Goal: collapse the UI to 3 top-level roles — **Owner**, **Contributor**, **Reviewer** — where choosing Contributor reveals a second, explicit Internal/External radio choice (with a tooltip explaining each), rather than making internal-vs-external a peer choice alongside Owner/Reviewer. Pure UI/labeling simplification — **no DB schema change**, no new migration. The `Persona` table (`prisma/schema.prisma`, global/firm-shared, keyed by `slug`) and all 4 role slugs stay exactly as they are; only how they're grouped and labeled in the UI changes.

## Mapping

| UI role | DB persona slug | Notes |
|---|---|---|
| Owner | `eng_admin` | No internal/external sub-choice — always a single option (unconfirmed whether external Owners are ever assigned in practice; verify during implementation, but no code today suggests it). |
| Contributor → Internal | `eng_member` | Radio choice within Contributor. |
| Contributor → External | `eng_ext_collaborator` | Radio choice within Contributor. |
| Reviewer | `eng_viewer` | No internal/external sub-choice in scope for this plan — `isExternalEngagementRole()` (`lib/engagement-access.ts`) already treats `eng_viewer` as external-capable today, so a future need for "Reviewer (Internal)" vs "(External)" is plausible, but not requested here; flag as a known open question, don't build it speculatively. |

Selecting a UI role directly resolves to one underlying persona `id`/`slug` — the radio choice for Contributor **is** the mechanism that picks between `eng_member` and `eng_ext_collaborator`, not a separate flag layered on top. This keeps `updateMemberPersona`/`inviteMember`'s existing persona-id-based APIs unchanged.

## Where this lives in code today (confirmed via research)

- **Invite flow**: `components/projects/members/invite-member-modal.tsx` — currently a flat `Select` dropdown over `personas: ProjectPersonaWithRole[]`, rendering `p.displayName` directly as each option's label. `getPersonaIcon` does brittle `displayName.includes('Owner')`/`.includes('Internal')` string-matching — a real latent bug this plan should also fix in passing (see below), since relabeling would silently break it further.
- **Change-role flow**: same underlying pattern, in `components/projects/members/member-list.tsx` (~lines 407-451) — a `Dialog` with a `RadioGroup` listing all 4 personas flat, each row pairing a `Label` with an `Info`-icon `Tooltip` showing the persona's `description`. Submits via `updateMemberPersona(memberId, personaId)` (`lib/actions/members.ts`).
- **Personas data**: `Persona` model (`prisma/schema.prisma:493-506`, schema `platform`, table `personas`) — global, `slug`-unique, no `firmId` column, so no per-firm override to account for. Seeded in `prisma/seed.ts:13-19`.
- **Existing radio+tooltip pattern**: already built in `member-list.tsx`'s change-role dialog (`RadioGroup`/`RadioGroupItem` from `@/components/ui/radio-group` + `Tooltip`/`TooltipTrigger`/`TooltipContent` from `@/components/ui/tooltip`) — reuse this exact pattern for the new Internal/External sub-radio, don't invent a new one.
- **Slug-based convention elsewhere**: `lib/permissions/persona-map.ts` already keys off `role.slug`, not display name — the correct pattern to follow for the new grouping logic (group-by-slug, not group-by-parsing-displayName).

## Approach

### 1. Grouping logic (shared, not duplicated per-component)

New small helper, e.g. `lib/persona-ui-groups.ts`:
```ts
export const PERSONA_UI_GROUPS = {
  eng_admin: { uiRole: 'owner', label: 'Owner' },
  eng_member: { uiRole: 'contributor', subRole: 'internal', label: 'Contributor', subLabel: 'Internal' },
  eng_ext_collaborator: { uiRole: 'contributor', subRole: 'external', label: 'Contributor', subLabel: 'External' },
  eng_viewer: { uiRole: 'reviewer', label: 'Reviewer' },
} as const
```
Both the invite modal and the change-role dialog import this instead of rendering `persona.displayName` directly or string-matching it — fixes the existing `getPersonaIcon` brittleness as a side effect, since icon selection can now switch on `uiRole`/`subRole` instead of parsing `displayName`.

### 2. Invite modal (`invite-member-modal.tsx`)

Replace the flat `Select` with: a 3-option primary control (Owner / Contributor / Reviewer — could stay a `Select` or become 3 cards/radio, whichever matches the existing modal's visual density) — and when Contributor is selected, reveal a second `RadioGroup` (Internal / External), each option's `Label` paired with an adjacent `Tooltip` (`Info` icon) explaining the distinction (e.g. Internal: "Firm team member, full workspace access" / External: "Client-side collaborator, engagement-scoped access" — exact copy TBD during implementation, pull from the existing `Persona.description` fields as a starting point rather than inventing new copy from scratch). The final selected persona `id` (resolved from the DB-fetched `personas` list by matching slug, not hardcoded) is what actually gets submitted — no new persona records, no new API shape.

### 3. Change-role dialog (`member-list.tsx`)

Same restructuring: primary 3-way choice, Contributor reveals the Internal/External sub-radio (reusing the dialog's own existing `RadioGroup`/`Tooltip` pattern, per the research above — literally the same components, just regrouped). Pre-select the correct primary + sub-radio state from the member's *current* persona slug when the dialog opens, so editing an existing External Contributor correctly shows "Contributor" + "External" pre-selected, not a blank/default state.

### 4. Badge display (member list rows)

No dedicated badge component exists today (confirmed — just inline pill `<span>`s). Add a small "Internal"/"External" badge next to a Contributor member's name/role text in the list row, using the existing inline-pill visual style already used elsewhere in the same file (`inline-flex rounded bg-[#f3f4f6] ...`) rather than building a new component. Owner and Reviewer rows show no sub-badge (no internal/external distinction for those roles in this plan's scope).

## What does NOT change

- `Persona` table, `EngagementRole` enum, all 4 role slugs, `updateMemberPersona`/`inviteMember`/`getProjectPersonas` signatures — zero schema or backend API changes.
- Reviewer stays a single option, no internal/external split (flagged as a possible future need, not built here).
- Owner stays a single option (verify during implementation that no external `eng_admin` assignments exist in practice; if they do, that's a separate finding to raise before shipping, not something to silently paper over).
- Item 19's `isExternalEngagementRole()` (`lib/engagement-access.ts`) and everything downstream of it (guest pre-invite, safety-count queries on removal) — these already key off the role slug, completely unaffected by a pure UI relabeling.

## Verification

1. `npx tsc --noEmit` clean.
2. Invite flow: select Owner → submits `eng_admin`. Select Contributor → Internal → submits `eng_member`. Select Contributor → External → submits `eng_ext_collaborator`. Select Reviewer → submits `eng_viewer`. Confirm each results in the correct `EngagementMember.role` in the DB (no regression from today's flat-list behavior, just a different picker UI).
3. Change-role flow: open the dialog on an existing External Contributor — confirm it pre-selects Contributor + External, not blank. Switch to Internal, save, confirm the member's role actually updates to `eng_member`.
4. Member list badges: confirm Internal/External badge shows correctly next to Contributor members, and no badge shows for Owner/Reviewer rows.
5. Confirm `getPersonaIcon`'s existing string-matching bug is actually fixed (icons render correctly for all 4 roles after the relabel), not just avoided by coincidence.
6. Manual visual check: tooltip text is legible and correctly positioned beside each Internal/External radio option, matching the existing tooltip pattern's look elsewhere in the same dialog.
