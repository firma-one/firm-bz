import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HorizontalScroll } from './horizontal-scroll'

/** jsdom has no layout: give the row a width and content wider than it. */
function setup(scrollWidth: number, clientWidth: number) {
    const { container } = render(<HorizontalScroll><div>tabs</div></HorizontalScroll>)
    const row = container.firstElementChild as HTMLDivElement
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: scrollWidth })
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: clientWidth })
    return row
}

const wheel = (row: HTMLElement, deltaY: number, deltaX = 0) => {
    const e = new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true })
    row.dispatchEvent(e)
    return e
}

describe('HorizontalScroll', () => {
    it('turns a vertical wheel into a sideways scroll while there is room, and keeps the page still', () => {
        const row = setup(600, 300)
        const e = wheel(row, 120)
        expect(row.scrollLeft).toBe(120)
        expect(e.defaultPrevented).toBe(true)
    })

    it('lets the page scroll at the end, when everything fits, and for a sideways trackpad swipe', () => {
        const atEnd = setup(600, 300)
        atEnd.scrollLeft = 300
        expect(wheel(atEnd, 120).defaultPrevented).toBe(false)

        const fits = setup(300, 300)
        expect(wheel(fits, 120).defaultPrevented).toBe(false)

        const swipe = setup(600, 300)
        expect(wheel(swipe, 10, 80).defaultPrevented).toBe(false)
    })
})
