# Secure open tab · branded holding page

Mock: `.claude/plans/secure-open-tab-mock.html`. Status: waiting for Deepak's go-ahead; nothing built.

## Today
`frontend/lib/use-secure-open-document.ts` → `openHoldingTab` opens `window.open('', '_blank')` on the click,
writes one `<p>` into the `about:blank` document, runs the regrant in the opener, then `sendTabTo` →
`tab.opener = null; tab.location.replace(documentUrl)`. On error / Google email it closes the tab and the
`SecureAccessModal` in the opener carries the state.

## Options

**A · Richer `about:blank` page (DOM / `document.write`).**
+ Paints instantly, no route, no middleware.
− Address bar still `about:blank` (the thing that made it look untrustworthy).
− All CSS, the mark's keyframes, fonts and favicon as strings in the hook; buttons ("Back to Firma",
  "Try again") wired across windows from the opener's closures; hard to test, drifts from the real loader.

**B · Same-origin route `/open` (recommended).**
- `window.open('/open#<hash>', '_blank')` still runs synchronously on the click, so pop-up rules are the same as today.
- The page renders the real `WorkspaceLoaderMark`, Firma's favicon and title, and `app.firma.bz/open` in the address bar.
- **It decides nothing about access.** No server call, no data fetch, not behind the `/d` shell or AuthGuard.
  The regrant stays exactly where it is (the opener's POST to `sharing/regrant`), and the only navigation
  to the document stays `sendTabTo` from the opener. The page never takes a URL from its address
  (no open redirect); the hash carries display text only, rendered as text.
- File name and provider go in the **hash** (`#n=…&p=onedrive&k=<id>`), so they never reach the server or
  Vercel's request logs; `location.replace` to the document drops the `/open` entry from history.
- Opener → tab state via `BroadcastChannel('firma-secure-open:<k>')`: `slow` is the tab's own timer;
  `error {reason}` / `email {address}` come from the hook. The tab posts `ready` on mount, and the hook
  replies with its latest state, which covers an error that lands before the page has loaded.
- On error the hook stops closing the tab; the tab shows the reason, and the modal in the opener still
  shows it too. "Back to Firma" = `window.close()` (allowed for a script-opened tab). "Try again" in the tab
  posts `retry` and the hook re-runs the regrant against the same tab (only for timeout / network).
- `blocked` is unchanged: no tab opened, so the modal's own link still handles it.
- Cost: ~200–400ms before the route paints (white, then the loader). Keep the route tiny: its own layout,
  no providers, static. Middleware must let `/open` through without a sign-in redirect.

## Provider name before the grant answers
The hook only learns the provider from the regrant response. Add optional `provider` to
`SecureOpenDocumentInput`; the Files list already knows `isOneDriveClient`. Unknown → the line drops the name.

## Build checklist (after go-ahead)
- `app/open/page.tsx` (+ minimal layout), middleware pass-through, hook changes, `SecureOpenDocumentInput.provider` at callers.
- Tests: hook (tab URL opened on click, hash contents, error message to tab instead of close, retry), page states and copy, no URL read from hash.
- Clean `tsc`. Tour: no copy of this flow found in `app/(demo)/tour` or `components/demo`; re-check when building.
- Nothing committed or pushed without approval.
