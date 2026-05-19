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

  if (!firmSlug) redirect('/d')

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
      <nav className="flex items-center gap-1.5 mb-4">
        <Home className="h-4 w-4 text-[#45474c] opacity-60" />
        <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
        <Building2 className="h-4 w-4 text-[#069668]" />
        <Link
          href={`/d/f/${firmSlug}`}
          className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter hover:text-[#069668] transition-colors"
        >
          {firmName || 'Organization'}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
        <LifeBuoy className="h-4 w-4 text-[#45474c] opacity-60" />
        <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">Support</span>
      </nav>

      {/* Page Identity Header */}
      <div className="flex items-start gap-6 mb-6">
        <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
          <LifeBuoy className="h-10 w-10 text-[#1b1b1d]" />
        </div>
        <div>
          <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
            Contact Support
          </h1>
          <p className="text-sm text-[#45474c] mt-1">
            Submit requests, report issues, and get help from our support team.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="requests" className="flex-1 flex flex-col min-h-0">
        {/* Tab strip — full-width white bar matching Firm pages */}
        <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0">
          <div className="flex items-center justify-between h-14 pr-4">
            <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
              <TabsTrigger
                value="requests"
                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
              >
                <LifeBuoy className="w-4 h-4 mr-2" />
                Requests
                {ticketCount > 0 && (
                  <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                    {ticketCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Right-aligned CTA */}
            <CreateSupportRequestModal
              firmSlug={firmSlug}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="h-auto px-4 py-1.5 rounded-[2px] bg-[#069668] text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-[#069668] hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(6,150,104,0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  New Request
                </Button>
              }
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <TabsContent value="requests" className="m-0">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SupportRequestsList firmSlug={firmSlug} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
