-- ============================================================
-- MIGRATION 010: REPAIR REFRESH TOKEN COLUMN
-- Older local databases created refresh_tokens.token, but the API
-- stores SHA-256 hashes in refresh_tokens.token_hash.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'refresh_tokens'
      AND column_name = 'token'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'refresh_tokens'
      AND column_name = 'token_hash'
  ) THEN
    ALTER TABLE refresh_tokens RENAME COLUMN token TO token_hash;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO movement_user;
