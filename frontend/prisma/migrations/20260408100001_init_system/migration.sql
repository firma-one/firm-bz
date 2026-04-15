-- System schema only. Platform DDL lives in 20260412120000_init_platform.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "system";

-- CreateTable
CREATE TABLE "system"."system_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "system_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."contact_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "email" TEXT,
    "role" TEXT,
    "team_size" TEXT,
    "inquiry_type" TEXT,
    "message" TEXT,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."waitlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'Pro',
    "company_name" TEXT,
    "company_size" TEXT,
    "role" TEXT,
    "comments" TEXT,
    "ip_address" TEXT,
    "referral_code" TEXT DEFAULT "substring"((gen_random_uuid())::text, 1, 8),
    "referred_by" TEXT,
    "referral_count" INTEGER NOT NULL DEFAULT 0,
    "position_boost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_referral_code_key" ON "system"."waitlist"("referral_code");

-- CreateIndex
CREATE INDEX "idx_waitlist_created_at" ON "system"."waitlist"("created_at");

-- CreateIndex
CREATE INDEX "idx_waitlist_email" ON "system"."waitlist"("email");

-- CreateIndex
CREATE INDEX "idx_waitlist_plan" ON "system"."waitlist"("plan");

-- CreateIndex
CREATE INDEX "idx_waitlist_referral_code" ON "system"."waitlist"("referral_code");

-- CreateIndex
CREATE INDEX "idx_waitlist_referred_by" ON "system"."waitlist"("referred_by");

-- CreateTable
CREATE TABLE "system"."system_signup_invites" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "email" text NOT NULL,
    "first_name" text NOT NULL,
    "last_name" text NOT NULL,
    "coupon_code" text,
    "invite_count" integer NOT NULL DEFAULT 1,
    "created_by" uuid,
    "created_at" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_invited_at" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_signup_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_signup_invites_email_key"
ON "system"."system_signup_invites"("email");

CREATE INDEX "idx_system_signup_invites_last_invited_at"
ON "system"."system_signup_invites"("last_invited_at");
