# Admin Operations & Monitoring

**Document purpose:** This document describes system administration tools, integration health monitoring, and onboarding recovery procedures for support and operations teams.

**Audience:** DevOps engineers, support staff, and operational stakeholders responsible for system health and user onboarding recovery.

**Related documents:** [HLD](hld.md) (system architecture), [Background Jobs (Inngest)](hld-inngest-jobs.md) (async task processing).

---

## Overview

The Admin Operations section provides tools for:
- **Integration Health Monitoring** — Real-time status of critical services (Database, Inngest, Polar, SMTP)
- **Onboarding Recovery** — Detect and recover firms stuck in provisioning when services fail
- **Administrative Utilities** — User management, billing, link generation, and workspace inspection

All admin pages are protected by `SYS_ADMIN` role (verified via Supabase `app_metadata`).

---

## Integration Status Monitoring

### Purpose

When a critical service (e.g., Inngest) is down during user onboarding, the `sandbox.provision.requested` event fires silently and fails. The firm's `settings.onboarding.stage` remains at `"provisioning"` forever, blocking the user's workspace from being created.

The **Integration Status** page at `/system/integrations` allows support teams to:
1. Monitor real-time health of all integrations
2. Identify stuck onboarding workflows
3. Manually trigger provisioning recovery

### Services Monitored

| Service | Check Method | Status Values | Purpose |
|---------|--------------|---------------|---------|
| **Database** | `SELECT 1` query | UP / DOWN | Primary data store health |
| **Inngest** | `inngest.send()` with 5s timeout | UP / DOWN | Background job queue |
| **Polar** | `fetchBillingCatalogPlans()` | UP / DOWN | Billing & subscription provider |
| **SMTP** | `nodemailer.verify()` connection test | CONFIGURED / UNCONFIGURED | Email delivery with actual auth test |

**Response shape:**
```typescript
{
  database: { status: 'up' | 'down', latencyMs?: number, error?: string }
  inngest: { status: 'up' | 'down', mode: 'dev' | 'production', error?: string }
  polar: { status: 'up' | 'down', error?: string }
  smtp: { status: 'configured' | 'unconfigured', host?: string }
  checkedAt: string  // ISO timestamp
}
```

### API Endpoint

**`GET /api/system/integrations/status`**

- **Auth:** SYS_ADMIN role required
- **Latency:** Runs all checks in parallel, typically 1-3 seconds
- **Caching:** None (always fresh); page auto-refreshes every 30 seconds

---

## Onboarding Recovery

### What is a "Stuck" Firm?

A firm is stuck in provisioning when:

| Condition | Value |
|-----------|-------|
| `firm.settings.onboarding.stage` | `"provisioning"` |
| `firm.settings.onboarding.isComplete` | `false` |
| `firm.connectorId` | non-null UUID |
| `firm.deletedAt` | null |

**Root cause:** The `sandbox.provision.requested` event failed to deliver or execute. This happens when:
- Inngest was down when the user connected Google Drive
- The onboarding flow reached the async provisioning step before Inngest recovered
- The job encountered an unrecoverable error (e.g., invalid connector, missing user)

**Why it matters:** The user's workspace cannot progress. They cannot access the portal until provisioning is complete.

### Recovery API

**`GET /api/system/stuck-firms`**

Lists all firms stuck in provisioning with admin contact details.

- **Auth:** SYS_ADMIN role required
- **Response:**
```typescript
{
  firms: Array<{
    id: string              // Firm ID
    name: string            // Firm name
    slug: string            // URL slug
    connectorId: string     // Google connector ID
    createdAt: string       // ISO timestamp
    stuckSince: string      // Last provisioning attempt (ISO)
    userId: string          // Admin user ID
    userEmail: string       // Admin email (from Supabase auth)
  }>
}
```

**`POST /api/system/reprovision-firms`**

Manually re-enqueue provisioning for selected stuck firms.

- **Auth:** SYS_ADMIN role required
- **Request body:**
```typescript
{ firmIds: string[] }  // 1-50 firm IDs (UUID format validated)
```

- **Process per firm:**
  1. Re-validate firm is still stuck (fetch from DB)
  2. Get admin user ID from `firm_members` (role = `firm_admin`)
  3. Resolve user email and name from Supabase auth
  4. Reset firm's onboarding stage to `'provisioning'` with fresh `lastUpdated` timestamp
  5. Re-enqueue `sandbox.provision.requested` event via `safeInngestSend()`
  6. Skip if firm is no longer stuck (already provisioned)

- **Response:**
```typescript
{
  queued: number    // Successfully re-queued
  skipped: number   // Already provisioned
  errors: Array<{ firmId: string, error: string }>
}
```

### User Interface

**`/system/integrations`** — Client component with:

**Integration Status Section:**
- 2×2 grid of service status cards
- Green UP / red DOWN indicators with latency
- Manual refresh button and auto-refresh every 30 seconds
- Last checked timestamp

**Stuck Onboarding Section:**
- Table listing all stuck firms with columns:
  - Checkbox (multi-select)
  - Firm name and slug
  - Admin user email
  - Time stuck (relative: "3 days ago")
  - Created date
- "Select All" checkbox in header
- "Resume Provisioning (N selected)" button (disabled if 0 selected)
- Confirmation dialog before resuming
- Success toast showing "Queued N firms"
- Auto-refresh after resuming

---

## Administrative Tools (`/system`)

