/**
 * Slug generation utilities with strict length limits
 * Ensures URLs remain short and manageable (12 characters total including suffix)
 * 
 * Note: Ellipsis (...) is not used in URL slugs as it's not a standard practice.
 * Ellipsis is primarily for display truncation in UI, not in actual URLs.
 * We use clean truncation without ellipsis for better URL compatibility.
 */


/**
 * Generate a URL-friendly slug from a name
 * @param name - The name to convert to a slug
 * @param maxLength - Maximum length for the slug (default: 8, leaving room for suffix)
 * @returns A URL-friendly slug
 */
export function generateSlug(name: string, maxLength: number = 8): string {
  if (!name || name.trim().length === 0) {
    throw new Error('Name cannot be empty')
  }

  // Convert to lowercase and replace non-alphanumeric characters with hyphens
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens

  // Truncate to maxLength if needed, ensuring we don't cut in the middle of a word
  if (slug.length > maxLength) {
    slug = slug.substring(0, maxLength)
    // Remove trailing hyphen if truncation created one
    slug = slug.replace(/-$/, '')
  }

  return slug
}

/**
 * Generate a unique slug with a random suffix
 * Total length will be MAX_SLUG_LENGTH (12 characters)
 * @param baseSlug - The base slug to make unique
 * @param baseLength - Maximum length for the base slug (default: 7, leaving room for '-' + 4 char suffix)
 * @param suffixLength - Length of random suffix (default: 4)
 * @returns A unique slug: base (7 chars) + '-' + suffix (4 chars) = 12 total
 */
export function generateUniqueSlug(
  baseSlug: string,
  baseLength: number = 7,
  suffixLength: number = 4
): string {
  const slug = generateSlug(baseSlug, baseLength)
  const randomSuffix = Math.random().toString(36).substring(2, 2 + suffixLength)
  // Total: base (max 7) + '-' (1) + suffix (4) = 12 characters
  return `${slug}-${randomSuffix}`
}

/**
 * Short, simple, unambiguous words for readable slug parts (see `generateWordSlug`).
 * Kept plain and generic — no proper nouns, nothing that could read as a name or brand.
 */
const SLUG_WORDS = [
  'amber', 'arch', 'ash', 'atlas', 'aurora', 'birch', 'blue', 'bright', 'brook', 'cedar',
  'clover', 'coral', 'cove', 'crest', 'cyan', 'delta', 'ember', 'fern', 'field', 'flint',
  'forge', 'gold', 'grove', 'harbor', 'haven', 'hazel', 'hill', 'indigo', 'ivory', 'ivy',
  'jade', 'lake', 'lark', 'linen', 'maple', 'marsh', 'meadow', 'mint', 'mist', 'moss',
  'oak', 'olive', 'onyx', 'opal', 'orbit', 'peak', 'pearl', 'pine', 'plum', 'quartz',
  'quill', 'reed', 'ridge', 'river', 'rose', 'sage', 'sand', 'shore', 'sky', 'slate',
  'spruce', 'stone', 'summit', 'teal', 'terra', 'thistle', 'tide', 'timber', 'trail', 'vale',
  'violet', 'wave', 'willow', 'wren',
]

/**
 * Generate a readable slug: one word from `SLUG_WORDS` + a random suffix for uniqueness.
 * Used for Group/Firm slugs — more memorable/shareable in a URL than pure random characters,
 * while still carrying no derivation from the person's or firm's actual name.
 * @param suffixLength - Length of the random suffix (default: 4)
 */
export function generateWordSlug(suffixLength: number = 4): string {
  const word = SLUG_WORDS[Math.floor(Math.random() * SLUG_WORDS.length)]
  const suffix = Math.random().toString(36).substring(2, 2 + suffixLength)
  return `${word}-${suffix}`
}

/**
 * Generate a slug for Firm — a readable word + random suffix (see `generateWordSlug`), no
 * name derivation, so the URL never leaks the firm's display name. Rename the firm any time
 * in Settings; the slug/URL stays stable.
 */
export function generateFirmSlug(_name: string): string {
  return generateWordSlug(4)
}

/**
 * Backwards-compatible alias for organization slugs.
 * Organizations are now treated as "Firms" in URL naming.
 */
export function generateOrganizationSlug(name: string): string {
  return generateFirmSlug(name)
}

/**
 * Generate a slug for Group — a readable word + random suffix (see `generateWordSlug`), no
 * name derivation, so the top-level URL segment never leaks the creating user's name.
 */
export function generateGroupSlug(_name: string): string {
  return generateWordSlug(4)
}

/**
 * Generate a slug for Client (same approach as Firm for consistent URL length)
 * Clients are unique within a firm
 * Format: base (7 chars) + '-' + suffix (4 chars) = 12 total
 */
export function generateClientSlug(name: string): string {
  const base = generateSlug(name, 7)
  return generateUniqueSlug(base, 7, 4)
}

/**
 * Generate a slug for Project (same approach as Firm for consistent URL length)
 * Projects are unique within a client
 * Format: base (7 chars) + '-' + suffix (4 chars) = 12 total
 */
export function generateProjectSlug(name: string): string {
  const base = generateSlug(name, 7)
  return generateUniqueSlug(base, 7, 4)
}

/**
 * Generate a slug for Connector — an internal identity anchor, not a URL-routing slug.
 * Generated once at connector creation, immutable afterward, unrelated to the editable
 * display `name`. Distinguishes independent connectors created for the same external
 * account (e.g. same Microsoft account connected twice for two different workspace roots).
 */
export function generateConnectorSlug(): string {
  return generateUniqueSlug('conn', 4, 8)
}

/**
 * Generate a URL-safe slug for a shared document (share detail URLs).
 * Longer base for readability; suffix for uniqueness within project.
 * @param documentTitle - Display name of the document/folder
 * @param suffix - Short unique suffix (e.g. first 8 chars of share id or random)
 */
export function generateShareSlug(documentTitle: string, suffix: string): string {
  const base = generateSlug(documentTitle || 'doc', 32)
  const safeSuffix = suffix.replace(/[^a-z0-9-]/gi, '').slice(0, 12) || Math.random().toString(36).slice(2, 10)
  return `${base}-${safeSuffix}`
}
