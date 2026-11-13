import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolvePostAuthTarget } from "@/lib/auth/post-auth-target";
import { isSystemAdminEmail } from "@/lib/system/admin-check";
import { isPlatformHost } from "@/lib/custom-domains/hosts";

/** Forward pathname to Server Components (e.g. `/d` layout entry redirect). */
const INVOKE_PATH_HEADER = "x-invoke-path";

function requestHeadersWithInvokePath(request: NextRequest): Headers {
    const headers = new Headers(request.headers);
    headers.set(INVOKE_PATH_HEADER, request.nextUrl.pathname);
    return headers;
}

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: requestHeadersWithInvokePath(request),
        },
    });

    const supabase = createServerClient(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value);
                    });
                    response = NextResponse.next({
                        request: {
                            headers: requestHeadersWithInvokePath(request),
                        },
                    });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    // Refresh session if expired - required for Server Components.
    // getUser() triggers token refresh but is more robust than getSession()
    // for handling concurrent requests on the same refresh token.
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Redirect /dash (legacy) to /d so we never render the dash route
    const pathname = request.nextUrl.pathname
    if (pathname === '/dash' || pathname.startsWith('/dash/')) {
        const rest = pathname === '/dash' ? '' : pathname.slice(5) // '/dash/foo' -> '/foo'
        return NextResponse.redirect(new URL('/d' + rest + request.nextUrl.search, request.url))
    }

    // Platform-wide maintenance mode: check before any firm-level checks.
    // Redirects all authenticated non-system-admin users to /platform-maintenance.
    // Non-blocking — a fetch failure never prevents navigation.
    // /system/* is admin-only and never subject to platform maintenance redirect
    const isAppRoute = pathname.startsWith('/d')
    const isAlreadyOnPlatformMaintenance = pathname.startsWith('/platform-maintenance')

    if (user && isAppRoute && !isAlreadyOnPlatformMaintenance && !pathname.startsWith('/api/')) {
        try {
            const statusUrl = new URL('/api/system/platform-maintenance/status', request.url)
            const statusRes = await fetch(statusUrl, { headers: { 'x-internal': '1' } })
            if (statusRes.ok) {
                const { active } = await statusRes.json() as { active: boolean }
                if (active) {
                    return NextResponse.redirect(new URL('/platform-maintenance', request.url))
                }
            }
        } catch { /* non-blocking — never block navigation on platform maintenance check failure */ }
    }

    // Firm-level maintenance mode: check DB via an internal API fetch for authenticated users
    // navigating to a firm workspace route (/d/<groupSlug>/f/<firmSlug>/...).
    // We can't import Prisma directly at the edge, so we call an internal Node.js
    // API route (/api/firm/maintenance-by-slug) that does the DB lookup — it also returns
    // groupSlug so we can build the /d/{groupSlug}/f/{firmSlug}/maintenance redirect without
    // a second lookup here. Not importing lib/navigation/firm-paths.ts in this file since its
    // shape (plain string builders) offers no benefit over a literal here, and importing app
    // code into proxy/middleware is avoided to keep the Edge bundle minimal.
    // This check is non-blocking — a fetch failure never prevents navigation.
    const slugMatch = pathname.match(/^\/d\/[^/]+\/f\/([^/]+)/)
    if (user && slugMatch && !pathname.includes('/maintenance') && !pathname.startsWith('/api/')) {
        try {
            const slug = slugMatch[1]
            const checkUrl = new URL(`/api/firm/maintenance-by-slug?slug=${encodeURIComponent(slug)}`, request.url)
            const checkRes = await fetch(checkUrl, { headers: { 'x-internal': '1' } })
            if (checkRes.ok) {
                const { active, groupSlug } = await checkRes.json() as { active: boolean; groupSlug?: string }
                if (active && groupSlug) {
                    return NextResponse.redirect(new URL(`/d/${groupSlug}/f/${slug}/maintenance`, request.url))
                }
            }
        } catch { /* non-blocking — never block navigation on maintenance check failure */ }
    }

    // No sign-out on deploy. A sign-in doesn't depend on the code version, and sessions are ended on
    // purpose instead (lib/auth/sessions.ts; .claude/plans/session-lifecycle.md). Tabs left open
    // across a deploy are offered a reload (components/app/new-version-prompt.tsx).

    // A signed-in visitor on /signin or /signup goes where the page itself would send them: an
    // explicit ?redirect= / ?next= deep link (an invite), else the app. /signup/callback is left to
    // run, so it can route a new account to onboarding.
    const isSigninPage = request.nextUrl.pathname.startsWith('/signin')
    const isSignupPage = request.nextUrl.pathname.startsWith('/signup')
    const isSignupCallback = request.nextUrl.pathname === '/signup/callback'
    if ((isSigninPage || isSignupPage) && user && !isSignupCallback) {
        return NextResponse.redirect(new URL(resolvePostAuthTarget(request.nextUrl.searchParams), request.url))
    }

    // A workspace's custom domain (acme.firma.bz, portal.acme.com): its root opens the app, keeping the
    // address. Any host that isn't one of Firma's own counts (lib/custom-domains/hosts.ts), so a domain
    // approved in /system/custom-domains needs no code change here, and no database lookup: /d?entry=auth
    // already resolves the person's workspace. (Replaces the hard-coded CLIENT_SUBDOMAINS list.)
    const host = request.headers.get('host') ?? ''
    if (pathname === '/' && host && !isPlatformHost(host)) {
        if (!user) {
            const loginUrl = new URL('/signin', request.url)
            loginUrl.searchParams.set('redirect', '/d')
            return NextResponse.redirect(loginUrl)
        }
        const url = request.nextUrl.clone()
        url.pathname = '/d'
        url.searchParams.set('entry', 'auth')
        return NextResponse.rewrite(url)
    }

    // /system is for system admins (SYSTEM_ADMIN_EMAILS) only. Its layout checks this in the browser,
    // which can't stop a server action POSTed to a /system page — the action runs before anything
    // renders — so refuse here too. Each admin action also checks for itself.
    const isSystemRoute = pathname === '/system' || pathname.startsWith('/system/')
    if (isSystemRoute && !isSystemAdminEmail(user?.email)) {
        if (!user) {
            const loginUrl = new URL('/signin', request.url)
            loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
            return NextResponse.redirect(loginUrl)
        }
        return NextResponse.redirect(new URL('/d', request.url))
    }

    // Protect all /d routes
    const isDRoute = pathname === '/d' || pathname.startsWith('/d/')
    if (isDRoute && !user) {
        const loginUrl = new URL('/signin', request.url)
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
        return NextResponse.redirect(loginUrl)
    }

    // Legacy /o/<firmSlug>/... URLs. These used to map to /d/f/<firmSlug>/..., which is no longer
    // a route (workspace URLs are group-scoped: /d/[groupSlug]/f/[firmSlug]/...), and the firm
    // slugs such URLs carry were re-generated by the word-based slug migration anyway — so the
    // old slug can't be rewritten into a valid path. Hand off to /d and let
    // resolveDefaultFirmLandingPath put the user somewhere real.
    if (request.nextUrl.pathname.startsWith('/o/')) {
        return NextResponse.redirect(new URL('/d', request.url))
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public/images (public images)
         * - public/icons (public icons)
         * - blog (handled separately or static)
         * Feel free to modify this pattern to include more paths.
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
