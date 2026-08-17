# Plan: DocuSign-Style E-Signature (Firma Sign)

## Goal

Let an internal user request a signature on a document already living in an engagement, route it to one or more external signers, capture their signature, and produce a signed, auditable PDF delivered back into the engagement — without leaving Firma.

This is **not a small feature**. It touches PDF rendering, a new routing state machine, and (for anything beyond MVP) cryptographic sealing. This plan is phased so we can ship a useful MVP fast and defer the legally-hardened parts.

---

## Why this is feasible (existing building blocks)

- **PDF byte manipulation precedent** — `frontend/lib/watermark-pdf.ts` already loads a PDF via `pdf-lib`, draws content on a page, and re-saves. The mechanical core of "stamp a signature image onto a page" already has a working pattern to copy.
- **External-party access pattern** — `EngagementInvitation` / `ClientInvitation` (schema.prisma:581-648): tokenized, expiring, single-purpose links sent by email. `EngagementDocumentSharingUser` already grants per-user, per-document access. A signer link is the same shape: token → scoped access to exactly one document.
- **Email with attachments** — `frontend/lib/email.ts` (nodemailer) already supports HTML + attachments; templates live in `frontend/lib/email-templates/`. Signer notifications and "your countersigned copy" delivery reuse this as-is.
- **Audit logging** — `PlatformAuditEvent` (schema.prisma:832) is a generic firm/client/engagement/document-scoped event log. Usable as the append-only backbone for a signature audit trail (extended, not replaced).
- **Background jobs** — Inngest is already wired in for async work (reminders, embeddings); useful for "send reminder if unsigned after 48h" style nudges.

## What's genuinely missing (net-new work)

1. **PDF viewer/annotation UI** — no `react-pdf` / `pdf.js` in the stack today. Need to render pages and let a user drag-place signature/date/initial fields.
2. **Multi-signer routing state machine** — existing invitation model is single-shot accept/join; signing needs ordered (or parallel) multi-party status tracking per document.
3. **Signature capture UI** — draw/type/upload a signature, store as an image reusable across fields.
4. **Signed-PDF generation** — burn placed signatures + a certificate-of-completion page into the PDF via `pdf-lib`.
5. **Storage/connector round-trip** — because `EngagementDocument` files live in the firm's connected Drive/OneDrive/SharePoint (not app storage), signing means: fetch bytes via the connector adapter → mutate → write back via the same adapter. Every phase pays this cost.
6. **(Phase 3 only) Cryptographic sealing** — real tamper-evidence needs a signing cert + library (e.g. `node-forge` or `@signpdf`) and ideally a trusted timestamp. Nothing like this exists in the repo today.

---

## Phased scope

### Phase 1 — MVP: single-signer, visual-only, in-app
**Goal:** internal user requests a signature on one document from one external signer; signer draws/types a signature via a tokenized link; a visually-stamped PDF is generated and stored back to the document; both parties get an emailed copy.

- New model `DocumentSignatureRequest` (1:1 with an `EngagementDocument` per attempt):
  - `id`, `engagementDocumentId`, `requestedByUserId`, `signerEmail`, `signerName`, `token`, `status` (`pending | viewed | signed | declined | expired`), `fields` (JSON: page/x/y/w/h per field), `signedAt`, `expireAt`, `signedFileExternalId` (pointer to the resulting connector file)
- Field placement UI: internal user opens the doc, drags a single "signature" + "date" box onto a rendered page (introduces `react-pdf` for page rendering — read-only, no annotation library needed for MVP since it's just click-to-place on a canvas overlay)
- Signer flow: tokenized `/sign/[token]` page (no auth) — view PDF, draw/type signature, click boxes to fill, confirm → server burns the image into the PDF via `pdf-lib` (reuse `watermark-pdf.ts` pattern) and re-uploads via the existing connector adapter
- Basic audit trail: reuse `PlatformAuditEvent` with a new `eventType` (`document.signature_requested`, `document.signature_completed`, etc.) capturing signer IP + timestamp + user agent in `metadata`
- Email: "Please sign" to signer, "Signed copy" to both parties (existing `email.ts` + new templates)
- Explicitly **not** cryptographically sealed — this is a visual signature, same trust level as a scanned wet-ink signature, disclosed as such in the signer consent copy

**Est. effort:** 2–3 weeks (PDF viewer integration and connector round-trip are the long poles, not the data model).

### Phase 2 — Multi-signer + routing
- Extend `DocumentSignatureRequest` → `DocumentSignatureRequest` (parent) + `DocumentSignatureParticipant[]` (per-signer status, order/sequence number)
- Sequential ("signer 2 unlocked only after signer 1 completes") vs parallel modes
- Reminder cron via Inngest (nudge unsigned participants after N hours, same pattern as existing reminder system)
- Status surfaced in engagement UI (who's signed, who's pending)

**Est. effort:** 1–2 weeks on top of Phase 1.

### Phase 3 — Legal hardening (optional, only if needed for compliance)
- Cryptographic PDF sealing (certificate-based signature embedded in the PDF, not just a visual stamp) via `node-forge` or `@signpdf` + a firm-held or third-party signing cert
- Structured, tamper-evident audit trail (hash-chained events, not just a JSON metadata blob) — likely a dedicated `SignatureAuditEvent` table rather than overloading `PlatformAuditEvent`
- Consent/disclosure language + ESIGN Act / UETA compliance review (legal, not engineering)
- Trusted timestamping authority integration

**Est. effort:** 2–4 weeks + legal review; only worth doing if customers require legally-binding (not just visually-signed) documents.

---

## Open questions before starting Phase 1

- Does "visually signed, not cryptographically sealed" satisfy the actual customer need, or is legal enforceability a day-one requirement? (Determines whether Phase 3 work must be pulled forward.)
- Do signers need an account, or is a tokenized no-auth link (matching the existing invitation pattern) acceptable long-term?
- Which connector(s) need day-one support — just Google Drive, or OneDrive/SharePoint too (adds adapter surface area per the recent PR #93 patterns)?

---

## Verification (Phase 1)

1. Internal user places fields on a real PDF and sends a request → signer receives email with working link.
2. Signer completes signature on mobile + desktop viewport → resulting PDF has the signature burned in on the correct page/position.
3. Signed file appears back in the engagement document list via the correct connector, downloadable by internal users.
4. Audit event recorded with signer IP/timestamp/user agent.
5. Expired/declined states behave correctly (link stops working, status reflects in UI).
6. `npm run typecheck` / `npm test` pass.
