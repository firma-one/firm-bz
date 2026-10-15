import { describe, it, expect } from 'vitest'
import { initialsOf } from './initials'

describe('initialsOf', () => {
    it('takes the first and last words of a name', () => {
        expect(initialsOf('Deepak Shettigar')).toBe('DS')
        expect(initialsOf('Mary Anne de Souza')).toBe('MS')
    })

    it('uses one letter for a single word', () => {
        expect(initialsOf('Deepak')).toBe('D')
    })

    it('reads an email by its local part', () => {
        expect(initialsOf('deepak.shettigar@firmaone.com')).toBe('DS')
        expect(initialsOf('deepak@firmaone.com')).toBe('D')
    })

    it('ignores a leading @ and falls back when empty', () => {
        expect(initialsOf('@sam_roy')).toBe('SR')
        expect(initialsOf('')).toBe('?')
        expect(initialsOf(null, '')).toBe('')
    })
})
