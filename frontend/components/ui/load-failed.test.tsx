import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LoadFailed } from './load-failed'

describe('LoadFailed', () => {
    it('says what failed and why, and offers a retry', () => {
        const onRetry = vi.fn()
        render(<LoadFailed what="the Board" reason="The server answered 500. Try again." onRetry={onRetry} />)
        expect(screen.getByRole('alert').textContent).toContain("Couldn't load the Board")
        expect(screen.getByText('The server answered 500. Try again.')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(onRetry).toHaveBeenCalledOnce()
    })

    it('has a fallback reason and no button without a retry', () => {
        render(<LoadFailed what="members" />)
        expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })
})
