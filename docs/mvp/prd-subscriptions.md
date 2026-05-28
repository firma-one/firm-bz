# Subscriptions PRD — plans, Polar, and data contract

**This file (`prd-subscriptions.md`) is the only Subscriptions PRD** (product tiers + Polar engineering). It is **not** the same thing as the Postgres table **`platform.subscriptions`**, which stores synced Polar state — that table is specified *inside* this document.

**Scope:** (1) **Polar integration** — checkout, webhooks, and how rows in **`platform.subscriptions`** relate to firms. (2) **Plans & product** — tier names, feature matrices, pricing narrative, release narrative. **Architecture map:** [hld-subscription.md](hld-subscription.md). **Pricing config:** `frontend/config/pricing.ts`. **Product summary:** [prd.md](prd.md) §11.

---

## Polar integration and data contract

**Role:** Engineering requirements for checkout, webhooks, and DB fields. **Not** duplicated in the plans section below.

### Document control

- **Status:** Aligned with current implementation (`platform.subscriptions` + firm billing caps).
- **Owner:** Product + Engineering.
- **Related:** [hld-subscription.md](hld-subscription.md) (architecture), [prd.md](prd.md) §11 (product summary).

### Problem

Firma needs reliable paid checkout and webhook sync such that:

- Firm admins can start checkout for the billing anchor workspace.
- Polar entities map deterministically to a firm in our DB.
- Subscription status and Polar IDs stay in sync without calling Polar on every read.
- Environments stay isolated (sandbox vs production tokens/secrets).

### Goals

- Standard (and future) paid products work in sandbox and production with the same code path.
- **Authoritative subscription state** for plan/status/period/Polar IDs lives in **`platform.subscriptions`** (active row per billing anchor).
- **`platform.firms`** holds **billing policy fields only** (e.g. engagement cap, group firm cap, caps lock, `billingSharesSubscriptionFromFirmId`) — not duplicated Polar subscription columns.
- Mapping uses `customerExternalId = firmId` (and documented fallbacks).

### Non-goals (this phase)

- Full self-serve plan switching UI.
- Metered billing.
- Automated refunds/dispute workflows.
- Fine-grained entitlement objects beyond status/plan/caps.

### Users

- Firm admins purchasing or managing subscription.
- Ops validating billing state.

### Functional requirements

#### Checkout

- Authenticated user; member of target firm.
- Checkout attaches **`customerExternalId = firmId`**.
- Metadata includes **`firmId`** as defensive fallback.

#### Subscription sync (webhooks)

- Verify signatures with **`POLAR_WEBHOOK_SECRET`**.
- On subscription lifecycle events, upsert the **`platform.subscriptions`** row for the **billing anchor** firm (resolve satellite → anchor via `billing-group` helpers).
- Persist at minimum: **`status`**, **`plan`** (product name), **`pricingModel`** (`recurring_subscription` | `one_time_purchase` where applicable), **`currentPeriodEnd`**, **`polarCustomerId`**, **`polarSubscriptionId`**, **`provider`**, **`active`**, and JSON **`settings`** (metadata/snapshots as needed).
- Idempotent / replay-safe.
- At most one **active** subscription row per firm (partial unique index); webhook logic deactivates prior active rows when promoting a paid subscription.

#### Billing group

- If a firm uses **`billingSharesSubscriptionFromFirmId`**, all subscription writes target the **anchor** firm id.

#### Free sandbox tier

- Provisioned via Polar API + DB (not webhook-only): creates/updates **`platform.subscriptions`** with free product linkage; updates firm **caps** only on **`platform.firms`**.

### Data mapping contract (Polar → app)

1. **Primary:** `customerExternalId` → `platform.firms.id`
2. **Fallbacks:** `metadata.firmId` → lookup **`platform.subscriptions`** by **`polarCustomerId`** or **`polarSubscriptionId`** (then resolve anchor if needed)

### Environment strategy

- Local / preview / production: separate Polar org, token, webhook secret, and webhook URL; same application code.

### Webhook setup (example local)

- Endpoint: app route under `/api/webhooks/polar` (see codebase).
- **Secret:** `POLAR_WEBHOOK_SECRET`
- **Events:** subscription created/updated/active/canceled/revoked/uncanceled (as configured in Polar dashboard).

### Acceptance criteria

- Authenticated member can create checkout for their firm.
- Sandbox checkout completes and success page loads.
- Webhook delivery succeeds; **`platform.subscriptions`** reflects status, plan, Polar IDs, and period end where applicable.
- Replay of the same event does not corrupt data.
- Satellite firms inherit anchor subscription state via anchor resolution + shared active subscription row.

### Risks

| Risk | Mitigation |
|------|------------|
| Webhook unreachable locally | Tunnel + Polar delivery logs |
| Wrong firm mapping | Enforce `customerExternalId=firmId` + fallback order |
| Env cross-talk | Separate Polar org/config per environment |

