import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { tourSteps } from '@/components/demo/demo-tour-steps'
import { narrationClip } from '@/lib/demo/tour-narration'

/**
 * Narration when the browser refuses to play (Deepak, 2026-11-19): a "How this works" link opens the
 * tour in a new tab, where nothing has been clicked yet, so the first card's clip is refused
 * (NotAllowedError). The card must not claim to be reading aloud; it offers "Tap to hear", and that
 * one click starts the clip.
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
        expect(screen.queryByRole('button', { name: 'Tap to hear' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Stop reading aloud' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('offers Tap to hear, not an "on" speaker, when the browser refuses to play, and plays on that click', async () => {
        renderCard()
        await act(async () => {})
        const audio = FakeAudio.instances[0]
        const refusedCalls = audio.playCalls
        expect(refusedCalls).toBeGreaterThan(0)
        // The speaker no longer claims Brio is reading.
        expect(screen.queryByRole('button', { name: 'Stop reading aloud' })).toBeNull()
        const tap = screen.getByRole('button', { name: 'Tap to hear' })

        // The click is the gesture the browser waits for: the same clip plays, from the start.
        FakeAudio.refuse = false
        audio.currentTime = 1.5
        await act(async () => {
            fireEvent.click(tap)
        })
        expect(audio.playCalls).toBe(refusedCalls + 1)
        expect(audio.currentTime).toBe(0)
        expect(FakeAudio.instances).toHaveLength(1)
        expect(screen.queryByRole('button', { name: 'Tap to hear' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Stop reading aloud' })).toBeTruthy()
        expect(h.setNarration).not.toHaveBeenCalled()
    })

    it('plays the tour on again when Tap to hear is pressed while it is paused', async () => {
        const card = renderCard()
        await act(async () => {})
        h.paused = true
        card.rerender()
        FakeAudio.refuse = false
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Tap to hear' }))
        })
        expect(h.setPaused).toHaveBeenCalledWith(false)
        expect(FakeAudio.instances[0].paused).toBe(false)
    })

    it('runs silent with the speaker as it was when the clip fails to load, rather than asking for a tap', async () => {
        FakeAudio.refuse = false
        renderCard()
        await act(async () => {
            FakeAudio.instances[0].dispatchEvent(new Event('error'))
        })
        expect(screen.queryByRole('button', { name: 'Tap to hear' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Stop reading aloud' })).toBeTruthy()
    })
})
