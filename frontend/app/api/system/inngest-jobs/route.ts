import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { logger } from '@/lib/logger'

interface InngestRun {
  run_id: string
  function_id: string
  status: 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'Sleeping' | 'Queued'
  started_at: string
  ended_at?: string
  event_id: string
  event_name: string
  event?: {
    data?: {
      organizationId?: string
      firmId?: string
      [key: string]: unknown
    }
    name?: string
    [key: string]: unknown
  }
}

interface InngestRunsPage {
  data: InngestRun[]
  metadata?: {
    page_info?: {
      cursor?: string | null
      has_more?: boolean
    }
    total_count?: number
  }
}

interface EnrichedRun {
  runId: string
  functionId: string
  status: string
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  eventName: string
  orgId: string | null
  eventPayload: Record<string, unknown>
}

interface JobsApiResponse {
  runs: EnrichedRun[]
  nextCursor: string | null
  hasMore: boolean
  totalFetched: number
  firm: { id: string; name: string; slug: string } | null
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )
    const { data: { user } } = await supabase.auth.getUser(token)

    if (!user?.id || !(await isSysAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden: System admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? undefined
    const functionId = searchParams.get('functionId') ?? undefined
    const firmSlug = searchParams.get('firmSlug') ?? undefined
    const cursor = searchParams.get('cursor') ?? undefined
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '50', 10), 100)

    const isDev = process.env.INNGEST_DEV === '1'
    const inngestBaseUrl = isDev ? 'http://localhost:8288' : 'https://api.inngest.com'

    const inngestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (!isDev) {
      const signingKey = process.env.INNGEST_SIGNING_KEY
      if (!signingKey) {
        return NextResponse.json({ error: 'INNGEST_SIGNING_KEY not configured' }, { status: 500 })
      }
      inngestHeaders['Authorization'] = `Bearer ${signingKey}`
    }

    let firmFilter: { id: string; name: string; slug: string } | null = null
    if (firmSlug) {
      const firm = await prisma.firm.findFirst({
        where: { slug: firmSlug, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
      if (!firm) {
        return NextResponse.json({ error: `Firm '${firmSlug}' not found` }, { status: 404 })
      }
      firmFilter = firm
    }

    // Dev server doesn't expose /v1/runs endpoint; feature only works in production with real Inngest API
    if (isDev) {
      const response: JobsApiResponse = {
        runs: [],
        nextCursor: null,
        hasMore: false,
        totalFetched: 0,
        firm: firmFilter,
      }
      return NextResponse.json(response)
    }

    const MAX_FETCH = 200
    const collected: InngestRun[] = []
    let fetchCursor: string | undefined = cursor
    let totalFetched = 0
    let finalCursor: string | null = null
    let hasMore = false

    while (totalFetched < MAX_FETCH) {
      const qs = new URLSearchParams()
      qs.set('page_size', '50')
      if (fetchCursor) qs.set('cursor', fetchCursor)
      if (status) qs.set('status', status)
      if (functionId) qs.set('function_id', functionId)

      const res = await fetch(`${inngestBaseUrl}/v1/runs?${qs}`, {
        headers: inngestHeaders,
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        const body = await res.text()
        logger.error(`Inngest API error ${res.status}`, new Error(body))
        return NextResponse.json(
          { error: `Inngest API error ${res.status}` },
          { status: 502 }
        )
      }

      const page: InngestRunsPage = await res.json()
      const runs = page.data ?? []
      totalFetched += runs.length

      for (const run of runs) {
        if (firmFilter) {
          const orgId = run.event?.data?.organizationId ?? run.event?.data?.firmId
          if (orgId !== firmFilter.id) continue
        }
        collected.push(run)
        if (collected.length >= pageSize) break
      }

      const pageInfo = page.metadata?.page_info
      fetchCursor = pageInfo?.cursor ?? undefined
      hasMore = pageInfo?.has_more ?? false

      if (collected.length >= pageSize || !hasMore || !fetchCursor) break
    }

    const enriched: EnrichedRun[] = collected.slice(0, pageSize).map(run => {
      const startMs = run.started_at ? new Date(run.started_at).getTime() : null
      const endMs = run.ended_at ? new Date(run.ended_at).getTime() : null
      return {
        runId: run.run_id,
        functionId: run.function_id,
        status: run.status,
        startedAt: run.started_at,
        endedAt: run.ended_at ?? null,
        durationMs: startMs && endMs ? endMs - startMs : null,
        eventName: run.event_name ?? (run.event?.name ?? ''),
        orgId: run.event?.data?.organizationId ?? run.event?.data?.firmId ?? null,
        eventPayload: (run.event?.data ?? {}) as Record<string, unknown>,
      }
    })

    const response: JobsApiResponse = {
      runs: enriched,
      nextCursor: collected.length >= pageSize && fetchCursor ? fetchCursor : null,
      hasMore: collected.length >= pageSize && hasMore,
      totalFetched,
      firm: firmFilter,
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Error in inngest-jobs route', error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch Inngest jobs' },
      { status: 500 }
    )
  }
}