The Admin Index (`/system/page.tsx`) provides a dashboard of operational utilities:

| Tool | Route | Purpose | Persona |
|------|-------|---------|---------|
| **Link Generator** | `/system/links` | Generate and copy UTM-tracked links for social media | SYS_ADMIN |
| **Customer Success** | `/system/customer-success` | View and manage user support requests and bug reports | SYS_ADMIN |
| **Waitlist** | `/system/waitlist` | View users who joined the waitlist for Pro plan | SYS_ADMIN |
| **Roadmap** | `/system/roadmap` | Gantt-style milestones, tier targets, and git-derived progress | SYS_ADMIN |
| **Admin Signup Invite** | `/system/admin-signup` | Send signup completion email with coupon to end-users | SYS_ADMIN |
| **User Data Map** | `/system/user-data-map` | Inspect user workspace graph, detect discrepancies, review safe remediation SQL | SYS_ADMIN |
| **Integrations** | `/system/integrations` | Live health status and onboarding recovery | SYS_ADMIN |

---

## Access Control

### SYS_ADMIN Role

All `/system/*` routes and `/api/system/*` endpoints require `SYS_ADMIN` role in the user's Supabase `app_metadata`:

```json
{ "role": "SYS_ADMIN" }
```

**Configuration:**

1. **Via Supabase Dashboard:**
   - Go to Authentication > Users
   - Click the user to edit
   - Update `app_metadata`:
   ```json
   { "role": "SYS_ADMIN" }
   ```
   - Save and the user must sign out and sign back in

2. **Via SQL:**
   ```sql
   UPDATE auth.users 
   SET raw_app_meta_data = jsonb_set(
     COALESCE(raw_app_meta_data, '{}'::jsonb), 
     '{role}', 
     '"SYS_ADMIN"'
   )
   WHERE email = 'admin@example.com'
   ```

### Auth Implementation

All `/api/system/*` routes follow this pattern:

```typescript
import { isSysAdminUser } from '@/lib/system/user-data-map'

const authHeader = request.headers.get('authorization')
const token = authHeader?.replace('Bearer ', '')
const { data: { user } } = await supabase.auth.getUser(token)

if (!user?.id || !(await isSysAdminUser(user.id))) {
  return NextResponse.json({ error: 'Forbidden: SYS_ADMIN role required' }, { status: 403 })
}
```

---

## Runbooks

### When Inngest is Down

1. **Check status:** Visit `/system/integrations` → Inngest shows RED DOWN
2. **Diagnose:**
   - Check Inngest cloud dashboard for errors
   - Verify dev server: `npx inngest-cli dev` is running
   - Check application logs for job failures
3. **Restart:** Restart Inngest service or dev server
4. **Recover:** Go to `/system/integrations` → "Stuck Onboarding Firms" section
   - Select affected firms (or Select All)
   - Click "Resume Provisioning"
   - Confirm dialog
   - Wait for Inngest dev server to show jobs processed
5. **Verify:** Check Inngest dashboard or application logs that jobs completed

### When Database is Down

1. **Check status:** Visit `/system/integrations` → Database shows RED DOWN
2. **Diagnose:**
   - Check database service health
   - Verify connection string and credentials
   - Check database logs for errors
3. **Restart:** Restart or failover database service
4. **Verify:**
   - Go to `/system/integrations` → Database shows GREEN UP
   - Run a manual query test from a SQL client
   - Check application logs for recovered connections

### When Polar is Down

1. **Check status:** Visit `/system/integrations` → Polar shows RED DOWN
2. **Diagnose:**
   - Check Polar API status page
   - Verify API key and credentials
   - Check application logs for timeout/auth errors
3. **Action:**
   - Polar outages are external; monitor and wait for recovery
   - Existing subscriptions are not affected (Polar webhooks are resilient)
   - New subscription checks may fail; document delay and retry
4. **Verify:** Refresh `/system/integrations` → Polar shows GREEN UP

---

## Monitoring & Alerting

### Production

- **Integration Status:** Setup a cron job or external monitor to call `/api/system/integrations/status` every 5 minutes
- **Inngest Cloud Dashboard:** Enable alerts for failed jobs and high error rates
- **Database Monitoring:** Use provider dashboards (Supabase, AWS RDS, etc.) for latency/error spikes
- **Logging:** All errors are logged to Sentry; set up alerts for critical services

### Development

- **Inngest Dev Server:** Always check `http://localhost:8288` to view jobs in real-time
- **Application Logs:** Check Next.js server logs for API errors during onboarding

---

## Future Enhancements

1. **Webhook Resilience:** Add a webhook queue for Polar subscription events (in case webhook receiver is down)
2. **Automated Recovery:** Auto-trigger stuck firm recovery after service outage (with admin notification)
3. **Alert Thresholds:** Configurable thresholds for integration health (latency, error rate, timeout)
4. **Escalation:** Integration with Slack/PagerDuty for critical service failures
5. **Audit Trail:** Log all manual recovery actions for compliance and debugging

---

## References

- [HLD](hld.md) – System architecture overview
- [Background Jobs (Inngest)](hld-inngest-jobs.md) – Async task processing
- [PRD](prd.md) – Product requirements and features
- [Inngest Docs](https://www.inngest.com/docs) – Official Inngest documentation
- [Supabase Auth](https://supabase.com/docs/guides/auth) – Authentication and authorization
