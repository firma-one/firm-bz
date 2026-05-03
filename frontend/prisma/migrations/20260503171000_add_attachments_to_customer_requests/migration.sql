-- AlterTable
ALTER TABLE "platform"."customer_requests" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb;
