# Plan: Contact Follow-Up Date

## Goal

Add a per-contact **Follow Up** date field to `ClientContact`. Saving a date auto-creates (or updates) a reminder assigned to all Firm Admins, surfaced in the existing Reminders panel.

---

## Scope

- Single date field (`followUpDate`) on `ClientContact`
- Reminder auto-created/updated on save; auto-cleared on date removal
- Assigned to all `firm_admin` members of the client's firm
- Uses existing `upsertFollowUpReminder` (same pattern as client follow-up date)
- No new reminder UI — the reminder lands in the existing Reminders topbar panel

Out of scope: per-contact reminder history, assignee customisation, repeat cadence.

---

## Data model change

### `ClientContact` (add one field)

```prisma
model ClientContact {
  // ... existing fields ...
  followUpDate   DateTime? @db.Timestamptz(6)
}
```

**Migration name:** `add_client_contact_follow_up_date`

Generate only — never apply directly:
```
npx prisma migrate dev --name add_client_contact_follow_up_date --create-only
```

---

## Backend changes

### 1. `lib/actions/client.ts`

**`ClientContactRecord` type** — add field:
```ts
followUpDate: string | null   // ISO date string "YYYY-MM-DD", null if unset
```

**`listClientContacts`** — include `followUpDate` in the Prisma select.

**`updateClientContact`** — accept `followUpDate?: string | null` in the params object.

After the Prisma update succeeds, fan out reminders to all firm admins:

```ts
const firm = await prisma.firm.findUnique({
  where: { id: firmId },
  include: { members: { where: { role: 'firm_admin' }, select: { userId: true } } },
})
const admins = firm?.members ?? []

if (followUpDate) {
  await Promise.all(
    admins.map(({ userId }) =>
      upsertFollowUpReminder({
        userId,
        entityKey: 'platform.clients.contacts',
        entityValue: contactId,
        action: `Follow up with ${contact.name}`,
        dateKey: null,
        dateValue: followUpDate,    // "YYYY-MM-DD"
        entityName: contact.name,
        firmId,
        ctaUrl: `/d/f/${orgSlug}/c/${clientSlug}?tab=contacts`,
        note: contact.notes ?? undefined,
      })
    )
  )
} else {
  // Date cleared — remove any existing follow-up reminder for this contact
  await clearContactFollowUpReminder(firmId, contactId)
}
```

Add a small helper `clearContactFollowUpReminder(firmId, contactId)` that filters `userPersonalization.reminders` JSON array for all admins (same pattern as `clearSubscriptionCancellationRemindersForAdmins` in `polar-billing-lifecycle.ts`).

### 2. `lib/reminders/entity-registry.ts`

Register the new entity key so the Reminders panel can resolve contact names and CTA links:

```ts
registerEntityResolver('platform.clients.contacts', async (contactId) => {
  const contact = await prisma.clientContact.findUnique({
    where: { id: contactId },
    select: { name: true, clientId: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
  })
  if (!contact) return null
  return {
    label: contact.name,
    url: `/d/f/${contact.client.firm.slug}/c/${contact.client.slug}?tab=contacts`,
  }
})
```

---

## Frontend changes

### 3. Contacts tab / contact row UI

File: wherever contacts are rendered (likely `components/projects/client-settings-form.tsx` or a dedicated `contacts-tab.tsx`).

Add a **Follow Up** date input to the contact edit form/inline row:
- `<input type="date" />` or reuse the existing `DatePicker` component
- Label: "Follow Up"
- On change: call `updateClientContact(...)` with the new `followUpDate`
- Display: show the date in the contact row chip/badge when set (e.g. `📅 Jun 12`)

No separate "Save" button needed if contacts use optimistic inline editing (match existing pattern). If they use a form submit, include `followUpDate` in the submit payload.

---

## Verification

1. Add a follow-up date to a contact → reminder appears in topbar panel for all firm admins within the same session (no page reload needed — reminder panel already polls).
2. Change the date → reminder updates (same reminder row, new date).
3. Clear the date → reminder disappears from the panel.
4. Reminder CTA link → navigates to the client's contacts tab.
5. `npm run typecheck` — 0 errors.
6. `npm test` — all tests pass.

---

## Estimated effort

~2–3 hours:
- Migration: 15 min
- Backend (actions + registry): 45 min
- Frontend (date input in contact row): 60 min
- Manual verification: 30 min
