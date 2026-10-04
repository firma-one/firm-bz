# Session Timeout Investigation

**Question:** a team member reports "the session is getting timed out often." What is Firma's session timeout?

**Answer:** Firma has no session timeout. The sign-outs are caused by the deployment-version check, which signs out every logged-in user on every deploy.

Investigated 4 October 2026 against `dev` @ `a1437d93`. Read-only — no code changed.

---

## 1. There is no idle or inactivity timeout

Nothing in the codebase expires a session for inactivity. Searching `frontend/lib`, `frontend/proxy.ts` and the auth callback for `idle`, `inactiv`, `session timeout`, `autoRefreshToken`, `persistSession` and `JWT_EXPIRY` turns up no session-expiry logic at all — the only hits are an unrelated 90-day Google Drive file-inactivity check and OAuth connector token refresh.

What is actually configured:

| Thing | Value | Where |
| --- | --- | --- |
| Auth provider | Supabase (`@supabase/ssr`), default settings | `frontend/lib/supabase.ts:7` |
| Access token lifetime | Supabase default ~1 hour, auto-refreshed silently | Supabase project settings, not in repo |
| Session cookie `maxAge` | **30 days** (`60 * 60 * 24 * 30`) | `frontend/proxy.ts:135`, `:185` |
| Same, on auth callback | **30 days** | `frontend/app/(app)/auth/callback/route.ts:95`, `:104` |

The browser client is created with no options — `createBrowserClient(supabaseUrl, supabaseAnonKey)` — so Supabase's defaults apply: the access token expires hourly and the SDK refreshes it in the background without the user noticing. Nominally a member stays signed in for 30 days of ordinary use.

---

## 2. The real cause: every deploy signs everyone out

`frontend/proxy.ts:113-186` runs a deployment-version check on every authenticated app route. If the `fm-deployment-version` cookie does not match the current build, the middleware:

1. calls `supabase.auth.signOut()` — `frontend/proxy.ts:148`
2. deletes every cookie starting with `sb-` or containing `auth`/`supabase`
3. deletes the `fm-deployment-version` cookie
4. redirects to `/signin?redirect=/d&reason=deployment` — `frontend/proxy.ts:152-154`

The stated intent, per the header comment in `frontend/lib/deployment-version.ts`, is to distinguish *new code* (invalidate, so an in-memory cache rebuilds against new code) from a *server restart with the same code* (keep sessions). The distinction is implemented, but the version it keys on defeats it.

### The version changes on every build

`getDeploymentVersion()` prefers, in order: `DEPLOYMENT_VERSION`, then `NEXT_PUBLIC_BUILD_TIMESTAMP`, then a dev-only value, then the package version. In production neither of the first is set by CI — the build script sets the timestamp itself:

```
"build": "prisma generate && NEXT_PUBLIC_BUILD_TIMESTAMP=$(date +%s) next build --webpack"
```
— `frontend/package.json:11`

`$(date +%s)` is evaluated at build time, so **every build produces a brand-new version**. Consequences:

- **Every production deploy signs out every logged-in user** on their next click, regardless of what changed. A CSS tweak invalidates sessions exactly as a schema change does.
- **Rebuilding the same commit also signs everyone out**, because the timestamp moves even when the code does not — the precise case the module's comment says it wants to avoid.

### This matches the report

`main` took 5 commits in the two weeks to 4 October 2026, four of them clustered across 26-28 September (`04ac9ff0`, `7378eec2`, `548ab6e0`, `bbbcfca0`, `310512e7`). If each was a deploy, anyone working in Firma over those three days was forcibly signed out four times in three days. That is indistinguishable, from the user's side, from an aggressive session timeout.

---

## 3. Why it feels like a bug rather than an update

The middleware carefully sets `reason=deployment` on the redirect. The sign-in page never reads it: there is no reference to `reason` anywhere in `frontend/app/(app)/signin/signin-view.tsx` or `page.tsx`.

So the user is dropped on a bare login screen with no explanation. Nothing says "Firma was updated, please sign in again" — which is why it gets reported as a timeout.

---

## 4. Options, cheapest first

1. **Explain it.** Read `reason=deployment` in `signin-view.tsx` and show "Firma was updated — please sign in again." Does not reduce the sign-outs, but stops them reading as a fault. Smallest possible change.
2. **Decouple the version from the build.** `getDeploymentVersion()` already prefers `DEPLOYMENT_VERSION` over the timestamp, so setting that env var in Vercel to a manually-bumped cache-schema version means routine deploys stop invalidating sessions, and only deploys that genuinely need a cache rebuild do. One env var, no code change.
3. **Stop using sign-out as cache invalidation.** Key the in-memory cache by build version so a new deploy misses the cache naturally, and drop the forced sign-out entirely. Correct fix; needs an audit of what that cache actually holds and whether the sign-out is still load-bearing or is leftover from an earlier design.

Open question for option 3: what the in-memory cache contains, and whether anything in it is sensitive to stale code in a way a cache miss would not already handle.
