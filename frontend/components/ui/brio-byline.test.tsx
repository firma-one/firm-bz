import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BrioByline } from './brio-byline'
import { StatusPill } from './status-pill'
import { StatusIcon } from './status-icon'

// Noon UTC, so the date reads the same in every test-runner time zone.
const DATE = '2026-10-18T12:00:00Z'

describe('BrioByline', () => {
    it('credits Brio and the person who reviewed and published it', () => {
        const { container } = render(<BrioByline source="ai" publisherName="Alex Jordan" date={DATE} />)
        expect(container.textContent).toBe('Written by Brio · reviewed and published by Alex Jordan · Oct 18, 2026')
    })

    it('says "Edited by" for a hand-edited summary', () => {
        const { container } = render(<BrioByline source="manual" publisherName="Alex Jordan" date={DATE} />)
        expect(container.textContent).toBe('Edited by Alex Jordan · Oct 18, 2026')
    })

    it('falls back to Brio alone for older records without a publisher', () => {
        const { container } = render(<BrioByline source="ai" publisherName={null} date={DATE} />)
        expect(container.textContent).toBe('Written by Brio · Oct 18, 2026')
    })

    it('never credits Brio for a hand-written summary whose author is unknown', () => {
        // No publisher to name: say nothing false rather than "Written by Brio".
        const { container } = render(<BrioByline source="manual" date={DATE} />)
        expect(container.textContent).not.toContain('Brio')
    })
})

describe('StatusPill', () => {
    it('shows the lifecycle label in its stage colors, with the icon hidden from screen readers', () => {
        const { container } = render(<StatusPill kind="deliverable" status="in_review" />)
        const pill = container.firstElementChild!
        expect(pill.textContent).toBe('In review')
        expect(pill.className).toContain('bg-status-waiting-bg')
        expect(pill.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    })
})

describe('StatusIcon', () => {
    it('names the status for screen readers when it stands alone', () => {
        const { container } = render(<StatusIcon stage="done" label="Approved" />)
        expect(container.querySelector('.sr-only')!.textContent).toBe('Approved')
    })
})
