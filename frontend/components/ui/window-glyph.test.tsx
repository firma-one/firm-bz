import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { WindowGlyph } from './window-glyph'

describe('WindowGlyph', () => {
    it('draws the panel filled when it is showing', () => {
        const { container } = render(<WindowGlyph variant="left" />)
        const rects = container.querySelectorAll('rect')
        expect(rects).toHaveLength(2)
        expect(rects[1].getAttribute('fill')).toBe('currentColor')
        expect(container.querySelector('line')).toBeNull()
    })

    it('draws only a side panel\'s edge when it is hidden', () => {
        const { container } = render(<WindowGlyph variant="left" filled={false} />)
        expect(container.querySelectorAll('rect')).toHaveLength(1)
        expect(container.querySelector('line')?.getAttribute('x1')).toBe('6')
    })

    it('keeps full and float filled, as they have no edge to show', () => {
        for (const variant of ['full', 'float'] as const) {
            const { container, unmount } = render(<WindowGlyph variant={variant} filled={false} />)
            expect(container.querySelectorAll('rect')).toHaveLength(2)
            unmount()
        }
    })
})
