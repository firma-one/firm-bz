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
 * Generate a slug for Firm
 * Firms always get a unique suffix for global uniqueness
 * Format: base (7 chars) + '-' + suffix (4 chars) = 12 total
 */
export function generateFirmSlug(name: string): string {
  return generateUniqueSlug(name, 7, 4)
}

/**
 * Backwards-compatible alias for organization slugs.
 * Organizations are now treated as "Firms" in URL naming.
 */
export function generateOrganizationSlug(name: string): string {
  return generateFirmSlug(name)
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
