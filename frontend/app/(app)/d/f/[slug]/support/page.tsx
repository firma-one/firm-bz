'use client'

import { use, useState, useEffect } from 'react'
import { LifeBuoy, ChevronRight, Building2, Home } from 'lucide-react'
import { CreateSupportRequestModal } from '@/components/support/create-support-request-modal'
import { SupportRequestsList } from '@/components/support/support-requests-list'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default function SupportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [requestCount, setRequestCount] = useState(0)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await fetch(`/api/support/requests?firmSlug=${slug}`)
        if (response.ok) {
          const data = await response.json()
          setRequestCount(data.length)
        }
      } catch (error) {
        console.error('Failed to fetch request count:', error)
      }
    }
    fetchCount()
  }, [slug])

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumbs */}
      <div className="d-body flex items-center text-stone-500 mb-2 px-4 pt-4">
        <span className="flex items-center gap-2 text-stone-500" title="Home">
          <Home className="h-4 w-4" />
        </span>
        <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
        <Link
          href={`/d/f/${slug}`}
          className="flex items-center gap-2 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <Building2 className="h-4 w-4" />
          <span className="font-medium">Organization</span>
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
            {/* Tab List with CTA */}
            <div className="mb-6 flex items-center justify-between gap-4">
              <TabsList className="h-10 p-1 bg-slate-100 rounded-lg inline-flex justify-start flex-wrap gap-1">
                <CreateSupportRequestModal
                  firmSlug={slug}
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
                </TabsTrigger>
              </TabsList>

              {/* Request Count Badge */}
              <span className="px-3 py-1 bg-slate-100 rounded-full text-sm font-medium text-slate-600">
                {requestCount} {requestCount === 1 ? 'Request' : 'Requests'}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <TabsContent value="requests" className="m-0 h-full">
                <div className="py-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <SupportRequestsList firmSlug={slug} />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
