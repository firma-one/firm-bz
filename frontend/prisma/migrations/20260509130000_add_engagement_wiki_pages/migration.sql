-- CreateTable
CREATE TABLE "platform"."engagement_wiki_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "engagementId" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" UUID,

    CONSTRAINT "engagement_wiki_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_wiki_pages_engagementId_order_idx" ON "platform"."engagement_wiki_pages"("engagementId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_wiki_pages_engagementId_slug_key" ON "platform"."engagement_wiki_pages"("engagementId", "slug");

-- AddForeignKey
ALTER TABLE "platform"."engagement_wiki_pages" ADD CONSTRAINT "engagement_wiki_pages_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_wiki_pages" ADD CONSTRAINT "engagement_wiki_pages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "platform"."engagement_wiki_pages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
