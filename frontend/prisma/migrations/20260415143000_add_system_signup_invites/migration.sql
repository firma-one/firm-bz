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
