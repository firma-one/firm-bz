'use client'

import { Fragment, useState } from 'react'
import { Check, MapPinned } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { TOUR_OUTLINE, tourNode } from '@/lib/demo/tour-chapters'
import { CHAPTER_SUMMARIES, isNodeSeen as isSeen, tourSteps } from '@/components/demo/demo-tour-steps'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TOUR_MODE_LABELS, TOUR_NODE_ICONS, TourModeSwitch, TourNodeTitle } from '@/components/demo/demo-tour-labels'
import { cn } from '@/lib/utils'

/** The modal that opens the guided tour: how it plays (Autoplay, Step by step, Explore), then the
 * chapters in the data model's order, each one and each of its sections a click away, beside the
 * whole tour; or an offer to resume an unfinished run (progress lives in localStorage). Built on the
 * app's Dialog, so it portals out of the tour's shell and uses the app's design tokens. */
export function DemoTourIntroModal() {
    const { mode, setMode, showIntroModal, closeIntroModal, startTour, startNode, resumeTour, resumable, completedNodes } = useDemoTour()
    const wholeTour = mode === 'autoplay' ? 'Play the whole tour' : mode === 'explore' ? 'Start exploring' : 'Take the whole tour'
    const [neverShowAgain, setNeverShowAgain] = useState(false)

    const hasProgress = resumable !== null && resumable.step > 0
    const skip = () => closeIntroModal(neverShowAgain)

    return (
        <Dialog open={showIntroModal} onOpenChange={(open) => { if (!open) skip() }}>
            <DialogContent className="max-w-md gap-0 p-0">
                <div className="px-5 pt-5">
                    <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
                        <MapPinned className="h-3.5 w-3.5" />
                        Guided tour · {TOUR_OUTLINE.length} chapters
                    </p>
                    <DialogTitle className="mt-2">
                        {hasProgress ? 'Pick up where you left off?' : 'Welcome to the demo firm'}
                    </DialogTitle>
                    <DialogDescription className="mt-1.5 leading-relaxed">
                        {hasProgress
                            ? `You were partway through ${resumable.scope ? tourNode(resumable.scope).title : 'the whole tour'}. Resume it, or pick a chapter.`
                            : 'Everything here is sample data. Pick a chapter or one of its parts, or take the whole tour.'}
                    </DialogDescription>
                    <TourModeSwitch value={mode} onChange={setMode} className="mt-4" />
                    <p className="mt-1.5 text-caption text-fg-subtle">{TOUR_MODE_LABELS[mode].description}</p>
                </div>

                <ul className="subtle-scrollbar mt-3 max-h-[min(28rem,55vh)] overflow-y-auto px-2.5">
                    {TOUR_OUTLINE.map((chapter) => {
                        const sections = chapter.children ?? []
                        return (
                            <li key={chapter.id} className="flex items-start gap-3 rounded-control px-2.5 py-2 transition-colors hover:bg-surface-hover">
                                <span className="mt-0.5 flex shrink-0 items-center text-fg-muted [&_svg]:h-4 [&_svg]:w-4">{TOUR_NODE_ICONS[chapter.id]}</span>
                                <div className="min-w-0 flex-1">
                                    <button
                                        type="button"
                                        onClick={() => startNode(chapter.id)}
                                        className="text-left text-ui font-medium text-fg underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                                    >
                                        {chapter.title}
                                    </button>
                                    {sections.length > 0 ? (
                                        // Each section starts on its own.
                                        <p className="text-small leading-relaxed text-fg-muted">
                                            {sections.map((section, i) => (
                                                <Fragment key={section.id}>
                                                    {i > 0 && <span className="text-fg-subtle" aria-hidden> · </span>}
                                                    <button
                                                        type="button"
                                                        onClick={() => startNode(section.id)}
                                                        // Quieter once seen
                                                        className={cn('underline-offset-2 transition-colors hover:text-fg hover:underline focus-visible:underline focus-visible:outline-none', isSeen(section.id, completedNodes) && 'text-fg-subtle')}
                                                    >
                                                        <TourNodeTitle id={section.id} />
                                                    </button>
                                                </Fragment>
                                            ))}
                                        </p>
                                    ) : (
                                        <p className="text-small text-fg-muted">{CHAPTER_SUMMARIES[chapter.id]}</p>
                                    )}
                                </div>
                                {isSeen(chapter.id, completedNodes) ? (
                                    <span className="mt-0.5 flex shrink-0 items-center gap-1 text-caption text-fg-subtle">
                                        <Check className="h-3.5 w-3.5 text-action" />
                                        Seen
                                    </span>
                                ) : (
                                    <span className="mt-0.5 shrink-0 text-caption tabular-nums text-fg-subtle">{tourSteps(chapter.id).length === 1 ? '1 step' : `${tourSteps(chapter.id).length} steps`}</span>
                                )}
                            </li>
                        )
                    })}
                </ul>

                <div className="mt-3 flex items-center gap-2 border-t border-line px-5 py-3">
                    {!hasProgress && (
                        <label className="flex cursor-pointer select-none items-center gap-2 text-caption text-fg-muted">
                            <Checkbox checked={neverShowAgain} onCheckedChange={(v) => setNeverShowAgain(v === true)} />
                            Don&apos;t show this again
                        </label>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        {hasProgress ? (
                            <>
                                <Button variant="ghost" size="sm" onClick={startTour}>{wholeTour}</Button>
                                <Button size="sm" onClick={resumeTour}>Resume</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" size="sm" onClick={skip}>Skip</Button>
                                <Button size="sm" onClick={startTour}>{wholeTour}</Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
