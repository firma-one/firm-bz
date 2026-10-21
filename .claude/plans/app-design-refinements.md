# App design refinements: Notion's language, a little more feedback

Status: **draft for Deepak's review** (2026-10-21). Nothing is built yet.

**Direction, revised 2026-10-21 (later):** stay conservative. Keep Notion's design language: black,
gray and white, with Notion's colored chips (tags). No new color: no gradients, no colored rings or
glows, no tinted fills, no accent-colored Brio treatment. The firm's theme color stays only where it
already is (primary buttons, links, focus rings). What remains is structure, feedback and motion.

Mockups: the "App Design Refinements" canvas (https://claude.ai/artifact/4o62ia8m5eLBaYXCna1uo2),
redrawn in this direction on 2026-10-21: the refined Engagement Overview, the Action Center (today vs
the Linear-style list), Brio's byline, and the Board (Notion card shadow, a hovered card, a just-approved
card and its toast). The earlier colorful boards (tiles, gradient Brio edge, accent ring, theming) are
removed.

Scope: the authenticated app (`app/(app)`), across every screen. Not the marketing site, `/tour` (it
reuses the app's shell pieces and picks the changes up), legal pages or `/system`.

This plan **amends `.claude/plans/ui-ux-overhaul.md`** (Phase 6) in two places: line 317 "Cards have
none (border only)" gains the Notion card shadow for draggable and openable cards (below), and line
320 "120ms ease on hover … remove the arrival animations" gains the motion tokens and the one expand
transition. Line 683 ("no shadow on in-page cards") still holds for page sections.

---

## 1. Principles

1. **Notion's palette, unchanged.** Black, warm grays and white; Notion's tag colors for chips and
   statuses. No new hues, no gradients.
2. **Red only for danger,** as today (overdue, destructive, errors).
3. **Depth means you can pick it up.** Cards you open or drag (Board cards, Home "Continue" cards,
   gallery and workspace cards) get Notion's own card shadow,
   `0 0 0 1px rgba(15,15,15,.1), 0 2px 4px rgba(15,15,15,.1)`, and a warm hover background, as
   Notion's boards and galleries do. No lift, no glow. Page sections stay flat.
4. **Work queues stay Linear.** The Action Center, Inbox and Home "Needs you" are dense lists with the
   count at the end of the row. (Decision A.)
5. **Brio says what it wrote, in plain text.** A byline on Brio-written content; no special colors or
   edges.
6. **Every approval gives feedback.** Several approve actions are silent today; each gets a toast and,
   where the item is on screen, its Notion green "Approved" chip appearing.
7. **Motion is quiet, tokenized and respects reduced motion,** including framer-motion, the toast tick
   and `tailwindcss-animate` (none of which do today).

## 2. Tokens (app/ui-tokens.css + tailwind.config.js)

| Token | Value | Use |
|---|---|---|
| `--ui-shadow-card` | `0 0 0 1px rgba(15,15,15,.1), 0 2px 4px rgba(15,15,15,.1)` | Cards you open or drag |
| `--ui-ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Expands and enters |
| `--ui-dur-fast/base/slow` | `120ms / 200ms / 320ms` | Hover / enter / expand |

Tailwind: `shadow-card`, `ease-ui-out`, `duration-ui-*`. No color tokens are added.

## 3. Shared pieces

- **`InteractiveCard`** (new, `components/ui/interactive-card.tsx`): `rounded-card` with
  `shadow-card` and the warm hover background (`surface-hover`), plus the focus ring. Replaces the
  hand-rolled classes in `ContinueSection`, the `ClientList` gallery, `WorkspaceCard` and `FirmList`,
  and is the shell of the Board's `DraggableCard`. (Their current `border` + `hover:border-line-strong`
  becomes the shadow's 1px ring.)
- **`ActionSection`** (`components/dashboard/action-list.tsx`, shared by the engagement and firm
  Action Centers): one list, one row per check (icon, label, short muted explanation, count at the
  end), hover background. Delivery and Housekeeping merge into one list and are grouped only inside
  the disclosure. The "N checks passed" disclosure gets a height-and-fade transition
  (`--ui-dur-slow`) and a turning chevron; the clear checks inside are muted rows with a gray check.
  Severity stays in the icon color (red only for critical, as today).
- **`BrioByline`** (new, next to `components/ui/brio.tsx`): "Written by Brio · reviewed and published
  by {name} · {date}" in the muted text color, under Brio-written content. The `<Brio>` mark itself is
  unchanged.
- **Approval feedback** (`lib/ui/use-approval-feedback.ts`): one helper that shows the success toast
  and, when the item is on screen, lets its "Approved" chip fade in. No rings or celebrations.
- **Toast** (`components/ui/toast.tsx`, ~30 callers): the success tick gets a reduced-motion fallback.
- **Motion:** wrap the app shell in framer's `<MotionConfig reducedMotion="user">`, and add one
  `motion-reduce` rule for the `tailwindcss-animate` enter/exit classes.

## 4. Rollout by surface (highest traffic first)

| # | Surface | Change |
|---|---|---|
| 1 | Engagement Overview Action Center (`EngagementActionCenterV2`) and Firm Overview `FirmActions` | The `ActionSection` list above |
| 2 | Board (`DraggableCard`, `engagement-shares-tab.tsx`) | `InteractiveCard` shell (Notion card shadow); approval feedback on drag to Approved (admins get **no feedback today**); the drag overlay uses `shadow-card` scaled up instead of `shadow-xl`; the hard-coded Approved-lane tint `#0d9f5f` moves to Notion's green tag token |
| 3 | Engagement Summary card and Publish (`engagement-insights-dashboard.tsx`, `summary-draft-review.tsx`) | `BrioByline`; publishing gets a toast (none today) |
| 4 | Home "Continue where you left off" (`home-view.tsx`) | `InteractiveCard` |
| 5 | Deliverable detail pane (stage Select, document status) | Approval feedback; document approval has **no feedback today** |
| 6 | Client intake Approve buttons (`handleIntakeAction`) | Approval feedback; **none today** |
| 7 | Firm Overview brief (`ai-firm-brief.tsx`) | Its existing "Written by Brio …" footer moves to `BrioByline` styling (no publisher: the brief has no review step) |
| 8 | Toast | Reduced-motion fallback |
| 9 | Pickers and galleries (`WorkspaceCard`, `ClientList` gallery, `FirmList`) | `InteractiveCard` |
| 10 | Files: Brio task cards (`agent-prompt-card.tsx`, still on legacy gray classes) | Move to the app's tokens |

Unchanged on purpose: the Ask Brio launcher and panel, status tags and Board lane colors (Notion's
hues), engagement and firm Overview cards (flat).

## 5. Data change (for the byline)

- The engagement summary already stores `publishedByUserId`, `source ('ai'|'manual')` and the draft's
  `reviewedByUserId` in `Engagement.settings.insightsSummary` (`lib/ai/engagement-summary.ts`).
- The insights API (`lib/insights/engagement-insights.ts`) sends only the text and `publishedAt`.
  Add `source` and the publisher's display name (members are already loaded there). No migration.
- Show the byline only when `source` is `'ai'`; a hand-edited summary says "Edited by {name}".
  Older records without `publishedByUserId` show "Written by Brio · {date}".
- Everyone who can see the summary sees the byline, clients included (Decision D).

## 6. Decisions

- **A. Action Center.** Decided 2026-10-21: the Linear-style list.
- **B. Brio's color.** Superseded by the conservative direction: Brio gets no new color treatment;
  the `<Brio>` mark stays as it is.
- **C. Status tags.** Decided 2026-10-21: keep Notion's hues (Board lanes included).
- **D. Byline for client users.** Decided 2026-10-21: everyone sees the publisher's name.
- **E. Branch.** Decided 2026-10-21: ship the website overhaul first, then start this on a fresh
  branch from the updated `dev`.

## 7. Order of work

1. Tokens, Tailwind names, `MotionConfig` and the reduced-motion rule.
2. `InteractiveCard`, the `ActionSection` list and transition, `BrioByline`, approval feedback, toast.
3. Surfaces 1–3 (the engagement pages), then 4–10.
4. Amend the two lines in `ui-ux-overhaul.md` and point them here.
5. Checks: `tsc`; the existing component tests (`firm-actions.test.tsx` and friends); new tests for the
   byline mapping and the merged Action Center list; a browser pass on `/tour` with reduced motion on
   and off.
