---
name: Regrant route resilience pattern
description: Regrant route should never return 5xx for valid engagement members — Drive failures are non-fatal
type: feedback
---

Any Drive operation failure in the regrant route must NOT return 500. Membership is the access authority, not the Drive grant.

**Why:** External viewers (eng_viewer) go through the sharePdfOnly branch (Branch A) by default. Any Drive failure there (PDF export, overwrite, patch) was returning 500, causing onRegrantFailed → raw Drive URL → Google sign-in page. Engagement leads skip Branch A entirely, masking the issue.

**How to apply:** In regrant/route.ts, catch blocks for Drive operations should either log+continue or fall through to the final `!permissionId` fallback which returns `{ success: true }`. Never return status 500 for Drive failures when the user has a valid engagementMember row.
