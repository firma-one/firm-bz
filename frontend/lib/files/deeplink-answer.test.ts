import { describe, it, expect } from 'vitest'
import { deeplinkAnswer } from './deeplink-answer'

// A link that fails for any reason but 403 or 404 says "Couldn't open that link. Try again." and isn't
// remembered as "no access" for the rest of the visit.

describe('deeplinkAnswer', () => {
    it('is "no access" only when the server said not found or no access, and that is remembered', () => {
        expect(deeplinkAnswer(404, false)).toEqual({ remember: true, say: 'no_access' })
        expect(deeplinkAnswer(403, false)).toEqual({ remember: true, say: 'no_access' })
    })

    it('a 500 or a dropped connection is a failure to try again, not remembered', () => {
        expect(deeplinkAnswer(500, false)).toEqual({ remember: false, say: 'try_again' })
        expect(deeplinkAnswer(0, false)).toEqual({ remember: false, say: 'try_again' })
    })

    it('says nothing while the session is still arriving', () => {
        expect(deeplinkAnswer(401, false)).toEqual({ remember: false, say: null })
    })

    it('remembers a link it found', () => {
        expect(deeplinkAnswer(200, true)).toEqual({ remember: true, say: null })
        expect(deeplinkAnswer(500, true)).toEqual({ remember: true, say: null })
    })
})
