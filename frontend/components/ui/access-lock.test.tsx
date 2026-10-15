import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccessLock } from './access-lock'

describe('AccessLock', () => {
    it('names who can see the item, for screen readers and as the tooltip trigger', () => {
        render(<AccessLock label="Firm admins only" />)
        expect(screen.getByRole('img', { name: 'Firm admins only' })).toBeTruthy()
    })
})
