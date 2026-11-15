/**
 * Names we don't know (§14 item 5, Layer 3): people a note or a message names who aren't anyone in our
 * records ("spoke with Raj Patel at the bank"). lib/ai/pseudonymize.ts masks the names we know by their
 * records; this finds the others from how text is written, so they're masked too.
 *
 * Rules, not a model: they run in-process on every Brio call, in microseconds, and send nothing anywhere.
 * (A name-recognition model, such as BERT-NER through transformers.js, would add a download on every cold
 * start and seconds per long memo to every chat.) A name is found when the words around it say it's one:
 * - a transcript's speaker ("Raj Patel: we'll send it"), on two or more lines when it's one word
 * - a title ("Dr. Lee", "Ms. Okafor")
 * - a greeting or sign-off ("Hi Raj", "Thanks, Raj")
 * - who did what: a name beside a word like "said", "asked", "agreed" or "spoke with", "from", "cc"
 *
 * It misses a name written with nothing around it to give it away, and it can take a capitalized word for
 * a name (a team, a place): masking a word that wasn't a name costs a little readability, never privacy.
 * So the copy says "names it recognizes", never "every name".
 *
 * Plain JavaScript regular expressions only: the project targets ES5, so no lookbehind and no `u` flag.
 */

/** A capitalized word as names are written: "Raj", "O'Brien", "D'Souza", "Anne-Marie", "José", "Raj's". */
const WORD = "(?:[A-Z\\u00C0-\\u00DE][a-z\\u00DF-\\u024F]?['\\u2019])?[A-Z\\u00C0-\\u00DE][a-z\\u00DF-\\u024F]+(?:-[A-Z\\u00C0-\\u00DE]?[a-z\\u00DF-\\u024F]+)?(?:['\\u2019]s)?"
/** One to three such words: "Raj", "Raj Patel", "Mary Anne Smith". */
const NAME = `${WORD}(?: ${WORD}){0,2}`

/**
 * Capitalized words that aren't names: what starts a sentence, days and months, teams and roles, the things
 * a firm talks about. Checked word by word, and trimmed from either end of a candidate.
 */
const NOT_NAMES = new Set(`
a an the this that these those there here then than and or but so if when while because after before since until
i we you he she it they me us him her them my our your his its their mine ours yours theirs who what which where why how
mr mrs ms miss mx dr prof sir
someone anyone everyone nobody somebody everybody all both each either neither none one some any many most few
something anything everything nothing
yes no ok okay thanks thank please hi hello hey dear cheers regards best sorry sure great good fine well morning afternoon
monday tuesday wednesday thursday friday saturday sunday today tomorrow yesterday tonight week weekend month year quarter
january february march april may june july august september october november december
board team teams client clients firm firms partner partners lead leads contributor contributors reviewer reviewers
finance legal marketing sales product engineering operations ops hr accounting tax audit compliance procurement pricing
management leadership executive executives director directors manager managers staff office committee council
company group bank government agency department ministry court school university section page chapter
brio firma firmä drive google microsoft onedrive sharepoint zoom slack outlook gmail excel word powerpoint
note notes action actions agenda decision decisions risk risks issue issues assumption assumptions next steps step
summary update updates question questions answer answers item items task tasks follow followup deliverable deliverables
draft drafts report reports review reviews call calls meeting meetings memo memos email emails comment comments
timeline budget launch scope plan plans status context background goal goals owner owners
also just only still even again maybe probably let lets re fyi asap tbd
`.split(/\s+/).filter(Boolean))

