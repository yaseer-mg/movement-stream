-- ============================================================
-- MIGRATION 004: CAMERAS
-- Tracks each camera feed slot and which operator owns it.
-- Max 3 cameras supported (cam1, cam2, cam3).
-- ============================================================

CREATE TABLE IF NOT EXISTS cameras (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable label shown in the mixer UI
  label         TEXT        NOT NULL,  -- e.g. 'Main Stage', 'Wide Angle', 'Speaker Closeup'

  -- Fixed slot identifier used throughout the system
  slot          TEXT        UNIQUE NOT NULL
                            CHECK (slot IN ('cam1', 'cam2', 'cam3')),

  -- Which camera operator is assigned to this slot
  operator_id   UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Whether the camera operator's browser is currently connected
  -- Updated by media server heartbeat checks
  is_connected  BOOLEAN     NOT NULL DEFAULT false,

  -- Last time the media server received a frame from this camera
  last_seen_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-insert the 3 camera slots so they always exist
INSERT INTO cameras (label, slot) VALUES
  ('Main Stage',       'cam1'),
  ('Wide Angle',       'cam2'),
  ('Speaker Closeup',  'cam3')
ON CONFLICT (slot) DO NOTHING;
