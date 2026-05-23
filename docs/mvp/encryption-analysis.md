# Encryption Analysis: Database Schema Review

**Purpose:** Identify data points that require encryption to protect PII and end-user business information.

**Schema:** `platform` (application data), `system` (infrastructure/admin)

---

## Current Encryption Implementation

**Method:** AES-256-GCM, field-level via Prisma Client Extension (`lib/prisma.ts`)
**Key management:** `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`, … with `CURRENT_KEY_VERSION` env vars
**Pattern:** Transparent — plaintext in, plaintext out; ciphertext stored as `v{n}$base64(iv+ciphertext+tag)`
**Key rotation:** Lazy re-encryption on access via `needsReEncryption()` / `reEncrypt()`

---

## Encrypted Fields (`ENCRYPTED_FIELDS_MAP`)

| Model | Encrypted Fields | Sensitivity |
|---|---|---|
| `Firm` | `name` | HIGH — firm identity |
| `Client` | `name`, `description`, `internalMemo`, `billingAddress`, `relationshipValue` | HIGH — client confidential data |
| `Engagement` | `name`, `description`, `rateOrValue` | HIGH — matter/deal details + financial |
| `ClientContact` | `name`, `email`, `phone`, `notes` | HIGH — PII |
| `DocCommentMessage` | `content` | HIGH — privileged client communications |
| `Connector` | `accessToken`, `refreshToken`, `name`, `email` | CRITICAL — OAuth secrets + PII |

> **Note on `rateOrValue` / `relationshipValue`:** These were `Decimal` in the schema and retyped to `String?` (TEXT in DB) to support encryption. Read sites use `parseFloat()` / `Number()` to restore numeric behavior.

---

## Fields NOT Encrypted (Rationale)

| Field | Reason |
|---|---|
| `*.id`, `*.slug` | Identifiers used for lookups and URLs; must remain queryable |
| `*.createdAt`, `*.updatedAt` | Timestamps; no sensitivity |
| `*.status`, enum fields | Classification data; no sensitivity |
| `EngagementDocument.fileName` | Deferred — volume + search indexing implications |
| `EngagementDocument.content` | Deferred — large text; breaks vector/semantic search |
| Invitation `.token` | Should be hashed (separate task); currently plaintext |
| `system.*` contact/waitlist forms | Admin-use only; per HLD decision, not encrypted |

---

## platform Schema — Field Sensitivity Reference

### Connector
| Field | Encrypted | Notes |
|---|---|---|
| `accessToken` | ✅ | OAuth access token — CRITICAL |
| `refreshToken` | ✅ | OAuth refresh token — CRITICAL |
| `name` | ✅ | Account display name — PII |
| `email` | ✅ | Google account email — PII |
| `externalAccountId` | ❌ | Provider sub/ID; low sensitivity |
| `avatarUrl` | ❌ | URL only |

### Firm
| Field | Encrypted | Notes |
|---|---|---|
| `name` | ✅ | Firm legal name |
| `slug` | ❌ | Public URL identifier |
| `brandingSubtext`, `themeColorHex`, `logoUrl` | ❌ | UI config; low sensitivity |
| `allowedEmailDomain` | ❌ | Access control config |

### Client
| Field | Encrypted | Notes |
|---|---|---|
| `name` | ✅ | Client company/person name |
| `description` | ✅ | Business description |
| `internalMemo` | ✅ | Privileged internal notes |
| `billingAddress` | ✅ | PII — physical address |
| `relationshipValue` | ✅ | Financial — estimated deal value (stored as TEXT) |
| `slug` | ❌ | Public URL identifier |
| `industry`, `sector` | ❌ | Classification; consider future |
| `website`, `linkedInUrl` | ❌ | Public URLs |
| `followUpDate`, `expectedCloseDate` | ❌ | Dates; low sensitivity alone |

### ClientContact
| Field | Encrypted | Notes |
|---|---|---|
| `name` | ✅ | PII — full name |
| `email` | ✅ | PII — email address |
| `phone` | ✅ | PII — phone number |
| `notes` | ✅ | Contact notes |
| `title` | ❌ | Job title; low sensitivity |

### Engagement
| Field | Encrypted | Notes |
|---|---|---|
| `name` | ✅ | Matter/engagement name |
| `description` | ✅ | Engagement details |
| `rateOrValue` | ✅ | Billing rate or deal value (stored as TEXT) |
| `slug` | ❌ | Public URL identifier |
| `contractType` | ❌ | Classification |
| `kickoffDate`, `dueDate` | ❌ | Dates; low sensitivity alone |

### DocCommentMessage
| Field | Encrypted | Notes |
|---|---|---|
| `content` | ✅ | Privileged client communications |
| `reactions` | ❌ | Emoji reactions; no sensitivity |

### EngagementDocument
| Field | Encrypted | Notes |
|---|---|---|
| `fileName` | ❌ (deferred) | Reveals document names; volume concern |
| `content` | ❌ (deferred) | Full text; breaks vector search |
| `externalId` | ❌ | Drive file ID; not sensitive alone |

---

## Encryption Phases

| Phase | Status | Scope |
|---|---|---|
| 1 — OAuth Secrets | ✅ Done | `connector.accessToken`, `connector.refreshToken` |
| 2 — Business Names | ✅ Done | `firm.name`, `client.name`, `engagement.name` |
| 3 — Extended Business + PII | ✅ Done | All fields listed in ENCRYPTED_FIELDS_MAP above |
| 4 — Document content | ⏳ Future | Requires search architecture decision |
| 5 — KMS / Envelope encryption | ⏳ Future | Upgrade from env-key to AWS KMS / GCP KMS |

---

## Compliance Alignment

| Standard | Control | Coverage |
|---|---|---|
| ISO 27001 | A.10 Cryptography | AES-256-GCM field encryption |
| ISO 27701 | PII confidentiality | PII fields encrypted at rest |
| GDPR Art. 32 | Security of processing | Encrypted personal data reduces breach impact |
| SOC 2 CC6.7 | Cryptographic controls | Env-key encryption with rotation support |
