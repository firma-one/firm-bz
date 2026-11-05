/**
 * Recipient handling for /system/email-delivery. No server imports: the page checks addresses as
 * they are typed, and the send route checks them again.
 */

/**
 * How many recipients one send request carries. The page sends in batches of this size so a long
 * list can't outrun a serverless time limit, and so it knows the outcome of everything already sent
 * if one request fails.
 */
export const EMAIL_DELIVERY_BATCH_SIZE = 10

const EMAIL = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[^\s@,;<>"'().]{2,}$/

export function isValidEmail(value: string): boolean {
    return EMAIL.test(value)
}

/**
 * Splits pasted text into addresses. Commas are the documented separator; semicolons and line
 * breaks are accepted too, since that is how a list pasted from a mail client or sheet arrives.
 * Addresses come back lowercased and without duplicates.
 */
export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
    const valid = new Set<string>()
    const invalid = new Set<string>()
    for (const raw of text.split(/[,;\s]+/)) {
        const token = raw.trim().toLowerCase()
        if (!token) continue
        if (isValidEmail(token)) valid.add(token)
        else invalid.add(token)
    }
    return { valid: Array.from(valid), invalid: Array.from(invalid) }
}
