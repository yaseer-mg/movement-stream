-- ============================================================
-- MIGRATION 005: CHAT MESSAGES
-- Stores live chat messages per stream session.
-- Admin can soft-delete messages (is_deleted flag).
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which stream session this message belongs to
  stream_id     UUID        NOT NULL REFERENCES stream_status(id) ON DELETE CASCADE,

  -- NULL for guest viewers (not logged in)
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Display name shown in chat (copied at insert time so it
  -- doesn't change if user later updates their profile)
  display_name  TEXT        NOT NULL,

  message       TEXT        NOT NULL
                            CHECK (char_length(message) BETWEEN 1 AND 500),

  -- Soft delete — message stays in DB but hidden from UI
  is_deleted    BOOLEAN     NOT NULL DEFAULT false,
  deleted_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast retrieval of chat history for a stream in chronological order
CREATE INDEX IF NOT EXISTS idx_chat_stream_id   ON chat_messages(stream_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_user_id     ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_not_deleted ON chat_messages(stream_id, is_deleted, created_at);
