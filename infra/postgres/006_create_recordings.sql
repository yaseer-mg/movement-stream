-- ============================================================
-- MIGRATION 006: RECORDINGS
-- Stores metadata for every saved stream recording.
-- Actual video files live on AWS S3.
-- ============================================================

CREATE TABLE IF NOT EXISTS recordings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links back to the event and stream session
  event_id          UUID        REFERENCES events(id) ON DELETE SET NULL,
  stream_id         UUID        REFERENCES stream_status(id) ON DELETE SET NULL,

  title             TEXT        NOT NULL,
  description       TEXT,

  -- Full S3 URL to the .mp4 file
  -- e.g. https://movement-recordings.s3.amazonaws.com/recordings/2025-08-15_abuja.mp4
  file_url          TEXT        NOT NULL,

  -- S3 object key (used for deletion or signed URL generation)
  -- e.g. recordings/2025-08-15_abuja-peace-conference.mp4
  s3_key            TEXT        NOT NULL,

  -- S3 URL to the thumbnail image
  thumbnail_url     TEXT,

  -- Video metadata
  duration_secs     INT,                    -- total length in seconds
  file_size_bytes   BIGINT,                 -- used for storage tracking

  -- Public recordings show on the public portal
  -- Private recordings only visible to admins
  is_public         BOOLEAN     NOT NULL DEFAULT true,

  -- Processing state after stream ends
  -- 'processing' → FFmpeg is merging segments
  -- 'ready'      → uploaded to S3, available to watch
  -- 'failed'     → something went wrong
  processing_status TEXT        NOT NULL DEFAULT 'processing'
                                CHECK (processing_status IN ('processing', 'ready', 'failed')),

  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup for public recordings sorted newest first
CREATE INDEX IF NOT EXISTS idx_recordings_public     ON recordings(is_public, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_event_id   ON recordings(event_id);
CREATE INDEX IF NOT EXISTS idx_recordings_processing ON recordings(processing_status);
