/**
 * AES-256-GCM Encryption Utility for Sensitive Data
 * 
 * Architecture:
 * - Master keys stored in Infisical/Vercel env (ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, etc.)
 * - CURRENT_KEY_VERSION env var determines which key to use for new encryptions
 * - Key version is embedded in ciphertext for self-describing format
 * - Supports lazy re-encryption on access when key version is outdated
 * 
 * Ciphertext Format: "v{n}$base64(iv + ciphertext + authTag)"
 * - v{n}: Key version prefix (e.g., "v1", "v2")
 * - $: Delimiter
 * - IV: 12 bytes (96 bits) - random per encryption
 * - Auth Tag: 16 bytes (128 bits)
 * - Ciphertext: variable length
 */

import crypto from 'crypto'

// Constants
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12      // 96 bits - recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits
const KEY_LENGTH = 32      // 256 bits
const VERSION_DELIMITER = '$'

// Cache for parsed keys to avoid repeated hex parsing
const keyCache = new Map<number, Buffer>()

/**
 * Get the current key version from environment
 */
export function getCurrentKeyVersion(): number {
  const version = process.env.CURRENT_KEY_VERSION
  if (!version) {
    return 1 // Default to V1
  }
  // Handle both "V1" and "1" formats
  const parsed = parseInt(version.replace(/^V/i, ''), 10)
  return isNaN(parsed) ? 1 : parsed
}

/**
 * Get encryption key for a specific version
 * Keys are expected as 64-character hex strings (32 bytes = 256 bits)
 */
function getKey(version: number): Buffer {
  // Check cache first
  const cached = keyCache.get(version)
  if (cached) {
    return cached
  }

  const envKey = `ENCRYPTION_KEY_V${version}`
  const keyHex = process.env[envKey]

  if (!keyHex) {
    throw new Error(`Encryption key not found: ${envKey}. Please set this environment variable.`)
  }

  // Validate key format
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error(`Invalid encryption key format for ${envKey}. Expected 64 hex characters (256 bits).`)
  }

  const keyBuffer = Buffer.from(keyHex, 'hex')
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length for ${envKey}. Expected ${KEY_LENGTH} bytes, got ${keyBuffer.length}.`)
  }

  // Cache the parsed key
  keyCache.set(version, keyBuffer)
  return keyBuffer
}

/**
 * Parse key version from ciphertext
 * Format: "v{n}$base64data"
 */
function parseVersionFromCiphertext(ciphertext: string): { version: number; payload: string } {
  const delimiterIndex = ciphertext.indexOf(VERSION_DELIMITER)
  
  if (delimiterIndex === -1 || !ciphertext.startsWith('v')) {
    throw new Error('Invalid ciphertext format: missing version prefix')
  }

  const versionStr = ciphertext.substring(1, delimiterIndex) // Skip 'v'
  const version = parseInt(versionStr, 10)
  
  if (isNaN(version) || version < 1) {
    throw new Error(`Invalid ciphertext format: invalid version "${versionStr}"`)
  }

  const payload = ciphertext.substring(delimiterIndex + 1)
  
  if (!payload) {
    throw new Error('Invalid ciphertext format: empty payload')
  }

  return { version, payload }
}

/**
 * Encrypt plaintext using AES-256-GCM
 * 
 * @param plaintext - The string to encrypt
 * @returns Ciphertext in format "v{n}$base64(iv+ciphertext+authTag)"
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty or null value')
  }

  const keyVersion = getCurrentKeyVersion()
  const key = getKey(keyVersion)

  // Generate random IV for each encryption (critical for GCM security)
  const iv = crypto.randomBytes(IV_LENGTH)

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  })

  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])

  // Get auth tag
  const authTag = cipher.getAuthTag()

  // Combine: IV + Ciphertext + AuthTag
  const combined = Buffer.concat([iv, encrypted, authTag])

  // Return self-describing format: v{n}$base64data
  return `v${keyVersion}${VERSION_DELIMITER}${combined.toString('base64')}`
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * 
 * @param ciphertext - Self-describing format "v{n}$base64(iv+ciphertext+authTag)"
 * @returns Decrypted plaintext string
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty or null value')
  }

  // Parse version from ciphertext
  const { version, payload } = parseVersionFromCiphertext(ciphertext)
  const key = getKey(version)

  // Decode from base64
  const combined = Buffer.from(payload, 'base64')

  // Validate minimum length: IV + AuthTag (at minimum)
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH
  if (combined.length < minLength) {
    throw new Error('Invalid ciphertext: payload too short')
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  })
  decipher.setAuthTag(authTag)

  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}

/**
 * Get the key version from a ciphertext without decrypting
 */
export function getKeyVersionFromCiphertext(ciphertext: string): number {
  const { version } = parseVersionFromCiphertext(ciphertext)
  return version
}

/**
 * Check if a ciphertext needs re-encryption (key version is outdated)
 */
export function needsReEncryption(ciphertext: string): boolean {
  try {
    const version = getKeyVersionFromCiphertext(ciphertext)
    return version < getCurrentKeyVersion()
  } catch {
    return false // If we can't parse it, don't try to re-encrypt
  }
}

/**
 * Re-encrypt a value with the current key version
 * Used for lazy key rotation on access
 * 
 * @param ciphertext - Current encrypted value
 * @returns New ciphertext with current key version, or null if already current
 */
export function reEncrypt(ciphertext: string): string | null {
  if (!needsReEncryption(ciphertext)) {
    return null
  }

  // Decrypt with embedded key version
  const plaintext = decrypt(ciphertext)

  // Encrypt with current key (version embedded in result)
  return encrypt(plaintext)
}

/**
 * Utility: Check if encryption is properly configured
 * Call this at app startup to fail fast if keys are missing
 */
export function validateEncryptionConfig(): void {
  const currentVersion = getCurrentKeyVersion()
  
  // Validate current key exists and is valid
  try {
    getKey(currentVersion)
  } catch (error) {
    throw new Error(
      `Encryption configuration invalid: ${(error as Error).message}. ` +
      `Ensure ENCRYPTION_KEY_V${currentVersion} is set with a valid 64-character hex string.`
    )
  }
}

/**
 * Utility: Generate a new encryption key (for documentation/setup)
 * Returns a 64-character hex string suitable for ENCRYPTION_KEY_Vx
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex')
}

/**
 * True for a value `encrypt` wrote: "v{n}$" then base64. Stricter than a "v…$" prefix check, which a
 * sentence like "valued at $5,000" passes, and which would leave that sentence stored as plain text.
 */
export function isCiphertext(value: string): boolean {
  return /^v\d+\$[A-Za-z0-9+/]+={0,2}$/.test(value)
}

/**
 * Encrypts a text field the Prisma extension can't reach, such as one inside a JSON column. Empty
 * stays empty, and a value already encrypted is left as it is.
 */
export function sealText(value: string): string {
  if (!value || isCiphertext(value)) return value
  return encrypt(value)
}

/**
 * Reads a field `sealText` wrote. A value from before it was encrypted comes back as it is, so old
 * rows keep working without a backfill.
 */
export function openText(value: string): string {
  if (!value || !isCiphertext(value)) return value
  try {
    return decrypt(value)
  } catch {
    console.warn('openText: a value could not be decrypted, returning it as stored')
    return value
  }
}
