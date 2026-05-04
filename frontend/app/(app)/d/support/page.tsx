import { redirect } from 'next/navigation'
import { LifeBuoy, ChevronRight, Building2, Home } from 'lucide-react'
import { getFirmName } from '@/lib/actions/hierarchy'
import { canManageOrganization } from '@/lib/permission-helpers'
import { prisma, basePrisma } from '@/lib/prisma'
import { CreateSupportRequestModal } from '@/components/support/create-support-request-modal'
import { SupportRequestsList } from '@/components/support/support-requests-list'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ firmSlug?: string }>
}) {
  const { firmSlug } = await searchParams

  // Require a firmSlug — only Firm Admins reach this page via Profile menu
  if (!firmSlug) redirect('/d')

  // Resolve firm ID then verify can_manage (ACL gate)
  const firm = await prisma.firm.findUnique({ where: { slug: firmSlug }, select: { id: true } })
  if (!firm) redirect('/d')

  const canManage = await canManageOrganization(firm.id)
  if (!canManage) redirect('/d')

  const [firmName, ticketCount] = await Promise.all([
    getFirmName(firmSlug),
    (basePrisma as any).customerRequest.count({ where: { firmId: firm.id } }),
  ])

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumbs */}
      <div className="d-body flex items-center text-stone-500 mb-2 px-4 pt-4">
        <span className="flex items-center gap-2 text-stone-500" title="Home">
          <Home className="h-4 w-4" />
        </span>
        <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
        <Link
          href={`/d/f/${firmSlug}`}
          className="flex items-center gap-2 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <Building2 className="h-4 w-4" />
          <span className="font-medium">{firmName || 'Organization'}</span>
        </Link>
        <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
        <span className="flex items-center gap-2 text-slate-900">
          <LifeBuoy className="h-4 w-4" />
          <span className="font-semibold">Contact Support</span>
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Title Card */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 m-4 shadow-sm">
          <h1 className="d-title flex items-center gap-2.5">
            <LifeBuoy className="h-6 w-6 text-stone-500" />
            Contact Support
          </h1>
          <p className="d-subtitle mt-1">Submit requests, report issues, and get help from our support team.</p>
        </div>

        {/* Tabs Section */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col m-4">
          <Tabs defaultValue="requests" className="flex-1 flex flex-col min-h-0">
            {/* Tab List */}
            <div className="mb-6">
              <TabsList className="h-10 p-1 bg-slate-100 rounded-lg inline-flex justify-start flex-wrap gap-1">
                <CreateSupportRequestModal
                  firmSlug={firmSlug}
                  trigger={
                    <Button
                      variant="blackCta"
                      type="button"
                      className="h-full px-3 rounded-md text-sm font-medium inline-flex items-center gap-1.5"
                    >
                      <span>✨</span>
                      New Request
                    </Button>
                  }
                />
                <TabsTrigger
                  value="requests"
                  className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                >
                  <LifeBuoy className="w-4 h-4 mr-2" />
                  Requests
                  {ticketCount > 0 && (
                    <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                      {ticketCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <TabsContent value="requests" className="m-0 h-full">
                <div className="py-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <SupportRequestsList firmSlug={firmSlug} />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
