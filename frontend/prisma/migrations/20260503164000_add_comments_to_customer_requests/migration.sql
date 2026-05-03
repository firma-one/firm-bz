-- AlterTable
ALTER TABLE "platform"."customer_requests" ADD COLUMN "comments" JSONB NOT NULL DEFAULT '[]';
