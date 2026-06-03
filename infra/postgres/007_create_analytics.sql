-- ============================================================
-- MIGRATION 007: STREAM ANALYTICS
-- Periodic snapshots of viewer count during a stream.
-- Used to draw the viewer count graph on the admin dashboard.
-- Sampled every 60 seconds by the API server.
-- ============================================================

CREATE TABLE IF NOT EXISTS stream_analytics (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id     UUID        NOT NULL REFERENCES stream_status(id) ON DELETE CASCADE,
  viewer_count  INT         NOT NULL DEFAULT 0,
  sampled_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast time-series queries for a specific stream
CREATE INDEX IF NOT EXISTS idx_analytics_stream_time
  ON stream_analytics(stream_id, sampled_at DESC);
