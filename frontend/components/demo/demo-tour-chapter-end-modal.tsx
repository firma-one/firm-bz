'use client'

import { useRef } from 'react'
import { ArrowRight, MapPinned } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { nextTourNode, tourNode } from '@/lib/demo/tour-chapters'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TourNodePlace, TourNodeTitle } from '@/components/demo/demo-tour-labels'

/** The card a chapter or section ends on (.claude/plans/tour-chapters.md): on to what comes next in
 * the outline, Done, or back to the chapter picker. Built on the app's Dialog, like the intro and
 * outro modals. */
export function DemoTourChapterEndModal() {
    const { finishedNode, closeNodeEnd, startNode, restartTour } = useDemoTour()
    // The last one shown, kept while the dialog animates out so its copy doesn't change.
    const shownRef = useRef(finishedNode)
    if (finishedNode) shownRef.current = finishedNode
    const shown = shownRef.current
    const finished = shown ? tourNode(shown) : null
    const next = shown ? nextTourNode(shown) : null

    return (
        <Dialog open={!!finishedNode} onOpenChange={(open) => { if (!open) closeNodeEnd() }}>
            <DialogContent className="max-w-md gap-0 p-0">
                <div className="px-5 pt-5">
                    <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
                        <MapPinned className="h-3.5 w-3.5" />
                        Guided tour{finished && finished.ancestors.length > 0 ? ` · ${finished.ancestors.map((a) => a.title).join(' › ')}` : ''}
                    </p>
                    <DialogTitle className="mt-2">That&apos;s {finished ? <TourNodeTitle id={finished.id} /> : 'this part'}</DialogTitle>
                    <DialogDescription className="mt-1.5 leading-relaxed">
                        {next ? (
                            <>Up next: <span className="font-medium text-fg"><TourNodePlace id={next.id} /></span>.</>
                        ) : (
                            'That was the last part of the tour. Explore the demo on your own: the sample data is yours to play with, and nothing here is saved.'
                        )}
                    </DialogDescription>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-line px-5 py-3">
                    <Button variant="ghost" size="sm" onClick={restartTour}>All chapters</Button>
                    <div className="ml-auto flex min-w-0 items-center gap-2">
                        {next ? (
                            <>
                                <Button variant="outline" size="sm" onClick={closeNodeEnd}>Done</Button>
                                <Button size="sm" className="min-w-0" onClick={() => startNode(next.id)}>
                                    <span className="truncate">Next: <TourNodeTitle id={next.id} /></span>
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" onClick={closeNodeEnd}>Done</Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
