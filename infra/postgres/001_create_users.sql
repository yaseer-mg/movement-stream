-- ============================================================
-- MIGRATION 001: USERS
-- Stores all platform users — admins, camera operators, viewers
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- enables gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,

  -- Role controls what each user can do:
  -- 'super_admin' → full access, can go live, manage everything
  -- 'admin'       → can manage events, moderate chat, view dashboard
  -- 'camera_op'   → can connect a camera feed only
  -- 'viewer'      → public viewer, can watch and chat
  role          TEXT        NOT NULL DEFAULT 'viewer'
                            CHECK (role IN ('super_admin', 'admin', 'camera_op', 'viewer')),

  avatar_url    TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast email lookups during login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for role-based queries (e.g. list all admins)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
