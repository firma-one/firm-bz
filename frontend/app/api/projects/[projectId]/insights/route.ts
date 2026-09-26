import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { computeEngagementInsights } from '@/lib/insights/engagement-insights'

// The computation lives in lib/ so background jobs can reuse it; Next.js only permits route
// handlers to be exported from this file. Types are re-exported for existing importers.
export type {
  UnansweredThreadItem,
  DocumentDueDateItem,
  FolderHealthIssue,
  FolderHealthPenalty,
  FolderHealthReport,
  StaleFileItem,
  LargeFileItem,
  DuplicateFile,
  DuplicateGroup,
  SharesProgress,
  HealthPenalty,
  EngagementHealthScore,
  DeliverableStage,
  DeliverableProgress,
  DeliveryPenalty,
  DeliveryHealthScore,
  StorageHealthReport,
  RecentDocumentItem,
  SensitiveFileItem,
  PlanningHygiene,
  CommentThreads,
  EngagementPace,
  DeliverableRevisionMetric,
  ApprovalCycleMetric,
  FirstTimeRight,
  InsightsConfig,
  ExternalSectionsConfig,
  EngagementInsightsResponse,
} from '@/lib/insights/engagement-insights'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { createClient: createSupabaseClient } = await import('@/utils/supabase/server')
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const [canView, canViewInternal] = await Promise.all([
      canViewProject(ctx.firmId, ctx.clientId, ctx.projectId),
      canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId),
    ])
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // External roles (EC/EV) may view the Overview, but only the deliverables analytics
    // section — all internal-only data is stripped inside computeEngagementInsights.
    return NextResponse.json(
      await computeEngagementInsights(projectId, ctx.firmId, !canViewInternal)
    )
  } catch (e) {
    console.error('GET project insights error', e)
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })
  }
}