/** A word as a name word: without a possessive ("Raj's" is "Raj"). */
const bare = (w: string) => w.replace(/['’]s$/, '')

/**
 * The name inside a candidate, or null: ordinary words at either end are dropped ("Then Raj" is "Raj"),
 * possessives too, and what's left must be name words only, three letters at least.
 */
function nameIn(candidate: string): string | null {
    const words = candidate.split(' ').map(bare)
    while (words.length > 0 && NOT_NAMES.has(words[0].toLowerCase())) words.shift()
    while (words.length > 0 && NOT_NAMES.has(words[words.length - 1].toLowerCase())) words.pop()
    if (words.length === 0 || words.some((w) => NOT_NAMES.has(w.toLowerCase()))) return null
    const name = words.join(' ')
    return name.replace(/\s/g, '').length >= 3 ? name : null
}

/** Words before a name that say a person follows. Not "to" or "per": "to London" is as common as "to Raj". */
const BEFORE = '(?:with|from|by|cc|asked|told|called|emailed|messaged|met|ping|pinged|ask|tell|thank|thanked|introduced|meet)'
/** Words after a name that say it's a person. Not "will": a sentence starting "Pricing will" isn't about one. */
const AFTER = '(?:said|says|asked|asks|mentioned|agreed|agrees|confirmed|confirms|wants|wanted|thinks|thought|called|emailed|noted|replied|suggested|promised|explained|wrote)'
const GREETING = '(?:Hi|Hello|Hey|Dear|Thanks|Thank you|Cheers|Regards|Best)'
const TITLE = '(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof)'
const NOT_LETTER = '[^A-Za-z\\u00C0-\\u024F]'

/** A transcript's speaker, at the start of a line, bold or not: "Raj Patel: …", "**Raj:** …". */
const SPEAKER = new RegExp(`(^|\\n)[ \\t]*(?:\\*\\*)?(${NAME})(?:\\*\\*)?:(?:\\*\\*)?[ \\t]`, 'g')

const RULES: RegExp[] = [
    // A title: "Dr. Lee", "Ms Okafor".
    new RegExp(`(\\b${TITLE}\\.? )(${NAME})`, 'g'),
    // A greeting or sign-off: "Hi Raj,", "Thanks, Raj Patel."
    new RegExp(`(\\b${GREETING},? )(${NAME})(?=[,.!:;\\n]|$)`, 'g'),
    // Who did what, before: "spoke with Raj Patel", "cc Priya".
    new RegExp(`(\\b${BEFORE} )(${NAME})`, 'g'),
    // Who did what, after: "Raj said", "Priya Shah agreed".
    new RegExp(`(^|${NOT_LETTER})(${NAME})(?= ${AFTER}\\b)`, 'g'),
]

function matchesOf(rule: RegExp, text: string): string[] {
    const out: string[] = []
    rule.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.exec(text)) !== null) {
        if (m[2]) out.push(m[2])
        if (m[0].length === 0) rule.lastIndex++
    }
    return out
}

/** The distinct names the rules find in `text`, as written. */
export function detectNames(text: string): string[] {
    const found = new Set<string>()
    const add = (candidate: string) => {
        const name = nameIn(candidate)
        if (name) found.add(name)
    }
    // A speaker: a name of two or more words, or one word that speaks on more than one line ("Raj:"). Notes
    // label topics the same way ("Pricing: …"), but a topic rarely comes back as a label.
    const times = new Map<string, number>()
    for (const label of matchesOf(SPEAKER, text)) times.set(label, (times.get(label) ?? 0) + 1)
    times.forEach((n, label) => { if (label.indexOf(' ') > 0 || n >= 2) add(label) })
    for (const rule of RULES) matchesOf(rule, text).forEach(add)
    return Array.from(found)
}

/**
 * The words a found name is masked by wherever they appear: the name itself, and its first and last word
 * alone ("Raj Patel", "Raj", "Patel") when each could stand alone as a name.
 */
export function nameParts(name: string): { full: string; first: string | null; last: string | null } {
    const words = name.split(' ')
    if (words.length < 2) return { full: name, first: null, last: null }
    const usable = (w: string) => w.length >= 3 && !NOT_NAMES.has(w.toLowerCase())
    return {
        full: name,
        first: usable(words[0]) ? words[0] : null,
        last: usable(words[words.length - 1]) ? words[words.length - 1] : null,
    }
}
