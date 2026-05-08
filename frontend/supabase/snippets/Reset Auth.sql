CREATE EXTENSION IF NOT EXISTS vector;


-- Order matters: child tables first to avoid FK violations
delete from auth.sessions;
delete from auth.refresh_tokens;
delete from auth.mfa_factors;
delete from auth.mfa_challenges;
delete from auth.mfa_amr_claims;
delete from auth.identities;
delete from auth.one_time_tokens;
delete from auth.users;

-- delete from auth.schema_migrations;
delete from auth.audit_log_entries;
delete from auth.flow_state;


UPDATE platform.firms 
SET settings = settings - 'migrationState'
WHERE slug = 'deepak-spsa';