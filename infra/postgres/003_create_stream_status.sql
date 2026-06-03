-- ============================================================
-- MIGRATION 003: STREAM STATUS
-- Single control row — the heartbeat of the entire platform.
-- Only ONE row ever exists. Admin updates it to go live.
-- ============================================================

CREATE TABLE IF NOT EXISTS stream_status (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core live state
  is_live         BOOLEAN     NOT NULL DEFAULT false,
  title           TEXT,
  description     TEXT,

  -- Link to the scheduled event this stream belongs to (optional)
  event_id        UUID        REFERENCES events(id) ON DELETE SET NULL,

  -- Which camera is currently on air: 'cam1', 'cam2', 'cam3'
  active_camera   TEXT        NOT NULL DEFAULT 'cam1',

  -- Admin can toggle chat on/off mid-stream
  chat_enabled    BOOLEAN     NOT NULL DEFAULT true,

  -- Viewer tracking
  viewer_count    INT         NOT NULL DEFAULT 0,
  peak_viewers    INT         NOT NULL DEFAULT 0,

  -- Stream lifecycle timestamps
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,

  -- Secret key used by media server to authenticate the stream
  -- Stored as plain text here but only exposed to super_admin
  stream_key      TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ⚠️ INSERT the single control row immediately after table creation.
-- The entire platform reads and updates THIS row.
INSERT INTO stream_status (is_live, chat_enabled)
VALUES (false, true)
ON CONFLICT DO NOTHING;
