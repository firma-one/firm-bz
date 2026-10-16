'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Megaphone, ArrowUpRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ReleaseMeta } from '@/lib/use-whats-new'

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
  onRead: () => void
  releases: ReleaseMeta[]
}

export function WhatsNewModal({ isOpen, onClose, onRead, releases }: WhatsNewModalProps) {
  useEffect(() => {
    if (isOpen) onRead()
  }, [isOpen, onRead])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">

        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-[#eae7e9]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f0edee] shrink-0">
              <Megaphone className="h-3.5 w-3.5 text-fg-muted" />
            </div>
            <div>
              <DialogTitle className="text-[0.875rem] font-semibold text-fg leading-tight">
                What&apos;s New
              </DialogTitle>
              <p className="text-caption text-[#6b7280] leading-tight mt-0.5">
                Release history for Firma
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Release list */}
        <div className="max-h-72 overflow-y-auto divide-y divide-[#f0edee]">
          {releases.length === 0 ? (
            <div className="px-5 py-6 text-sm text-[#6b7280]">No releases yet.</div>
          ) : (
            releases.map((release, i) => (
              <div key={release.version} className={cn('px-5 py-3.5', i === 0 && 'bg-[#fafaf9]')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    'text-caption font-bold tracking-wide px-1.5 py-0.5 rounded',
                    i === 0
                      ? 'bg-fg text-white'
                      : 'bg-[#f0edee] text-[#6b7280]'
                  )}>
                    v{release.version}
                  </span>
                  {i === 0 && (
                    <span className="text-caption font-semibold text-tag-green-fg bg-tag-green-bg border border-green-200 px-1.5 py-0.5 rounded">
                      Latest
                    </span>
                  )}
                  <span className="text-caption text-[#9ca3af] ml-auto">
                    {new Date(release.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className={cn(
                  'text-[0.8125rem] leading-snug',
                  i === 0 ? 'font-semibold text-fg' : 'font-medium text-fg-muted'
                )}>
                  {release.title}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#eae7e9] flex items-center justify-between">
          <span className="text-caption text-[#9ca3af]">
            {releases.length} release{releases.length !== 1 ? 's' : ''}
          </span>
          <Link
            href="/resources/changelog"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-1 text-caption font-medium text-fg-muted hover:text-fg transition-colors"
          >
            Full changelog
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

      </DialogContent>
    </Dialog>
  )
}
