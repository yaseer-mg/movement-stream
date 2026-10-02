-- ============================================================
-- MIGRATION 005: RESTREAM TARGETS
-- Social media platforms we push the live feed out to (RTMP).
-- Each row = one destination (YouTube, Facebook, Instagram...).
-- The stream_key is secret — admin API responses MUST NOT
-- expose it; only the internal media-server fetch returns it.
-- ============================================================

CREATE TABLE IF NOT EXISTS restream_targets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display name shown in the admin UI, e.g. 'YouTube Main Channel'
  name        TEXT        NOT NULL,

  -- Which platform this target belongs to
  platform    TEXT        NOT NULL CHECK (platform IN ('youtube', 'facebook', 'instagram', 'custom')),

  -- RTMP/RTMPS ingest URL (without the trailing stream key)
  -- e.g. 'rtmp://a.rtmp.youtube.com/live2' or 'rtmps://live-api-s.facebook.com:443/rtmp'
  ingest_url  TEXT        NOT NULL,

  -- Secret stream key — appended to ingest_url at push time.
  -- Store at rest, but NEVER return via admin-facing endpoints.
  stream_key  TEXT        NOT NULL,

  -- Enabled targets are pushed to on every Go Live. Disabled
  -- targets are kept for later but skipped.
  enabled     BOOLEAN     NOT NULL DEFAULT true,

  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);