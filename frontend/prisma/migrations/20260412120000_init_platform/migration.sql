-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateEnum
CREATE TYPE "platform"."ConnectorType" AS ENUM ('GOOGLE_DRIVE', 'GOOGLE_CALENDAR', 'GOOGLE_TASKS', 'DROPBOX', 'ONEDRIVE', 'BOX', 'NOTION', 'CONFLUENCE');

-- CreateEnum
CREATE TYPE "platform"."ConnectorStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "platform"."WorkspaceRootLocation" AS ENUM ('MY_DRIVE', 'SHARED_DRIVE');

-- CreateEnum
CREATE TYPE "platform"."DocumentStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'ERROR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "platform"."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'JOINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "platform"."TicketType" AS ENUM ('BUG', 'REQUEST', 'ENQUIRY');

-- CreateEnum
CREATE TYPE "platform"."TicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "platform"."FirmRole" AS ENUM ('firm_admin', 'firm_member');

-- CreateEnum
CREATE TYPE "platform"."EngagementRole" AS ENUM ('eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer');

-- CreateEnum
CREATE TYPE "platform"."MembershipType" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "platform"."ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'ON_HOLD', 'PAST');

-- CreateEnum
CREATE TYPE "platform"."EngagementStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "platform"."NotificationPriority" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "platform"."DocumentSharingPermissionStatus" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "platform"."PlatformAuditScope" AS ENUM ('PROJECT');

-- CreateEnum
CREATE TYPE "platform"."PlatformAuditEventType" AS ENUM ('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_CLOSED', 'PROJECT_REOPENED', 'PROJECT_SOFT_DELETED', 'PROJECT_MEMBER_ADDED', 'PROJECT_MEMBER_REMOVED', 'PROJECT_MEMBER_ROLE_CHANGED', 'PROJECT_DOCUMENT_ADDED', 'PROJECT_DOCUMENT_REMOVED', 'PROJECT_DOCUMENT_RENAMED', 'FILE_UPLOADED', 'STATUS_CHANGE', 'SHARED_EXT', 'PROJECT_LOCKED', 'DOCUMENT_ACTIVITY_STATUS_CHANGED', 'DOCUMENT_SHARED_INTERNAL', 'DOCUMENT_SHARED_EXTERNAL', 'DOCUMENT_SHARE_FINALIZED', 'DOCUMENT_SHARE_REGRANTED', 'PROJECT_INDEX_REQUESTED', 'DOCUMENT_INDEX_REQUESTED', 'DOCUMENT_INDEX_COMPLETED', 'PROJECT_CONNECTOR_FOLDER_ATTACHED', 'PROJECT_SETTINGS_CHANGED', 'DOCUMENT_ACCESS_LOG_ENTRY');

