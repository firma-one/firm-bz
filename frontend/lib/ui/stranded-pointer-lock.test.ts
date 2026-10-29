import { describe, it, expect, beforeEach } from 'vitest'
import { releaseStrandedPointerLock } from './stranded-pointer-lock'

// A closed menu or dialog must not leave the page unclickable (2026-10-28).

beforeEach(() => {
    document.body.innerHTML = ''
    document.body.style.pointerEvents = ''
})

describe('releaseStrandedPointerLock', () => {
    it('gives the page its clicks back when nothing is open', () => {
        document.body.style.pointerEvents = 'none'
        expect(releaseStrandedPointerLock()).toBe(true)
        expect(document.body.style.pointerEvents).toBe('')
    })

    it('leaves a live dialog or menu alone', () => {
        for (const role of ['dialog', 'alertdialog', 'menu']) {
            document.body.innerHTML = `<div role="${role}" data-state="open"></div>`
            document.body.style.pointerEvents = 'none'
            expect(releaseStrandedPointerLock()).toBe(false)
            expect(document.body.style.pointerEvents).toBe('none')
        }
    })

    it('does release while a closed one is still animating out', () => {
        document.body.innerHTML = '<div role="dialog" data-state="closed"></div>'
        document.body.style.pointerEvents = 'none'
        expect(releaseStrandedPointerLock()).toBe(true)
    })

    it('does nothing when the page was never locked', () => {
        expect(releaseStrandedPointerLock()).toBe(false)
    })
})
