-- ============================================================
-- RUN_MIGRATIONS.SQL
-- Master file — runs all migrations in the correct order.
-- Run this ONE file to set up the entire database from scratch.
--
-- Usage:
--   psql -U postgres -d movement_stream -f run_migrations.sql
-- ============================================================

\echo '>>> Running Migration 001: Users...'
\i 001_create_users.sql

\echo '>>> Running Migration 002: Events...'
\i 002_create_events.sql

\echo '>>> Running Migration 003: Stream Status...'
\i 003_create_stream_status.sql

\echo '>>> Running Migration 004: Cameras...'
\i 004_create_cameras.sql

\echo '>>> Running Migration 005: Chat Messages...'
\i 005_create_chat.sql

\echo '>>> Running Migration 006: Recordings...'
\i 006_create_recordings.sql

\echo '>>> Running Migration 007: Analytics...'
\i 007_create_analytics.sql

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
