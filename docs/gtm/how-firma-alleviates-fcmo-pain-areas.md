# How firmä Alleviates Fractional CMO Pain Areas

## Slide Brief — for claude.ai/design

---

## Slide Content

### Headline
**firmä was built for exactly this.**

### Sub-headline
Every structural gap in this research has a direct answer in the platform.

---

### Pain → Solution Mapping (5 rows)

| # | Pain (from research) | Stat | firmä Answer |
|---|---|---|---|
| 1 | Coordinating reviews & approvals is the #1 source of friction | 93% | **DocComments + Audit Log** — per-document async comment threads; every action is time-stamped and append-only |
| 2 | Work delivered via raw Drive links with zero delivery layer | 96% | **Branded Client Portal** — your logo, your brand; clients access a structured workspace, not a folder link |
| 3 | Client access never revoked after engagements end | 63% | **One-click Wrap** — closing an engagement instantly revokes all guest Google Drive permissions |
| 4 | No dedicated client portal exists in the market | 70% had never heard of one | **Engagement Workspaces** — Firm → Client → Engagement → Document; built-in structure from day one |
| 5 | 50+ hours/year lost to admin: resharing, version confusion, recreating context | 100% lose measurable time | **Engagement Templates + Shares Dashboard** — standardise delivery; track every share in one place |

---

### "Also included" strip (3 items, below the main table, above the footer callout)

A compact horizontal row of 3 feature chips — no stats, just feature name + one-line description. Visually lighter than the main table rows.

| Feature | One-line description |
| --- | --- |
| **Persona Access Control** | Four roles (Project Lead, Team Member, External Collaborator, Guest) — invite anyone, expose only what they should see |
| **Action Centre** | One dashboard surfaces every pending approval, due date, and share across all active engagements |
| **Semantic Search** | Find any document across all engagements by meaning, not just filename |

---

### Footer callout (boxed, below the strip)

> **Non-custodial by design.** Files never leave your Google Drive.  
> firmä is the structured delivery layer on top — leave anytime, keep everything.

---

## Design Instructions for claude.ai/design

### Slide format
- Widescreen 16:9 presentation slide
- Match the visual language of the research deck: light off-white/cream background (`#F5F2EE`), dark navy headline text (`#0D1B2A`), firmä green accent (`#1D7A4F`), monospaced small-caps for section labels

### Layout
- **Top-left:** Small section label in monospaced small-caps: `■ THE SOLUTION`
- **Headline:** Large bold sans-serif (same weight as "How Work Gets Delivered Today" from the deck): `firmä was built for exactly this.`
- **Sub-headline:** Light-weight body text directly below headline

- **Main content:** A clean 5-row table, no outer border, subtle horizontal dividers between rows only
  - Column 1 (narrow): Row number `01`–`05` in firmä green, bold
  - Column 2 (medium): Pain point in dark navy, normal weight; stat in firmä green, bold, smaller size — e.g. `93%` on its own line below the pain text
  - Column 3 (wide): firmä answer — feature name in dark navy bold, followed by em-dash and description in normal weight
  - No column headers (the layout is self-evident)

- **"Also included" strip:** Three horizontally equal chips between the main table and the footer callout. Each chip: feature name in dark navy bold (12pt), description in medium-grey regular (11pt). Separated by thin vertical dividers. No background fill — sits flush on the slide background to stay visually subordinate to the main table rows.

- **Bottom:** Full-width pale green box (`#E8F4EE`), left-bordered with a 3px firmä green bar — contains the "Non-custodial by design" callout text

- **Bottom footer strip:** Same as other slides — `CLIENT DELIVERY RESEARCH · 2026` left, `www.firma.bz` right, both in monospaced uppercase, small, muted

### Typography
- Headline: ~36–40pt bold
- Row pain text: ~13pt regular
- Row stat: ~18pt bold, firmä green
- Row answer feature name: ~13pt bold, navy
- Row answer description: ~12pt regular, medium-grey (`#4A5568`)
- Footer callout: ~12pt italic, dark navy

### Tone
This slide should feel like a confident, earned close — not a sales pitch. The data came from the audience; the product answers are direct responses. No decorative icons, no marketing filler. Data-first aesthetic consistent with the rest of the deck.

---

## Operational Playbook — Future Enhancements

From the research deck's 10-system playbook (slide 9), the following are candidates for future Firma development. Systems 03, 04, and 05 are already shipped; 08 and 09 are out of scope.

---

### 01 · Intake-to-Brief Automation

**Playbook description:** Survey/questionnaire → AI summarization → sets expectations before any work ships.

**Firma angle:** The Dossier/Wiki tab (BETA) already exists as a rich-text page per engagement. The natural extension is a structured intake form presented at engagement creation — the practitioner fills it in (or sends it to the client), and the responses are AI-summarized into the engagement's Dossier as the opening brief. All the infrastructure (Dossier model, Inngest jobs, engagement creation flow) is already in place.

**What needs building:** Intake form UI on engagement creation, AI summarization call, auto-write to Dossier page.

---

### 02 · Context-Preserving Onboarding Kit

