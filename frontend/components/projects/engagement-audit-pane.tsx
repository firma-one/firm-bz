import { AuditWithFilters } from '@/components/audit/audit-with-filters'

export interface EngagementAuditPaneProps {
  /** Engagement-scoped audit (use either projectId or firmId, not both) */
  projectId?: string
  projectName?: string
  /** Firm-scoped audit */
  firmId?: string
  /** Used for CSV filename in firm mode */
  exportTitle?: string
}

export function EngagementAuditPane({ projectId, projectName, firmId, exportTitle }: EngagementAuditPaneProps) {
  const isFirmMode = Boolean(firmId)
  const mode = isFirmMode ? 'org' : 'project'
  const resourceId = (firmId ?? projectId) ?? ''

  return (
    <AuditWithFilters
      mode={mode}
      resourceId={resourceId}
      exportTitle={exportTitle ?? projectName ?? 'audit'}
      showClientProjectFilters={isFirmMode}
      firmIdForFilters={firmId}
    />
  )
}
