# Overlay layering

Radix renders dropdowns, selects, tooltips, dialogs and sheets into a portal on
`document.body`. Once there they no longer nest inside whatever opened them, so they
compete with in-page overlays by `z-index` alone.

That bit us concretely: the right panel's full-screen state is `fixed inset-0 z-[100]`
(`components/app/layout-right-panel.tsx`), which sat above the primitives' old `z-50`.
Every menu, tooltip and toast opened from inside the full-screen panel rendered *behind*
it. They still opened and still trapped focus, so they did not look like a drawing bug —
they looked like dead controls.

## The scale

| Layer | z-index | What |
| --- | --- | --- |
| Page chrome | `< 100` | Normal in-flow content, sticky headers, panel at small/medium |
| In-page overlays | `100` | Right panel full-screen state |
| Modal scrim | `120` | `dialog` / `sheet` overlay |
| Modal surface | `121` | `dialog` / `sheet` content |
| Menus | `130` | `dropdown-menu`, `select` |
| Tooltips | `140` | `tooltip` |
| Toasts | `150` | `toast` |

Portal layers start above `100` so they always clear an in-page overlay. Within the
portal band the order is modal, then menu, then tooltip, then toast — a menu opened from
a dialog must cover the dialog, a tooltip on that menu must cover the menu, and a toast
must be visible over all of it.

## Outside the scale

Some components set `z-[200]` and up directly — the demo tour, landing blockers, a few
modals. They keep their precedence and were left alone; the scale tops out below them on
purpose. If you add a portal-rendered layer, use the table above rather than inventing a
value, and if you need to sit above everything, say why in a comment.

Note that a locally-positioned `z-[200]` inside a component (for example the mention
picker in `document-doc-comments-pane.tsx`) is in its own stacking context and does not
compete with portals at all.
