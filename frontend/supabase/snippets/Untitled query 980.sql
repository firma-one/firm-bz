DROP SCHEMA IF EXISTS system, platform CASCADE;
TRUNCATE TABLE public._prisma_migrations;

TRUNCATE TABLE auth.users cascade;
