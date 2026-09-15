const { Router } = require('express');
const connections = require('../connections');
const { startTranscoding, stopTranscoding, stopAllTranscoding, activeProcesses } = require('../transcoder');
const { generateMasterPlaylist } = require('../packager');
const recorder = require('../recorder');

const router = Router();

// ─────────────────────────────────────────
// Mixer state
// ─────────────────────────────────────────
let activeCamera = 'cam1';

// ─────────────────────────────────────────
// POST /internal/switch-camera
// Admin switches the live program to a new camera slot.
//
// All connected cameras continue transcoding so the mix
// can switch back later without reconnecting. The master
// playlist is repointed to the new active slot.
// ─────────────────────────────────────────
router.post('/switch-camera', (req, res) => {
  const { camera } = req.body;

  if (!connections.isValidSlot(camera)) {
    return res.status(400).json({
      success: false,
      error: 'camera must be one of: cam1, cam2, cam3',
    });
  }

  // No-op if already on this camera
  if (camera === activeCamera) {
    return res.json({ success: true, data: { activeCamera, message: 'Already on this camera' } });
  }

  // Target must have an active ingest connection
  if (!connections.has(camera)) {
    return res.status(404).json({
      success: false,
      error: `No active ingest on ${camera}`,
    });
  }

  const previousCamera = activeCamera;

  // Snapshot the outgoing camera before repointing
  const streamId = req.body.streamId;
  if (streamId && recorder.hasActiveSession(streamId)) {
    recorder.snapshotSlot(streamId, previousCamera);
  }

  activeCamera = camera;
  generateMasterPlaylist(activeCamera);

  console.log(`[Mixer] Camera switched: ${previousCamera} → ${activeCamera}`);

  res.json({
    success: true,
    data: {
      activeCamera,
      previousCamera,
      connectedCameras: getConnectedCameras(),
    },
  });
});

// ─────────────────────────────────────────
// GET /internal/mixer/status
// ─────────────────────────────────────────
router.get('/mixer/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      activeCamera,
      connectedCameras: getConnectedCameras(),
      transcodingSlots: Array.from(activeProcesses.keys()),
    },
  });
});

// ─────────────────────────────────────────
// GET /internal/mixer/cameras
// ─────────────────────────────────────────
router.get('/mixer/cameras', (_req, res) => {
  const cameras = ['cam1', 'cam2', 'cam3'].map((slot) => ({
    slot,
    isConnected: connections.has(slot),
    isTranscoding: activeProcesses.has(slot),
    isActive: slot === activeCamera,
    createdAt: connections.get(slot)?.connectedAt || null,
  }));

  res.json({ success: true, data: { cameras, activeCamera } });
});

// ─────────────────────────────────────────
// POST /internal/mixer/start-all
// Starts transcoding for all connected cameras.
// ─────────────────────────────────────────
router.post('/mixer/start-all', (_req, res) => {
  const started = [];

  for (const slot of connections.keys()) {
    if (!activeProcesses.has(slot)) {
      try {
        startTranscoding(slot);
        started.push(slot);
      } catch (err) {
        console.error(`[Mixer] Failed to start transcoding for ${slot}:`, err.message);
      }
    }
  }

  if (started.length > 0) {
    generateMasterPlaylist(activeCamera);
  }

  res.json({ success: true, data: { started, activeCamera } });
});

// ─────────────────────────────────────────
// POST /internal/mixer/stop-all
// Stops all transcoding (stream ended).
// ─────────────────────────────────────────
router.post('/mixer/stop-all', (_req, res) => {
  stopAllTranscoding();
  res.json({ success: true, message: 'All transcoding stopped' });
});

// ─────────────────────────────────────────
// Session lifecycle endpoints
// Called by the api-server at stream start/end.
// ─────────────────────────────────────────

router.post('/session/start', (req, res) => {
  const { streamId, eventId, streamTitle } = req.body;

  if (!streamId) {
    return res.status(400).json({ success: false, error: 'streamId is required' });
  }

  recorder.startSession(streamId, { eventId, streamTitle });
  generateMasterPlaylist(activeCamera);

  res.json({ success: true, message: 'Recording session started', data: { activeCamera } });
});

router.post('/session/end', async (req, res) => {
  const { streamId } = req.body;

  if (!streamId) {
    return res.status(400).json({ success: false, error: 'streamId is required' });
  }

  try {
    await recorder.endSession(streamId, activeCamera);
  } catch (err) {
    console.error('[Mixer] Session end failed:', err.message);
  }

  res.json({ success: true, message: 'Recording session ended' });
});

// ─────────────────────────────────────────
// Helper
// ─────────────────────────────────────────
function getConnectedCameras() {
  return Array.from(connections.keys());
}

module.exports = router;