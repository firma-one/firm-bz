/**
 * When each word on a step card is spoken, for the card to reveal its words as the narration reaches
 * them (.claude/plans/tour-chapters.md, Narration). The clip generator saves when each spoken word
 * starts (public/tour/narration/<key>.json); this lines the card's own words up with them.
 */

/** A spoken word and when it starts and ends in its clip, in seconds. */
export type SpokenWord = [text: string, start: number, end: number]

/** Letters and digits, lowercased and without accents: what a card word and a spoken word are compared by. */
function lettersOf(word: string): string {
    return word.normalize('NFD').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * For each card word, when the narration says it, or null when none of its letters are said (a
 * "⌘K" read out as "Command K", a lone "—"). Matched letter by letter, as the longest common run
 * of letters through both, so a word spoken in two parts or two words spoken as one still line up,
 * and words the card shows but the narration words differently are skipped over rather than
 * throwing out the rest.
 */
export function alignWords(cardWords: string[], spoken: SpokenWord[]): (number | null)[] {
    const card: number[] = []
    const cardText: string[] = []
    cardWords.forEach((word, i) => {
        for (const char of lettersOf(word)) {
            card.push(i)
            cardText.push(char)
        }
    })
    const said: number[] = []
    const saidText: string[] = []
    spoken.forEach(([word, start]) => {
        for (const char of lettersOf(word)) {
            said.push(start)
            saidText.push(char)
        }
    })

    // Longest common subsequence of the two runs of letters, then walked back to pair them up.
    const n = cardText.length
    const m = saidText.length
    const width = m + 1
    const table = new Uint16Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[i * width + j] = cardText[i] === saidText[j]
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
        }
    }
    const times: (number | null)[] = cardWords.map(() => null)
    let i = 0
    let j = 0
    while (i < n && j < m) {
        if (cardText[i] === saidText[j]) {
            // A word is said when its first matched letter is.
            if (times[card[i]] === null) times[card[i]] = said[j]
            i++
            j++
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            i++
        } else {
            j++
        }
    }
    return times
}

/**
 * When to reveal each card word: when it's said, or with the word before it when it isn't said
 * itself, and never before a word earlier on the card, so the card fills in reading order.
 */
export function revealTimes(cardWords: string[], spoken: SpokenWord[]): number[] {
    let last = 0
    return alignWords(cardWords, spoken).map((time) => {
        last = Math.max(last, time ?? last)
        return last
    })
}
