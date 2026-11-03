import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/version — the build this server runs, set by `npm run build`
 * (NEXT_PUBLIC_BUILD_TIMESTAMP). A page compares it with the build it was loaded from to offer a
 * reload after a deploy (components/app/new-version-prompt.tsx). null in `next dev`.
 */
export function GET() {
    return NextResponse.json(
        { version: process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? null },
        { headers: { 'Cache-Control': 'no-store' } },
    )
}