**Playbook description:** Standard doc templates + client branding → signals a practice, not freelance.

**Firma angle:** Direct roadmap item. Engagement Templates (High Priority) let practitioners define a standard folder structure and document set that replicates on every new engagement. Combined with Custom Branding (already shipped), a new client receives a branded portal with a pre-structured workspace from day one — no manual setup per client.

**What needs building:** Template project definition UI, duplicate-on-create flow (`§5 Feature: Project Templates & Duplication`).

---

### 06 · Weekly Progress Dispatch

**Playbook description:** AI report generated from due dates, comment threads, and engagement notes → fewer ad-hoc check-in calls.

**Firma angle:** All the source data already exists in Firma — audit log events, DocComments, due dates, Shares activity, Reminders. An Inngest scheduled job could aggregate these per engagement, pass them to an LLM, and send a branded weekly digest email to the practitioner (and optionally the client). No new data collection needed — just a synthesis and delivery layer on top of existing signals.

**What needs building:** Inngest scheduled digest job, LLM summarization prompt, branded email template, per-engagement opt-in toggle.

---

### 07 · Client Health Scoring

**Playbook description:** 4 signals — response lag, revisions, approval delays, scope creep → catch at-risk clients before they ghost.

**Firma angle:** All four signals are derivable from existing Firma data. Response lag = time between a Share action and client approval/comment. Revision count = DocComment thread depth + document version events in the audit log. Approval delays = due date vs. actual finalize date. Scope creep = document count growth rate per engagement. A health score card surfaced on the Insights tab or the main Dashboard Action Centre would give practitioners an early warning system without leaving the portal.

**What needs building:** Health score computation model (can start as simple weighted rules), Insights tab card, optional alert notification when score drops below threshold.

---

### 10 · Campaign Close + IP Packaging

**Playbook description:** Engagement close becomes a case study, transition brief, and onboarding doc.

**Firma angle:** One-click Wrap already handles the access revocation side. The natural extension is a closing package generated at wrap time — a branded PDF containing the engagement's audit summary, final document list, Dossier pages, and key milestones. This completes the engagement lifecycle story: the same action that closes access also produces a handoff artifact the practitioner keeps as IP. Architecturally close to the existing PDF export roadmap item.

**What needs building:** Closing package generator triggered on engagement wrap, PDF export of Dossier + audit summary + document index, branded output using org's Custom Branding settings.

---

### Playbook coverage summary

| # | Playbook System | Firma Status |
| --- | --- | --- |
| 01 | Intake-to-Brief Automation | Future — Dossier extension |
| 02 | Context-Preserving Onboarding Kit | Roadmapped (High Priority) |
| 03 | Centralized Client Workspace | Shipped |
| 04 | Client Engagement Calendar | Shipped |
| 05 | Structured Approval Chain | Shipped |
| 06 | Weekly Progress Dispatch | Future — AI digest on existing data |
| 07 | Client Health Scoring | Future — Insights tab extension |
| 08 | Enrich Performance Narrative | Out of scope |
| 09 | Deliverable Walkthrough + Action Brief | Out of scope |
| 10 | Campaign Close + IP Packaging | Future — Wrap extension |

9 of 10 systems have a Firma answer (3 shipped, 1 roadmapped, 5 future). Only #08 sits outside the platform's remit.

---

## Source References (from the research PDF)

- Slide 3 — Operational Friction: 93% coordinating reviews
- Slide 2 — Delivery Infrastructure: 96% shared drive links, 0% dedicated portal
- Slide 7 — IP & Access Control: 63% never revoke access
- Slide 10 — Business Case: 70% never heard of a client portal
- Slide 4 — Time Lost to Admin: every practitioner loses measurable time weekly

## Firma Feature References (from PRD)

- DocComments: `§6 Feature: Document-level DocComments` — async, append-only comment threads per document
- Audit Log: `§6 Feature: Project-level Audit view` — immutable event log; membership, sharing, lifecycle events
- Branded Client Portal: `§3 Firm Level` + `features_list.md §Custom Branding` — logo, brand color, layout
- One-click Wrap (Close Project): `§5 Project Settings` — `isClosed: true` removes all `ORG_GUEST` members and revokes Google Drive folder permissions
- Engagement Workspaces: `§5 Engagement Management` — Firm → Client → Engagement → Document hierarchy; Drive folder auto-created per engagement
- Engagement Templates: `§5 Feature: Project Templates & Duplication` (High Priority roadmap)
- Shares Dashboard: `§5 Project Workspace Tab: Shares` — document sharing activity dashboard
- Persona Access Control: `§7 RBAC & Permission System` + `§8 Project Members & Personas` — four consolidated personas (`project_admin`, `project_editor`, `proj_ext_collaborator`, `proj_guest`); Drive permissions granted/revoked automatically on membership change
- Action Centre: `§6d Dashboard & Action Centre` — `/dash` landing page; surfaces pending shares, approvals, and due dates across all active engagements
- Semantic Search: `§6a Search` — AI-powered semantic search via Elasticsearch + `semantic-search.ts`; indexed on upload/import via Inngest background jobs