---

## Plans and feature distribution

**Status:** Planning document  
**Last updated:** 2026-04-09  
**Purpose:** Tier names, feature matrices, pricing narrative, and release roadmap (product/strategy).  
**Aligned with:** `frontend/config/pricing.ts` (Standard, Pro, Business, Enterprise; engagement limits; no add-on packs).

### Overview

This section describes **what** each plan includes and **when** we intend to ship tiered capabilities. Billing mechanics (how Polar sync updates the database) are in **[Polar integration and data contract](#polar-integration-and-data-contract)** above.

### Subscription Tiers

#### 1. Standard Plan
**Target:** Small professional services firms, solo consultants, small accounting practices  
**Release:** MVP Release 1.0 - Launching Q2 2026  
**Pricing:** $49/month  
**Projects included:** 10 active projects (shown in title tile; no add-on packs)

#### 2. Pro Plan
**Target:** Growing professional services firms needing advanced review and templates  
**Release:** MVP Release 1.5 - Launching Q2 2026  
**Pricing:** $99/month  
**Projects included:** 25 active projects

#### 3. Business Plan
**Target:** Established firms, mid-size agencies, consultancies requiring automation  
**Release:** MVP Release 2.0 - Launching Q3 2026  
**Pricing:** $149/month  
**Projects included:** 50 active projects

#### 4. Enterprise Plan
**Target:** Large organizations, enterprise clients, firms requiring advanced compliance and security  
**Release:** Post-MVP Release 3.0 - Launching Q4 2026  
**Pricing:** Contact Us (custom)  
**Projects included:** 100 active projects

---

### Feature Distribution Matrix

#### Core Features (All Plans)

These features are available to all subscription tiers:

- ✅ Google Drive integration & file browser
- ✅ Project & client management
- ✅ Basic file upload/download
- ✅ Project folder structure (general/confidential)
- ✅ Basic personas (Project Lead, Team Member, External Collaborator, Client Contact)
- ✅ Project member invitations
- ✅ Basic file sharing & assignment
- ✅ Project settings & lifecycle management
- ✅ Basic insights dashboard
- ✅ Unlimited members per organization

---

#### Standard Plan Features (Release 1.0)

**Bring your own Google Drive—non-custodial. Your documents stay where they are; we add the portal. No migration, no new storage.**

- ✅ **All Core Features** (listed above)
- ✅ **Bring your own Google Drive · Non-custodial**: Your files stay in your Drive. We don't store or copy them. Keep using your current document storage—no migration.
- ✅ **Custom branded professional client portal**: Replaces documents delivered as email attachments or raw Drive links. Branded portal instead of generic 'Untitled Folder' links. Works with your existing Google Drive.
- ✅ **Org → Client → Project hierarchy**: Clean structure clients understand. Uses your existing Drive—no migration.
- ✅ **Unlimited Client Workspaces. Unlimited Team Members. Unlimited External Collaborators.**: No per-user fees.
- ✅ **Google Drive–style document operations in Firma**: Familiar open, preview, download, and share actions. No new storage system to learn.
- ✅ **Persona-based access (4 roles)**: Project Lead, Team Member, External Collaborator & Guest. Access follows role automatically.
- ✅ **Simple permission management**: No granular file-by-file permissions. No resharing links; clients always know where to find documents.
- ✅ **Document access tracking**: See who viewed what and when. Track feedback tied to each document.
- ✅ **In-document comments & feedback**: Comments stay with the document. No more lost feedback in email.
- ✅ **One-click project closure**: Revoke all client access when a project ends. Lock folders to View Only.
- ✅ **10 Active Projects**: Included (shown in title tile). Active = not closed or archived; unlimited closed projects don't count.

**Capacity:**
- 10 active projects included
- Unlimited members
- Unlimited storage (via Google Drive)
- No add-on project packs (tiered capacity only)

---

#### Pro Plan Features (Release 1.5)

**Everything in Standard, plus templates & advanced review:**

- ✅ **All Standard Features**
- ✅ **Custom Subdomain**: Use custom subdomain (e.g., yourcompany.firma.one) for client portal access
- ✅ **Watermarked Document Delivery**: Add organization branding watermarks to exported PDFs
- ✅ **Document Templates**: Pre-configured document templates for common use cases
- ✅ **Project Templates**: Choose from template projects with pre-defined folder structures
- ✅ **Duplicate Project**: Clone existing projects with all configurations
- ✅ **Project activity dashboard**: See all project activity, deadlines, and pending actions in one view
- ✅ **Advanced Review & Approval Workflow**: Approve/Finalize/Publish workflow with guest approvals
- ✅ **Document Versioning**: Lock documents on approval, create version snapshots
- ✅ **Download Historical Versions**: Access and download previous document versions
- ✅ **Review status & activity tracking**: Comprehensive tracking of review status, comments, approvals, version history
- ✅ **Project cover images**: Set a cover image per project for quick visual identification in the dashboard
- ✅ **Activity export (per project)**: Export who viewed what and when for a project—for compliance or handoffs
- ✅ **25 Active Projects**: Included (shown in title tile)

**Capacity:**
- 25 active projects included
- Unlimited members
- Unlimited storage (via Google Drive)
- No add-on project packs

---

#### Business Plan Features (Release 2.0)

**Everything in Pro, plus automation:**

- ✅ **All Pro Features**
- ✅ **Project Due Date Reminders**: Automated reminders for project deadlines
- ✅ **Self-destruct timers & Never Share tags**: Protect sensitive files. Set expiry on shared links. Tag internal files so they never reach clients.
- ✅ **Document Relationships**: Link related/dependent documents with relationship tracking
- ✅ **Relationship Tree View**: Visualize document dependencies and connections
- ✅ **Automated Follow-ups**: Automated consolidated client follow-up emails on pending documents
- ✅ **Custom Follow-up Messages**: Customize follow-up templates and scheduling
- ✅ **Calendar Integration**: Calendly integration for document discussion scheduling
- ✅ **Bi-directional Calendar Requests**: Team ↔ Client calendar request flows
- ✅ **Pre-configured Scheduling**: Pre-configured scheduling, reminders, and email notifications
- ✅ **Weekly Project Status Reports**: Weekly project schedule status reports to org owners and project leads
- ✅ **Folder Badge Indicators**: Visual badges for pending actions from external members
- ✅ **Auto-permit Documents**: Automatically deliver documents on onboarding to external members
- ✅ **50 Active Projects**: Included (shown in title tile)

**Capacity:**
- 50 active projects included
- Unlimited members
- Unlimited storage (via Google Drive)
- No add-on project packs

---

#### Enterprise Plan Features (Release 3.0)

**Everything in Business, plus enterprise features:**

- ✅ **All Business Features**
- ✅ **Custom DNS Domain**: Use your own domain (e.g., portal.yourcompany.com) with full DNS control and SSL certificate management
- ✅ **Critical Project Activity Auditing**: Comprehensive audit logs for all project activities
- ✅ **Recover from Recycle Bin**: Restore deleted files with alerts on upcoming purges
- ✅ **Recycle Bin Purge Alerts**: Notifications before permanent deletion
- ✅ **IP Theft Protection**: Advanced security features to prevent unauthorized access
- ✅ **Disallow Download/Print**: Restrict document download and printing for client contacts
- ✅ **Custom Trigger Creation**: Create custom automation triggers for scheduling
- ✅ **Scheduled Project Kickoff**: Create projects with delayed kickoff; schedule future team memberships
- ✅ **Advanced Access Controls**: Enhanced persona management and custom persona creation beyond the 4 default personas
- ✅ **SSO/SAML Integration**: Single Sign-On for enterprise authentication
- ✅ **Advanced Compliance**: Enhanced compliance features for regulated industries
- ✅ **Dedicated Support**: Priority support with SLA guarantees
- ✅ **Custom Onboarding**: Tailored onboarding and training
- ✅ **100 Active Projects**: Included (shown in title tile). Custom capacity available.

**Capacity:**
- 100 active projects included (contact for more)
- Unlimited members
- Unlimited storage (via Google Drive)
- No add-on project packs; custom capacity via sales

---

### Pricing Strategy

#### Tiered Capacity Model

Plans use a **tiered capacity model** (no add-on project packs):
- **Projects included** scale by tier: Standard 10, Pro 25, Business 50, Enterprise 100 (shown in pricing title tile).
- **Active projects** = not closed or archived; unlimited closed projects don't count toward the limit.
- **Unlimited Members**: No per-user charges.
- **Storage**: Unlimited (via Google Drive integration; bring your own Drive, non-custodial).
- Need more than tier capacity: contact for Enterprise/custom.

#### Pricing Tiers

| Plan | Base Price | Projects Included | Target Market |
|------|------------|-------------------|---------------|
| **Standard** | $49/month | 10 active projects | Small firms, solo consultants |
| **Pro** | $99/month | 25 active projects | Growing firms needing advanced review & templates |
| **Business** | $149/month | 50 active projects | Established firms, mid-size agencies, automation |
| **Enterprise** | Contact Us | 100 active projects (custom available) | Large organizations, enterprise |

#### Payment Gateway Considerations

**Challenge**: Indian founder setup requires trusted global checkout for US/EU/SG/AU customers with tax-friendly invoicing.

**Options:**
1. **Stripe**: Invite-only in India; requires alternative approach
2. **Razorpay**: Indian payment gateway with international support
3. **Paddle**: Merchant of record, handles tax compliance globally
4. **Chargebee + Payment Gateway**: Subscription management with multiple gateway support

**Recommendation**: Evaluate Paddle or Chargebee + Razorpay for international reach and tax compliance.

---

### Release Roadmap

#### Release 1.0 - Standard Plan (Q2 2026)

**Focus**: Core platform + BYOD/non-custodial positioning + essential collaboration

**Features:**
- Bring your own Google Drive · non-custodial
- Custom branded client portal
- Org → Client → Project hierarchy
- Persona-based access, document access tracking, in-document comments
- One-click project closure
- 10 active projects included

**Success Metrics:**
- 100+ paying Standard customers
- 80% feature adoption rate
- <5% churn rate

---

#### Release 1.5 - Pro Plan (Q2 2026)

**Focus**: Templates, advanced review, custom subdomain, and versioning

**Features:**
- Custom subdomain
- Watermarked document delivery
- Document templates, project templates, duplicate project
- Project activity dashboard
- Advanced review & approval workflow
- Document versioning, download historical versions
- Review status & activity tracking
- Project cover images, activity export (per project)
- 25 active projects included

**Success Metrics:**
- 30+ Pro customers
- 60% Standard → Pro upgrade rate
- Feature usage analytics

---

#### Release 2.0 - Business Plan (Q3 2026)

**Focus**: Automation and advanced collaboration

**Features:**
- Project due date reminders
- Self-destruct timers & Never Share tags
- Document relationships, relationship tree view
- Automated follow-ups, custom follow-up messages
- Calendar integration, bi-directional calendar requests
- Pre-configured scheduling
- Weekly project status reports
- Folder badge indicators, auto-permit documents
- 50 active projects included

**Success Metrics:**
- 20+ Business plan customers
- 60% Pro → Business upgrade rate
- Feature usage analytics

---

#### Release 3.0 - Enterprise Plan (Q4 2026)

**Focus**: Security, compliance, and governance (custom pricing)

**Features:**
- Custom DNS domain
- Critical project activity auditing
- Recycle bin recovery & purge alerts
- IP theft protection, disallow download/print
- Custom trigger creation, scheduled project kickoff
- Advanced access controls
- SSO/SAML integration
- Advanced compliance
- Dedicated support, custom onboarding
- 100 active projects included (custom capacity available)

**Success Metrics:**
- 5+ Enterprise customers
- Enterprise feature adoption
- Compliance certifications

---

### Migration & Upgrade Path

#### Free → Standard Migration

- **Grandfathering**: Existing free users maintain access to current features
- **Upgrade Incentive**: Offer 20% discount for first 3 months
- **Data Migration**: Seamless transition, no data loss

#### Standard → Pro Upgrade

- **Feature Preview**: Show Pro features with "Upgrade" prompts
- **Trial Period**: 14-day trial of Pro features
- **Prorated Billing**: Seamless upgrade with prorated charges

#### Pro → Business Upgrade

- **Feature Preview**: Show Business features with "Upgrade" prompts
- **Trial Period**: 14-day trial of Business features
- **Prorated Billing**: Seamless upgrade with prorated charges

#### Business → Enterprise Upgrade

- **Sales-Assisted**: Enterprise requires sales consultation
- **Custom Pricing**: Volume discounts and custom capacity available
- **Dedicated Onboarding**: Custom setup and training

---

### Feature Flagging Best Practices

1. **Always Check Server-Side**: Never rely solely on client-side checks
2. **Graceful Degradation**: Show upgrade prompts, don't hide features
3. **Clear Messaging**: Explain why features are unavailable
4. **Trial Access**: Consider offering trial access to higher-tier features
5. **Analytics**: Track feature usage by tier for product insights
6. **Documentation**: Keep feature matrix updated and accessible

---

### Success Metrics

#### Key Performance Indicators (KPIs)

- **Conversion Rate**: Free → Standard, Standard → Pro, Pro → Business, Business → Enterprise
- **Churn Rate**: Monthly churn by tier
- **Feature Adoption**: Usage rate of tier-specific features
- **Revenue per Customer**: Average revenue by tier
- **Customer Lifetime Value (LTV)**: LTV by tier
- **Upgrade Rate**: Percentage upgrading to higher tiers

#### Monitoring

- Track feature access attempts
- Monitor upgrade conversion funnels
- Analyze feature usage patterns
- Measure customer satisfaction by tier

---

### References

- [PRD](prd.md) — Core platform requirements (incl. §11 billing summary).
- [HLD — Subscriptions](hld-subscription.md) — Component map and data boundaries.
- [Roadmap](roadmap.md) — Milestones.
- [HLD](hld.md) — Overall architecture.
