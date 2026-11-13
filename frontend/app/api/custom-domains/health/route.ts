import { NextResponse } from 'next/server'
import { HEALTH_SERVICE } from '@/lib/custom-domains/reachability'

export const dynamic = 'force-dynamic'

/**
 * GET /api/custom-domains/health
 *
 * Proves a custom domain reaches this app (lib/custom-domains/reachability.ts): System Admins' Approve
 * and the daily re-check fetch it on the domain itself. Public, and says nothing but which service this is.
 */
export function GET() {
    return NextResponse.json({ service: HEALTH_SERVICE }, { headers: { 'cache-control': 'no-store' } })
}
