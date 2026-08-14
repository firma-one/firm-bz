# Landing Page — "Enterprise-grade everything" Security Section

New section to add to the marketing landing page communicating security & data-isolation guarantees.

## Copy (verbatim from source)

### Heading
**Enterprise-grade everything**

### Subheading / lede
Out of the box security & data isolation to protect your agency and your clients.

### Four feature pillars (left → right)

1. **Least-Privilege Access**
   - Sub-label: `ROLE-BASED PERMISSIONS`
   - Icon: key

2. **Encryption Everywhere**
   - Sub-label: `IN TRANSIT & AT REST`
   - Icon: lightning bolt

3. **Tenant Isolation**
   - Sub-label: `ROW-LEVEL SECURITY`
   - Icon: database (stacked cylinders)

4. **Secure Checkout**
   - Sub-label: `PCI-COMPLIANT BILLING`
   - Icon: credit card

## Layout

- **Section background:** solid black (`#000`). High-contrast dark section that visually breaks from the rest of the page.
- **Two-column layout on desktop:**
  - **Left column (~30% width):** Heading + subheading, left-aligned, top-aligned.
    - Heading in a large display sans-serif weight (bold), white, wraps naturally onto ~3 lines: `Enterprise-` / `grade` / `everything`.
    - Subheading below in muted light-gray, smaller body size, ~3-line wrap.
  - **Right column (~70% width):** 4 feature pillars in a horizontal row, evenly spaced, vertically centered against the heading block.
- **Each pillar (vertical stack, centered):**
  1. Circular icon badge — dark charcoal fill (`~#1a1a1a`) with a subtle radial highlight/vignette; ~64px diameter; white line-icon centered inside (thin stroke, ~1.5–2px).
  2. Feature title — white, bold, medium size, centered; wraps to 2 lines where needed (e.g. "Least-Privilege" / "Access").
  3. Sub-label — smaller, all-caps, tracked (letter-spacing), muted gray (`~#6b7280`), centered under title.
- **Spacing:** generous vertical padding around the section (`py-24` or similar); consistent gap between pillars.
- **Responsive:**
  - **Tablet:** 2×2 grid of pillars below the heading (heading spans full width on top).
  - **Mobile:** single column — heading, subheading, then pillars stacked vertically.

## Icon set

Use existing icon library already in the app (lucide-react is the current standard). Recommended mappings:

| Pillar | lucide-react icon |
|---|---|
| Least-Privilege Access | `KeyRound` |
| Encryption Everywhere | `Zap` |
| Tenant Isolation | `Database` |
| Secure Checkout | `CreditCard` |

Icons rendered white on the dark circular badge with the subtle glow effect (CSS radial-gradient overlay).

## Placement on landing page

Insert as a standalone section on the marketing landing page, positioned after the feature/benefit sections and before the pricing or CTA section — where a trust/credibility beat naturally lands.

## Notes / open items

- Confirm the exact landing-page component file to edit (likely under `app/(marketing)/` or `components/landing/`).
- Confirm typography tokens match the rest of the landing page (heading font, body font, letter-spacing on the small caps sub-labels).
- Decide whether to link any of the four pillars out to a dedicated Security / Trust page in the future.
