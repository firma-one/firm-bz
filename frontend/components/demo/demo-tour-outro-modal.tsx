'use client'

import Link from 'next/link'
import { Check, MapPinned, Play } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'

/** The modal shown when the guided tour ends. Built on the app's Dialog, so it portals out of the
 * tour's shell and uses the app's design tokens. */
export function DemoTourOutroModal() {
    const { showOutroModal, endTour, restartTour } = useDemoTour()
    const close = () => endTour(false)

    return (
        <Dialog open={showOutroModal} onOpenChange={(open) => { if (!open) close() }}>
            <DialogContent className="max-w-sm gap-0 p-0">
                <div className="px-5 pt-5">
                    <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
                        <MapPinned className="h-3.5 w-3.5" />
                        Guided tour
                    </p>
                    <DialogTitle className="mt-2">That&apos;s the tour</DialogTitle>
                    <DialogDescription className="mt-1.5 leading-relaxed">
                        Explore the demo on your own. The sample data is yours to play with, and nothing
                        here is saved.
                    </DialogDescription>
                    <ul className="mt-4 space-y-1.5">
                        <li className="flex items-start gap-2 text-small text-fg-muted">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" />
                            <span>
                                Replay it any time from the <MapPinned className="inline h-3.5 w-3.5 align-[-2px] text-fg" /> map icon in the top bar.
                            </span>
                        </li>
                        <li className="flex items-start gap-2 text-small text-fg-muted">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" />
                            Sign up to create your own firm with real clients and engagements.
                        </li>
                    </ul>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-line px-5 py-3">
                    <Button variant="ghost" size="sm" onClick={restartTour}>
                        <Play className="h-3.5 w-3.5" />
                        Replay
                    </Button>
                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={close}>Done</Button>
                        <Link href="/signup" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm' })}>
                            Sign up
                        </Link>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
