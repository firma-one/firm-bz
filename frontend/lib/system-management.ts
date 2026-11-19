/**
 * The System Management org (its firm admins are the platform's system admins). Its own module, with
 * no imports, so code that only needs the slug (lib/ai/spend-ceiling-notice.ts, under every AI call)
 * doesn't load the session and Supabase helpers that lib/permission-helpers.ts brings with it.
 */
export const SYSTEM_MANAGEMENT_ORG_SLUG = 'pockett-internal'
