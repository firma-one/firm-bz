'use client'

import { useState } from 'react'
import { Check, MapPinned } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

const TOPICS = [
    'Firm, clients and engagements',
    'Brio: the firm brief and engagement Q&A',
    'Calendar and Doc Search',
    'Files, uploads and document actions',
    'Board, comments, audit and members',
    'Reminders, bookmarks and your profile',
]

/** Static counterpart to demo-tour-intro-modal.tsx — same resume-progress behavior, backed by
 * localStorage instead of a server-resolved firm/client/engagement slug set. Built on the app's
 * Dialog, so it portals out of the demo shell and uses the app's design tokens. */
export function DemoTourIntroModal() {
    const { showIntroModal, closeIntroModal, startTour, resumeTour, resumableStepIndex } = useDemoTour()
    const [neverShowAgain, setNeverShowAgain] = useState(false)

    const hasProgress = resumableStepIndex !== null && resumableStepIndex > 0
    const skip = () => closeIntroModal(neverShowAgain)

    return (
        <Dialog open={showIntroModal} onOpenChange={(open) => { if (!open) skip() }}>
            <DialogContent className="max-w-sm gap-0 p-0">
                <div className="px-5 pt-5">
                    <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
                        <MapPinned className="h-3.5 w-3.5" />
                        Guided tour · about 3 minutes
                    </p>
                    <DialogTitle className="mt-2">
                        {hasProgress ? 'Pick up where you left off?' : 'Welcome to the demo firm'}
                    </DialogTitle>
                    <DialogDescription className="mt-1.5 leading-relaxed">
                        {hasProgress
                            ? 'You were partway through the tour. Resume it, or start again from the beginning.'
                            : 'Everything here is sample data. Take the tour to see how Firma works, or explore on your own.'}
                    </DialogDescription>
                    {!hasProgress && (
                        <ul className="mt-4 space-y-1.5">
                            {TOPICS.map((topic) => (
                                <li key={topic} className="flex items-start gap-2 text-small text-fg-muted">
                                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" />
                                    {topic}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-line px-5 py-3">
                    {!hasProgress && (
                        <label className="flex cursor-pointer select-none items-center gap-2 text-caption text-fg-muted">
                            <Checkbox checked={neverShowAgain} onCheckedChange={(v) => setNeverShowAgain(v === true)} />
                            Don&apos;t show this again
                        </label>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        {hasProgress ? (
                            <>
                                <Button variant="ghost" size="sm" onClick={startTour}>Start over</Button>
                                <Button size="sm" onClick={resumeTour}>Resume tour</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" size="sm" onClick={skip}>Skip</Button>
                                <Button size="sm" onClick={startTour}>Start tour</Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
