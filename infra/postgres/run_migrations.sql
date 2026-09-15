-- ============================================================
-- RUN_MIGRATIONS.SQL
-- Master file — runs all migrations in the correct order.
-- Run this ONE file to set up the entire database from scratch.
--
-- Usage:
--   psql -U postgres -d movement_stream -f run_migrations.sql
-- Or, after 000_create_database.sql:
--   PGPASSWORD='Movement2025!' psql -h localhost -U movement_user -d movement_stream -f run_migrations.sql
-- ============================================================

\echo '>>> Running Migration 001: Users...'
\ir 001_create_users.sql

\echo '>>> Running Migration 002: Events...'
\ir 002_create_events.sql

\echo '>>> Running Migration 003: Stream Status...'
\ir 003_create_stream_status.sql

\echo '>>> Running Migration 004: Cameras...'
\ir 004_create_cameras.sql

\echo '>>> Running Migration 005: Chat Messages...'
\ir 005_create_chat.sql

\echo '>>> Running Migration 006: Recordings...'
\ir 006_create_recordings.sql

\echo '>>> Running Migration 007: Analytics...'
\ir 007_create_analytics.sql

\echo '>>> Running Migration 008: Refresh Tokens...'
\ir 008_create_refresh_tokens.sql

\echo '>>> Running Migration 009: App Role Permissions...'
\ir 009_grant_app_permissions.sql

\echo '>>> Running Migration 010: Repair Refresh Token Schema...'
\ir 010_repair_refresh_tokens_schema.sql

\echo ''
\echo '✅ All migrations complete. Database is ready.'
\echo ''

-- ============================================================
-- VERIFY: List all created tables
-- ============================================================
\echo '>>> Tables created:'
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
