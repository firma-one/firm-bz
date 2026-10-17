import { describe, it, expect } from 'vitest'
import { displayFolderName, splitFolderOrdinal } from './display-names'

describe('splitFolderOrdinal', () => {
    it('takes the ordering number off a Drive-sorted name', () => {
        expect(splitFolderOrdinal('01__Market & Competitive Intelligence Report')).toEqual({ ordinal: '01', title: 'Market & Competitive Intelligence Report' })
        expect(splitFolderOrdinal('02_GTM_Strategy_&_Messaging')).toEqual({ ordinal: '02', title: 'GTM Strategy & Messaging' })
    })
    it('leaves a name without a number alone, tidying underscores', () => {
        expect(splitFolderOrdinal('Internal')).toEqual({ ordinal: null, title: 'Internal' })
        expect(displayFolderName('Q3 2026 Report')).toBe('Q3 2026 Report')
    })
})
