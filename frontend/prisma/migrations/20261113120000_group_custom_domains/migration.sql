-- Custom domains for a Firm Group, and one-time sign-in hand-off tickets.
-- See .claude/plans/branded-host-email-links.md.

-- CreateTable
CREATE TABLE "platform"."group_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "groupId" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reachable" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMPTZ(6),
    "lastCheckError" TEXT,
    "requestedBy" UUID NOT NULL,
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewNote" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."sign_in_handoffs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "nextPath" TEXT NOT NULL,
    "tokenHash" TEXT,
    "originSessionId" UUID,
    "targetSessionId" UUID,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sign_in_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_domains_groupId_idx" ON "platform"."group_domains"("groupId");

-- CreateIndex
CREATE INDEX "group_domains_status_idx" ON "platform"."group_domains"("status");

-- CreateIndex
CREATE INDEX "sign_in_handoffs_userId_idx" ON "platform"."sign_in_handoffs"("userId");

-- CreateIndex
CREATE INDEX "sign_in_handoffs_originSessionId_idx" ON "platform"."sign_in_handoffs"("originSessionId");

-- CreateIndex
CREATE INDEX "sign_in_handoffs_targetSessionId_idx" ON "platform"."sign_in_handoffs"("targetSessionId");

-- AddForeignKey
ALTER TABLE "platform"."group_domains" ADD CONSTRAINT "group_domains_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "platform"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One live (requested or approved) domain per Group, and a host belongs to one Group at a time.
-- Rejected, cancelled and removed rows stay as history and don't block reuse.
CREATE UNIQUE INDEX "group_domains_one_live_per_group" ON "platform"."group_domains"("groupId") WHERE "status" IN ('REQUESTED', 'APPROVED');
CREATE UNIQUE INDEX "group_domains_one_live_per_host" ON "platform"."group_domains"("host") WHERE "status" IN ('REQUESTED', 'APPROVED');
