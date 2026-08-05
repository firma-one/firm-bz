-- CreateEnum
CREATE TYPE "platform"."EngagementDocumentType" AS ENUM ('FILE', 'LINK');

-- AlterTable
ALTER TABLE "platform"."engagement_documents" ADD COLUMN     "documentType" "platform"."EngagementDocumentType" NOT NULL DEFAULT 'FILE',
ADD COLUMN     "externalUrl" TEXT;
