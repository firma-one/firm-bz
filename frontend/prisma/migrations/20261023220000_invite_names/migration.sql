-- An inviter can supply the invitee's name, which acceptance seeds onto their Supabase account.
--
-- Invites used to carry an email and nothing else, so an invited user had no first/last name until
-- they found the profile form themselves — until then every surface rendered them from their email
-- local part. Nullable because the fields stay optional: an inviter who does not know the name
-- leaves them empty and the account falls back as before.
--
-- Written by hand from `prisma migrate diff` rather than `migrate dev --create-only`: the shadow
-- database cannot replay this project's earlier migrations, which reference Supabase's auth.users.
-- The diff's unrelated `DROP INDEX reddit_screener.posts_embedding_idx` is deliberately omitted —
-- that index is a pgvector index Prisma does not model, not drift this migration should correct.

-- AlterTable
ALTER TABLE "platform"."engagement_invitations" ADD COLUMN "first_name" TEXT,
ADD COLUMN "last_name" TEXT;

-- AlterTable
ALTER TABLE "platform"."firm_invitations" ADD COLUMN "first_name" TEXT,
ADD COLUMN "last_name" TEXT;

-- AlterTable
ALTER TABLE "platform"."client_invitations" ADD COLUMN "first_name" TEXT,
ADD COLUMN "last_name" TEXT;
