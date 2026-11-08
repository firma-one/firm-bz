import { describe, it, expect } from 'vitest'
import { emailNotice } from './email-notice'

describe('emailNotice', () => {
    it('says how many of the emails went out', () => {
        expect(emailNotice('warning', { sent: 40, total: 42 })).toBe("Maintenance warning sent to 40 of 42 people. The rest didn't go out; the server log names them.")
        expect(emailNotice('complete', { sent: 3, total: 3 })).toBe('"Maintenance complete" email sent to all 3 people.')
        expect(emailNotice('warning', { sent: 0, total: 0 })).toBe('Maintenance warning: nobody to email.')
        expect(emailNotice('warning', null)).toBeNull()
    })
})
