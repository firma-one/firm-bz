# Plan: Replace User-Facing "Sandbox" with "Demo" / "Demo Firm"

## Context

The product uses "Sandbox" as a technical/internal term for the free demo workspace. However, user-facing copy should use "Demo firm" consistently — which is already the preferred term in most places. The screenshot shows "This is a sandbox with sample data" in the intro modal, which is one such instance. This plan audits and fixes **all user-visible** occurrences while leaving internal code identifiers (variable names, function names, prop names) unchanged.

---

## Audit: All User-Visible "Sandbox" Strings

### 1. `frontend/components/app/demo-tour-intro-modal.tsx` — line 35
| Current | Proposed |
|---|---|
| `This is a sandbox with sample data` | `This is a demo firm with sample data` |

### 2. `frontend/components/ui/sandbox-info-banner.tsx` — line 6
| Current | Proposed |
|---|---|
| `'This operation is not permitted in a Sandbox.'` | `'This operation is not permitted in the Demo firm.'` |

### 3. `frontend/components/projects/sandbox-file-preview.tsx` — line 271
| Current | Proposed |
|---|---|
| `This is a sandbox — sample files are shown for preview only. Sign up for a paid plan to manage real client files.` | `This is a demo firm — sample files are shown for preview only. Sign up for a paid plan to manage real client files.` |

### 4. `frontend/config/pricing.ts` — line 408 (`PRICING_SANDBOX_PROFILE_LEAD`)
| Current | Proposed |
|---|---|
| `'Free plan — no credit card required. Upgrade to Standard and take off the training wheels.'` | No change needed — already clean (no "Sandbox" visible to user) |

> **Note:** `PRICING_SANDBOX_COLUMN_ID = 'Sandbox'` is a type-level constant used as an object key in the comparison matrix data, **not** rendered directly as visible text. The desktop table already shows "Free" (hardcoded `<th>`) and mobile shows "Demo" (hardcoded string). No change needed.

---

## Files to Modify (user-visible copy only)

1. **[`frontend/components/app/demo-tour-intro-modal.tsx`](frontend/components/app/demo-tour-intro-modal.tsx)** — line 35  
   Change subtitle text `"This is a sandbox with sample data"` → `"This is a demo firm with sample data"`

2. **[`frontend/components/ui/sandbox-info-banner.tsx`](frontend/components/ui/sandbox-info-banner.tsx)** — line 6  
   Change `SANDBOX_OPERATION_MESSAGE` value from `'This operation is not permitted in a Sandbox.'` → `'This operation is not permitted in the Demo firm.'`

3. **[`frontend/components/projects/sandbox-file-preview.tsx`](frontend/components/projects/sandbox-file-preview.tsx)** — line 271  
   Change banner text `"This is a sandbox —"` → `"This is a demo firm —"`

---

## What Is NOT Changed

- Internal variable/function names: `sandboxOnly`, `SANDBOX_OPERATION_MESSAGE`, `SandboxInfoBanner`, `buildSandboxPreviewFiles`, etc. — these are code identifiers, not user-visible.
- `PRICING_SANDBOX_COLUMN_ID = 'Sandbox'` — used only as a data key, never rendered as visible text.
- `upgrade-copy.ts` — already uses "Demo firm" throughout (lines 94–95, 8, 38, 42, 51, 95). No changes needed.
- Pricing page — desktop matrix column header already says "Free"; mobile tab already says "Demo". No changes needed.

---

## Verification

After making changes:
1. Open the Demo Firm and confirm the intro modal subtitle reads "This is a demo firm with sample data"
2. Trigger any restricted action (e.g. try to add a client) and confirm the info banner says "…not permitted in the Demo firm."
3. Open a project's documents tab to confirm the file preview banner reads "This is a demo firm —…"
