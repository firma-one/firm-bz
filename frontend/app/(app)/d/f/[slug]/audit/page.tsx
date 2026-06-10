import { prisma } from '@/lib/prisma'
import { EngagementAuditPane } from '@/components/projects/engagement-audit-pane'
import { ErrorBoundary } from '@/components/error-boundary'

export default async function OrgAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const organization = await prisma.firm.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
  if (!organization) {
    return (
      <div className="p-4 text-sm text-gray-600">
        Firm not found.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Firm audit</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Audit events across all clients and engagements in this firm.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <ErrorBoundary context="OrgAudit">
          <EngagementAuditPane
            firmId={organization.id}
            exportTitle={organization.name}
          />
        </ErrorBoundary>
      </div>
    </div>
  )
}
