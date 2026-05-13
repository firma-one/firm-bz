ALTER TABLE "platform"."engagement_wiki_pages" DROP COLUMN IF EXISTS "content";
ALTER TABLE "platform"."engagement_wiki_pages" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
