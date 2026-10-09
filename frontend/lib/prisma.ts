import { PrismaClient } from '@prisma/client'
import { encrypt, decrypt } from './encryption'
import { AGENT_EMAIL_DOMAIN } from './ai/agent-email'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// For Supabase:
// 1. DATABASE_URL: Connect to port 6543 (Transaction Pooler)
//    Format: postgres://[user]:[password]@[host]:6543/[db]?pgbouncer=true&connection_limit=1
//    If you see "Unable to start a transaction in the given time", increase the pooler's
//    transaction/connect timeout in Supabase Dashboard: Project Settings -> Database -> Connection Pooling.
// 2. DIRECT_URL: Connect to port 5432 (Session Mode) - used for migrations
//    Format: postgres://[user]:[password]@[host]:5432/[db]

/**
 * Extended Prisma Client with automatic encryption/decryption for sensitive fields.
 * 
 * Usage:
 * - READ: Use `connector.accessTokenDecrypted` to get plaintext
 * - WRITE: Pass plaintext to create/update - encryption is automatic
 */

// Helper to safely decrypt names
function safeDecrypt(val: string | null | undefined): string {
  if (!val) return ''
  // If it doesn't look like our ciphertext format (v1$, etc), assume it's legacy/plaintext
  if (!val.startsWith('v') || !val.includes('$')) return val;
  try {
    return decrypt(val)
  } catch (e) {
    console.warn('Failed to decrypt, returning raw value')
    return val
  }
}

// Helper to safely encrypt a value. Handles strings and numeric types (Decimal, number).
function safeEncrypt(val: any): any {
  if (val === null || val === undefined) return val
  const str = typeof val === 'string' ? val : String(val)
  if (str.length === 0) return val
  // Avoid double encryption
  if (str.startsWith('v') && str.includes('$')) return str
  return encrypt(str)
}

const ENCRYPTED_FIELDS_MAP: Record<string, string[]> = {
  group:              ['name'],
  firm:               ['name'],
  client:             ['name', 'description', 'internalMemo', 'billingAddress', 'relationshipValue'],
  engagement:         ['name', 'description', 'rateOrValue'],
  clientcontact:      ['name', 'email', 'phone', 'notes'],
  doccommentmessage:  ['content'],
  connector:          ['accessToken', 'refreshToken', 'name'],
}

/**
 * Recursively encrypts sensitive fields in a data object based on model definitions.
 */
function encryptData(data: any, modelName: string): any {
  if (!data || typeof data !== 'object') return data;
  const fields = ENCRYPTED_FIELDS_MAP[modelName.toLowerCase()];
  if (!fields) return data;

  const result = { ...data };
  for (const field of fields) {
    if (result[field]) {
      result[field] = safeEncrypt(result[field]);
    }
  }
  return result;
}

/**
 * Recursively decrypts sensitive fields in a result object or array.
 */
function decryptResult(result: any, modelName: string | undefined): any {
  if (!result || typeof result !== 'object') return result;

  // Handle arrays
  if (Array.isArray(result)) {
    return result.map(item => decryptResult(item, modelName));
  }

  const modelKey = modelName?.toLowerCase();
  const fields = modelKey ? ENCRYPTED_FIELDS_MAP[modelKey] : null;

  // Decrypt registered fields for this model
  if (fields) {
    for (const field of fields) {
      if (typeof result[field] === 'string') {
        const decrypted = safeDecrypt(result[field]);
        // For backward compatibility with older code (like GoogleDriveConnector)
        result[field + 'Decrypted'] = decrypted;
        // For transparent use in UI and service logic
        result[field] = decrypted;
      }
    }
  }

  // Recursively handle nested relations/includes
  for (const key in result) {
    if (result[key] && typeof result[key] === 'object') {
      // If it's a relation, we might not know the model name easily from the result key
      // but we can check if the key matches a model name in our map
      const nestedModelName = key.toLowerCase();
      // Most relations are singular (client) or plural (projects)
      // This is a simple heuristic:
      const potentialModelName = Object.keys(ENCRYPTED_FIELDS_MAP).find(m =>
        nestedModelName === m || nestedModelName === m + 's' || (m.endsWith('y') && nestedModelName === m.slice(0, -1) + 'ies')
      );

      result[key] = decryptResult(result[key], potentialModelName);
    }
  }

  return result;
}

const globalForBasePrisma = globalThis as unknown as {
  basePrisma: PrismaClient | undefined
}

export const basePrisma = globalForBasePrisma.basePrisma ?? new PrismaClient()

if (process.env.NODE_ENV === 'development') globalForBasePrisma.basePrisma = basePrisma

