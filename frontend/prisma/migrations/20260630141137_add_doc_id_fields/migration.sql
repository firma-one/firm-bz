-- AlterTable
ALTER TABLE "platform"."engagement_documents" ADD COLUMN     "docId" TEXT;

-- AlterTable
ALTER TABLE "platform"."engagements" ADD COLUMN     "docIdPrefix" TEXT,
ADD COLUMN     "docIdSeq" INTEGER NOT NULL DEFAULT 0;
