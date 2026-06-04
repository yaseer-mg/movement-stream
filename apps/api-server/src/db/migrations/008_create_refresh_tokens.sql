-- ============================================================
-- MIGRATION 008: REFRESH TOKENS
-- Stores active refresh tokens so we can revoke them on logout.
-- When a user logs out, we DELETE their row here.
-- When they log in again, we INSERT a new row.
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup when client sends a refresh token
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Automatically clean up expired tokens
-- (run this as a cron job or just let them accumulate and clean periodically)
-- DELETE FROM refresh_tokens WHERE expires_at < now();