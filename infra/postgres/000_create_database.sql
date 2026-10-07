-- ============================================================
-- CREATE DATABASE
-- Creates the local development database and application role.
--
-- Usage:
--   psql -U postgres -f 000_create_database.sql
-- ============================================================

SELECT 'CREATE ROLE movement_user LOGIN PASSWORD ''Movement2025!'''
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'movement_user'
)\gexec

SELECT 'CREATE DATABASE faeez_live OWNER movement_user'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'faeez_live'
)\gexec
