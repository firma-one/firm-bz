import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { tourSteps } from '@/components/demo/demo-tour-steps'
import { narrationClip } from '@/lib/demo/tour-narration'

/**
 * Narration when the browser refuses to play (Deepak, 2026-11-19): a "How this works" link opens the
 * tour in a new tab, where nothing has been clicked yet, so the first card's clip is refused
 * (NotAllowedError). The card waits at the start and offers Play; that one click starts the clip,
 * with narration left on (the speaker turns it off).
 */

const h = vi.hoisted(() => ({ setNarration: vi.fn(), setPaused: vi.fn(), paused: false }))

vi.mock('@/lib/demo/demo-tour-context', () => ({
    useDemoTour: () => ({ mode: 'autoplay', paused: h.paused, setPaused: h.setPaused, narration: true, setNarration: h.setNarration }),
}))

import { TourTooltip } from './demo-tour'

/** A stand-in for the browser's Audio: `refuse` decides whether play() is refused for autoplay. */
class FakeAudio extends EventTarget {
    static instances: FakeAudio[] = []
    static refuse = true
    currentTime = 0
    ended = false
    paused = true
    playCalls = 0
    constructor(public src: string) {
        super()
        FakeAudio.instances.push(this)
    }
    play() {
        this.playCalls += 1
        if (FakeAudio.refuse) return Promise.reject(new DOMException('play() needs a user gesture', 'NotAllowedError'))
        this.paused = false
        queueMicrotask(() => this.dispatchEvent(new Event('playing')))
        return Promise.resolve()
    }
    pause() {
        this.paused = true
    }
}

const step = tourSteps(null).find((s) => narrationClip(s))!

function cardProps() {
    const noop = () => {}
    const button = { 'aria-label': '', onClick: noop, role: 'button', title: '' }
    const props = {
        backProps: { ...button, 'data-action': 'back' },
        closeProps: { ...button, 'data-action': 'close' },
        primaryProps: { ...button, 'data-action': 'primary' },
        skipProps: { ...button, 'data-action': 'skip' },
        tooltipProps: { 'aria-modal': true, role: 'alertdialog' },
        step: { title: step.title, content: step.content, data: { node: step.node, indexInNode: step.indexInNode, nodeSize: step.nodeSize, wholeTour: false } },
        index: 0,
        isLastStep: false,
        size: 1,
        controls: { next: vi.fn() },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return props as any
}

function renderCard() {
    const props = cardProps()
    const view = render(<TourTooltip {...props} />)
    return { rerender: () => view.rerender(<TourTooltip {...props} />) }
}

beforeEach(() => {
    FakeAudio.instances = []
    FakeAudio.refuse = true
    h.paused = false
    h.setPaused.mockClear()
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))
})

afterEach(() => vi.unstubAllGlobals())

describe('a tour card read aloud', () => {
    it('plays its clip as it opens when the browser allows it', async () => {
        FakeAudio.refuse = false
        renderCard()
        await act(async () => {})
        expect(FakeAudio.instances[0].playCalls).toBeGreaterThan(0)
        expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Stop reading aloud' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('offers Play, with narration left on, when the browser refuses to play, and plays on that click', async () => {
        renderCard()
        await act(async () => {})
        const audio = FakeAudio.instances[0]
        const refusedCalls = audio.playCalls
        expect(refusedCalls).toBeGreaterThan(0)
        // Narration stays on, and can still be turned off; Play replaces Pause and leads, ahead of Next.
        expect(screen.getByRole('button', { name: 'Stop reading aloud' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
        expect(screen.queryByText('Tap to hear')).toBeNull()
        // Play is the only way on: no Next or Back beside it.
        expect(screen.queryByRole('button', { name: /^(Next|Finish|Back)$/ })).toBeNull()
        const tap = screen.getByRole('button', { name: 'Play' })

        // The click is the gesture the browser waits for: the same clip plays, from the start.
        FakeAudio.refuse = false
        audio.currentTime = 1.5
        await act(async () => {
            fireEvent.click(tap)
        })
        expect(audio.playCalls).toBe(refusedCalls + 1)
        expect(audio.currentTime).toBe(0)
        expect(FakeAudio.instances).toHaveLength(1)
        // Playing: the card is back to its usual controls.
        expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Stop reading aloud' })).toBeTruthy()
        expect(h.setNarration).not.toHaveBeenCalled()
    })

    it('leaves Next out of a single feature in Autopilot, which moves on by itself, and keeps it for the whole tour', async () => {
        FakeAudio.refuse = false
        const feature = render(<TourTooltip {...cardProps()} />)
        await act(async () => {})
        expect(screen.queryByRole('button', { name: /^(Next|Finish)$/ })).toBeNull()
        feature.unmount()

        const whole = cardProps()
        whole.step.data.wholeTour = true
        render(<TourTooltip {...whole} />)
        await act(async () => {})
        expect(screen.getByRole('button', { name: /^(Next|Finish)$/ })).toBeTruthy()
    })

    it('lets the visitor turn narration off instead of pressing Play', async () => {
        h.setNarration.mockClear()
        renderCard()
        await act(async () => {})
        fireEvent.click(screen.getByRole('button', { name: 'Stop reading aloud' }))
        expect(h.setNarration).toHaveBeenCalledWith(false)
    })

    it('waits for Play with its clock at the start, instead of running on silently', async () => {
        vi.useFakeTimers()
        try {
            const props = cardProps()
            render(<TourTooltip {...props} />)
            await act(async () => {})
            expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
            await act(async () => {
                vi.advanceTimersByTime(60_000)
            })
            expect(screen.getByRole('progressbar', { name: 'Time on this step' }).getAttribute('aria-valuenow')).toBe('0')
            expect(props.controls.next).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it('plays the tour on again when Play is pressed while it is paused', async () => {
        const card = renderCard()
        await act(async () => {})
        h.paused = true
        card.rerender()
        FakeAudio.refuse = false
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Play' }))
        })
        expect(h.setPaused).toHaveBeenCalledWith(false)
        expect(FakeAudio.instances[0].paused).toBe(false)
    })

    it('runs silent with the speaker as it was when the clip fails to load, rather than asking for Play', async () => {
        FakeAudio.refuse = false
        renderCard()
        await act(async () => {
            FakeAudio.instances[0].dispatchEvent(new Event('error'))
        })
        expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Stop reading aloud' })).toBeTruthy()
    })
})
