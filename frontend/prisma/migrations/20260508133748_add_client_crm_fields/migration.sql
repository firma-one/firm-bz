-- AlterTable
ALTER TABLE "platform"."client_contacts" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "platform"."clients" ADD COLUMN     "expectedCloseDate" TIMESTAMP(3),
ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "internalMemo" TEXT,
ADD COLUMN     "leadSource" TEXT,
ADD COLUMN     "relationshipValue" DECIMAL(12,2),
ADD COLUMN     "clientSinceDate" TIMESTAMPTZ(6),
ADD COLUMN     "linkedInUrl" TEXT,
ADD COLUMN     "companySizeBracket" TEXT,
ADD COLUMN     "billingAddress" TEXT;

-- AlterTable
ALTER TABLE "platform"."user_personalizations" ADD COLUMN "reminders" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "system"."system_signup_invites" ALTER COLUMN "updated_at" DROP DEFAULT;
