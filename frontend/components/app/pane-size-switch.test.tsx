import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaneSizeSwitch } from './pane-size-switch'

describe('PaneSizeSwitch', () => {
    it('presses the current size and jumps straight to any other', () => {
        const onChange = vi.fn()
        render(<PaneSizeSwitch value="small" onChange={onChange} />)
        expect(screen.getByRole('group', { name: 'Pane size' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Side panel' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: 'Full screen' }).getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
        expect(onChange).toHaveBeenLastCalledWith('large')
        fireEvent.click(screen.getByRole('button', { name: 'Half screen' }))
        expect(onChange).toHaveBeenLastCalledWith('medium')
    })

    it('clicking the current size does nothing', () => {
        const onChange = vi.fn()
        render(<PaneSizeSwitch value="medium" onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: 'Half screen' }))
        expect(onChange).not.toHaveBeenCalled()
    })
})
