# 1. Only reset Prisma managed data
npx prisma migrate reset --force

# 2. Delete user data in Supabase auth schema
# Order matters: child tables first to avoid FK violations
delete from auth.sessions;
delete from auth.refresh_tokens;
delete from auth.mfa_factors;
delete from auth.mfa_challenges;
delete from auth.mfa_amr_claims;
delete from auth.identities;
delete from auth.one_time_tokens;
delete from auth.users;

delete from schema_migrations;
delete from audit_log_entries;
delete from flow_state;