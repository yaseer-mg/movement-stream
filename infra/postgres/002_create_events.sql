-- ============================================================
-- MIGRATION 002: EVENTS
-- Scheduled programs — conferences, rallies, seminars etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,

  -- Physical or online location of the event
  location      TEXT,  -- e.g. 'Kano', 'Abuja', 'Kaduna', 'Online'

  thumbnail_url TEXT,

  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,

  -- Lifecycle of an event
  status        TEXT        NOT NULL DEFAULT 'upcoming'
                            CHECK (status IN ('upcoming', 'live', 'ended', 'cancelled')),

  -- Featured events appear prominently on homepage
  is_featured   BOOLEAN     NOT NULL DEFAULT false,

  -- Which admin created this event
  created_by    UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup for upcoming events sorted by date
CREATE INDEX IF NOT EXISTS idx_events_starts_at  ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_featured   ON events(is_featured);