-- CreateTable
CREATE TABLE "platform"."connectors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "type" "platform"."ConnectorType" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "userId" UUID NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "platform"."ConnectorStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "workspaceRootLocation" "platform"."WorkspaceRootLocation",
    "workspaceRootSharedDriveId" TEXT,
    "workspaceRootSharedDriveName" TEXT,
    "firmId" UUID,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."firms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "allowDomainAccess" BOOLEAN NOT NULL DEFAULT false,
    "allowedEmailDomain" TEXT,
    "billingSharesSubscriptionFromFirmId" UUID,
    "billingGroupFirmCap" INTEGER,
    "billingActiveEngagementCap" INTEGER,
    "billingCapsLocked" BOOLEAN NOT NULL DEFAULT false,
    "anchorFirmId" UUID,
    "brandingSubtext" TEXT,
    "logoUrl" TEXT,
    "themeColorHex" TEXT,
    "connectorId" UUID,
    "firmFolderId" TEXT,
    "isAnchor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),
    "deactivatedAt" TIMESTAMPTZ(6),
    "firmId" UUID NOT NULL,
    "provider" TEXT DEFAULT 'polar',
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT,
    "pricingModel" TEXT,
    "currentPeriodEnd" TIMESTAMPTZ(6),
    "polarCustomerId" TEXT,
    "polarSubscriptionId" TEXT,
    "polarOrderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),
    "industry" TEXT,
    "sector" TEXT,
    "status" "platform"."ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" UUID,
    "website" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "sandboxOnly" BOOLEAN NOT NULL DEFAULT false,
    "driveFolderId" TEXT,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."client_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."engagements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),
    "description" TEXT,
    "connectorRootFolderId" TEXT,
    "kickoffDate" TIMESTAMPTZ(6),
    "dueDate" TIMESTAMPTZ(6),
    "status" "platform"."EngagementStatus" NOT NULL DEFAULT 'ACTIVE',
    "contractType" TEXT,
    "rateOrValue" DECIMAL(15,2),
    "tags" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "sandboxOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."personas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."firm_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "role" "platform"."FirmRole" NOT NULL,
    "membershipType" "platform"."MembershipType" NOT NULL DEFAULT 'internal',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "firm_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."client_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "personaId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "client_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."engagement_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "role" "platform"."EngagementRole" NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "engagement_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."file_persona_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fileId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "personaSlug" TEXT NOT NULL,
    "grantedByUserId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_persona_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."engagement_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "engagementId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "personaId" UUID NOT NULL,
    "status" "platform"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "engagement_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."firm_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "firmId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "personaId" UUID NOT NULL,
    "status" "platform"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "firm_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."client_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "clientId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "personaId" UUID NOT NULL,
    "status" "platform"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "client_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."engagement_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmId" UUID NOT NULL,
    "clientId" UUID,
    "engagementId" UUID NOT NULL,
    "connectorId" UUID,
    "externalId" TEXT NOT NULL,
    "parentId" TEXT,
    "fileName" TEXT NOT NULL,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "status" "platform"."DocumentStatus" NOT NULL DEFAULT 'PROCESSED',
    "content" TEXT,
    "embedding" vector,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sandboxOnly" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMPTZ(6),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "slug" TEXT,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "engagement_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."platform_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "firmId" UUID NOT NULL,
    "clientId" UUID,
    "engagementId" UUID,
    "documentId" UUID,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "priority" "platform"."NotificationPriority" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "ctaUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "channels" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "readAt" TIMESTAMPTZ(6),
    "dismissedAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "emailSentAt" TIMESTAMPTZ(6),

    CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."user_personalizations" (
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "bookmarks" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,

    CONSTRAINT "user_personalizations_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "platform"."engagement_canvases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "allowExternal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "engagement_canvases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."engagement_document_sharing_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "projectDocumentId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "googlePermissionId" TEXT,
    "sharingPermissionStatus" "platform"."DocumentSharingPermissionStatus" NOT NULL DEFAULT 'GRANTED',

    CONSTRAINT "engagement_document_sharing_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."doc_comment_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "projectDocumentId" UUID NOT NULL,
    "authorUserId" UUID,
    "content" TEXT NOT NULL,
    "reactions" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "doc_comment_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."platform_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmId" UUID NOT NULL,
    "clientId" UUID,
    "engagementId" UUID,
    "projectDocumentId" UUID,
    "scope" "platform"."PlatformAuditScope" NOT NULL,
    "eventType" "platform"."PlatformAuditEventType" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "platform_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."customer_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "platform"."TicketType" NOT NULL,
    "status" "platform"."TicketStatus" NOT NULL DEFAULT 'NEW',
    "description" TEXT NOT NULL,
    "errorDetails" JSONB,
    "metadata" JSONB,
    "firmId" UUID,
    "clientId" UUID,
    "engagementId" UUID,
    "userId" UUID,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."platform_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connectors_firmId_idx" ON "platform"."connectors"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_type_userId_key" ON "platform"."connectors"("type", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "firms_slug_key" ON "platform"."firms"("slug");

-- CreateIndex
CREATE INDEX "firms_billingSharesSubscriptionFromFirmId_idx" ON "platform"."firms"("billingSharesSubscriptionFromFirmId");

-- CreateIndex
CREATE INDEX "firms_anchorFirmId_idx" ON "platform"."firms"("anchorFirmId");

-- CreateIndex
CREATE INDEX "subscriptions_firmId_active_idx" ON "platform"."subscriptions"("firmId", "active");

-- CreateIndex
CREATE INDEX "subscriptions_polarCustomerId_idx" ON "platform"."subscriptions"("polarCustomerId");

-- CreateIndex
CREATE INDEX "subscriptions_polarSubscriptionId_idx" ON "platform"."subscriptions"("polarSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_firmId_slug_key" ON "platform"."clients"("firmId", "slug");

-- CreateIndex
CREATE INDEX "client_contacts_firmId_clientId_idx" ON "platform"."client_contacts"("firmId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_contacts_clientId_email_key" ON "platform"."client_contacts"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "engagements_clientId_slug_key" ON "platform"."engagements"("clientId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "personas_slug_key" ON "platform"."personas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "firm_members_userId_firmId_key" ON "platform"."firm_members"("userId", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "client_members_userId_clientId_personaId_key" ON "platform"."client_members"("userId", "clientId", "personaId");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_members_userId_engagementId_key" ON "platform"."engagement_members"("userId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_invitations_token_key" ON "platform"."engagement_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_invitations_engagementId_email_key" ON "platform"."engagement_invitations"("engagementId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "firm_invitations_token_key" ON "platform"."firm_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "firm_invitations_firmId_email_key" ON "platform"."firm_invitations"("firmId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "client_invitations_token_key" ON "platform"."client_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "client_invitations_clientId_email_key" ON "platform"."client_invitations"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_documents_slug_key" ON "platform"."engagement_documents"("slug");

-- CreateIndex
CREATE INDEX "engagement_documents_firmId_clientId_engagementId_idx" ON "platform"."engagement_documents"("firmId", "clientId", "engagementId");

-- CreateIndex
CREATE INDEX "engagement_documents_embedding_idx" ON "platform"."engagement_documents"("embedding");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_documents_engagementId_firmId_externalId_key" ON "platform"."engagement_documents"("engagementId", "firmId", "externalId");

-- CreateIndex
CREATE INDEX "platform_notifications_firmId_clientId_userId_idx" ON "platform"."platform_notifications"("firmId", "clientId", "userId");

-- CreateIndex
CREATE INDEX "platform_notifications_clientId_engagementId_documentId_idx" ON "platform"."platform_notifications"("clientId", "engagementId", "documentId");

-- CreateIndex
CREATE INDEX "platform_notifications_userId_readAt_idx" ON "platform"."platform_notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "platform_notifications_userId_dismissedAt_idx" ON "platform"."platform_notifications"("userId", "dismissedAt");

-- CreateIndex
CREATE INDEX "engagement_canvases_firmId_engagementId_idx" ON "platform"."engagement_canvases"("firmId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_canvases_engagementId_key" ON "platform"."engagement_canvases"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_document_sharing_users_projectDocumentId_userId_key" ON "platform"."engagement_document_sharing_users"("projectDocumentId", "userId");

-- CreateIndex
CREATE INDEX "doc_comment_messages_engagementId_projectDocumentId_created_idx" ON "platform"."doc_comment_messages"("engagementId", "projectDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_events_engagementId_eventAt_idx" ON "platform"."platform_audit_events"("engagementId", "eventAt");

-- CreateIndex
CREATE INDEX "platform_audit_events_engagementId_projectDocumentId_eventA_idx" ON "platform"."platform_audit_events"("engagementId", "projectDocumentId", "eventAt");

-- CreateIndex
CREATE INDEX "idx_customer_requests_status" ON "platform"."customer_requests"("status");

-- CreateIndex
CREATE INDEX "idx_customer_requests_user" ON "platform"."customer_requests"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_config_key_key" ON "platform"."platform_config"("key");

-- AddForeignKey
ALTER TABLE "platform"."connectors" ADD CONSTRAINT "connectors_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."firms" ADD CONSTRAINT "firms_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "platform"."connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."firms" ADD CONSTRAINT "firms_anchorFirmId_fkey" FOREIGN KEY ("anchorFirmId") REFERENCES "platform"."firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."firms" ADD CONSTRAINT "firms_billingSharesSubscriptionFromFirmId_fkey" FOREIGN KEY ("billingSharesSubscriptionFromFirmId") REFERENCES "platform"."firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."clients" ADD CONSTRAINT "clients_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."client_contacts" ADD CONSTRAINT "client_contacts_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagements" ADD CONSTRAINT "engagements_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagements" ADD CONSTRAINT "engagements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."firm_members" ADD CONSTRAINT "firm_members_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."client_members" ADD CONSTRAINT "client_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."client_members" ADD CONSTRAINT "client_members_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "platform"."personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_members" ADD CONSTRAINT "engagement_members_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."file_persona_grants" ADD CONSTRAINT "file_persona_grants_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_invitations" ADD CONSTRAINT "engagement_invitations_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_invitations" ADD CONSTRAINT "engagement_invitations_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "platform"."personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."firm_invitations" ADD CONSTRAINT "firm_invitations_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."firm_invitations" ADD CONSTRAINT "firm_invitations_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "platform"."personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."client_invitations" ADD CONSTRAINT "client_invitations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."client_invitations" ADD CONSTRAINT "client_invitations_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "platform"."personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_documents" ADD CONSTRAINT "engagement_documents_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_documents" ADD CONSTRAINT "engagement_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_documents" ADD CONSTRAINT "engagement_documents_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_notifications" ADD CONSTRAINT "platform_notifications_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_notifications" ADD CONSTRAINT "platform_notifications_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "platform"."engagement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_canvases" ADD CONSTRAINT "engagement_canvases_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_document_sharing_users" ADD CONSTRAINT "engagement_document_sharing_users_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "platform"."engagement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_document_sharing_users" ADD CONSTRAINT "engagement_document_sharing_users_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."doc_comment_messages" ADD CONSTRAINT "doc_comment_messages_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."doc_comment_messages" ADD CONSTRAINT "doc_comment_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."doc_comment_messages" ADD CONSTRAINT "doc_comment_messages_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."doc_comment_messages" ADD CONSTRAINT "doc_comment_messages_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "platform"."engagement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_audit_events" ADD CONSTRAINT "platform_audit_events_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_audit_events" ADD CONSTRAINT "platform_audit_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_audit_events" ADD CONSTRAINT "platform_audit_events_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_audit_events" ADD CONSTRAINT "platform_audit_events_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "platform"."engagement_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one active, non-deleted subscription row per firm (webhook + free-tier provisioning).
CREATE UNIQUE INDEX "subscriptions_one_active_per_firm" ON "platform"."subscriptions" ("firmId")
WHERE "active" = true AND "deletedAt" IS NULL;