/**
 * Agent user ids, resolved once per process.
 *
 * A cache rather than a lookup per notification: the set changes only when a firm is created, and
 * a database round trip on every notification write would be a poor trade for a filter. Refreshed
 * lazily on a miss so a firm created after boot is picked up.
 */
let agentIdCache: { ids: Set<string>; loadedAt: number } | null = null
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000

async function agentUserIds(): Promise<Set<string>> {
  const fresh = agentIdCache && Date.now() - agentIdCache.loadedAt < AGENT_CACHE_TTL_MS
  if (fresh) return agentIdCache!.ids

  try {
    const rows = await basePrisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM auth.users WHERE email LIKE $1`,
      `%@${AGENT_EMAIL_DOMAIN}`,
    )
    agentIdCache = { ids: new Set(rows.map((r) => r.id)), loadedAt: Date.now() }
  } catch {
    // Keep whatever we had rather than failing the write: a missed filter costs an unread row.
    agentIdCache = agentIdCache ?? { ids: new Set(), loadedAt: Date.now() }
  }
  return agentIdCache.ids
}

/**
 * Removes agent recipients from a notification write, in place.
 *
 * Returns null when nothing is left to write, so the caller can skip the query entirely.
 */
async function stripAgentRecipients(anyArgs: any, operation: string): Promise<unknown> {
  const agents = await agentUserIds()
  if (agents.size === 0) return anyArgs

  if (operation === 'create') {
    return agents.has(anyArgs?.data?.userId) ? null : anyArgs
  }

  const data = anyArgs?.data
  if (!Array.isArray(data)) {
    return agents.has(data?.userId) ? null : anyArgs
  }

  anyArgs.data = data.filter((row: any) => !agents.has(row?.userId))
  return anyArgs.data.length === 0 ? null : anyArgs
}

function createExtendedPrismaClient() {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const anyArgs = args as any

          // 0. Drop notifications addressed to an agent.
          //
          // Brio is a firm member, so it lands in recipient lists computed from membership — and
          // several of those apply no role filter at all. Nothing reads a notification addressed
          // to it, so the rows would accumulate forever.
          //
          // Filtered here rather than at each writer because there are eleven of them, they do not
          // share a helper, and a guard added per site is one a twelfth site will not have. This
          // is the one place every write must pass through.
          if (model === 'Notification' && ['create', 'createMany'].includes(operation)) {
            const filtered = await stripAgentRecipients(anyArgs, operation)
            // Every row was for an agent: skip the query rather than issue an empty createMany.
            if (filtered === null) return operation === 'createMany' ? { count: 0 } : null
          }

          // 1. Encryption on Write
          if (['create', 'update', 'upsert'].includes(operation)) {
            if (operation === 'upsert') {
              if (anyArgs.create) anyArgs.create = encryptData(anyArgs.create, model)
              if (anyArgs.update) anyArgs.update = encryptData(anyArgs.update, model)
            } else if (anyArgs.data) {
              anyArgs.data = encryptData(anyArgs.data, model)
            }
          }

          // 2. Execute Query
          const result = await query(args)

          // 3. Decryption on Read
          return decryptResult(result, model)
        }
      }
    }
  })
}

// Type for the extended client
export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createExtendedPrismaClient()

/**
 * Sets session variables for RLS policies. RLS helper functions read app.current_user_id.
 * When the DB connection uses a role without BYPASSRLS, policies enforce row-level isolation.
 */
export function getPrismaWithRls(accessToken: string | null | undefined) {
  if (!accessToken) return prisma

  let decodedClaims = "{}"
  let userId = ""
  try {
    const payload = accessToken.split('.')[1]
    if (payload) {
      decodedClaims = Buffer.from(payload, 'base64').toString('utf-8')
      const claims = JSON.parse(decodedClaims) as { sub?: string }
      userId = claims.sub ?? ""
    }
  } catch (error) {
    console.error('Failed to decode JWT for RLS:', error)
  }

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            const [, , result] = await prisma.$transaction([
              prisma.$executeRawUnsafe(
                `SELECT set_config('request.jwt.claims', $1, TRUE)`,
                decodedClaims
              ),
              prisma.$executeRawUnsafe(
                `SELECT set_config('app.current_user_id', $1, TRUE)`,
                userId
              ),
              query(args),
            ])
            return result
          } catch (error) {
            console.error('Prisma RLS Query Error:', error)
            throw error
          }
        },
      },
    },
  })
}

// In development, store prisma on global to prevent connection exhaustion during hot reloads
if (process.env.NODE_ENV === 'development') globalForPrisma.prisma = prisma
