const { Router } = require('express');
const { activeConnections } = require('../whip');
const { startTranscoding, stopTranscoding, activeProcesses } = require('../transcoder');
const { generateMasterPlaylist } = require('../packager');

const router = Router();

// ─────────────────────────────────────────
// Mixer state
// Tracks which camera is currently on air.
// ─────────────────────────────────────────
let activeCamera = 'cam1';

// ─────────────────────────────────────────
// POST /internal/switch-camera
// Called by the API server when admin switches cameras.
// Body: { camera: 'cam1' | 'cam2' | 'cam3' }
//
// Flow:
// 1. Validate the target camera slot
// 2. Check if a peer connection exists for that slot
// 3. Stop transcoding the old camera
// 4. Start transcoding the new camera
// 5. Generate master playlist
// 6. Update activeCamera state
// ─────────────────────────────────────────
router.post('/switch-camera', (req, res) => {
  const { camera } = req.body;
  const validSlots = ['cam1', 'cam2', 'cam3'];

  if (!camera || !validSlots.includes(camera)) {
    return res.status(400).json({
      success: false,
      error: `camera must be one of: ${validSlots.join(', ')}`,
    });
  }

  // Already on this camera — no-op
  if (camera === activeCamera) {
    return res.json({
      success: true,
      data: { activeCamera, message: 'Already on this camera' },
    });
  }

  // Check if the target camera has an active WebRTC connection
  const targetConnection = activeConnections.get(camera);
  if (!targetConnection) {
    return res.status(404).json({
      success: false,
      error: `No active connection on ${camera}. Is the camera operator connected?`,
    });
  }

  // Check if the target camera has transcoding running
  const targetTranscoding = activeProcesses.get(camera);
  if (!targetTranscoding) {
    // Start transcoding for the new camera
    try {
      startTranscoding(camera);
      generateMasterPlaylist();
      console.log(`[Mixer] Started transcoding for ${camera}`);
    } catch (err) {
      console.error(`[Mixer] Failed to start transcoding for ${camera}:`, err.message);
      return res.status(500).json({
        success: false,
        error: `Failed to start transcoding for ${camera}`,
      });
    }
  }

  // Stop transcoding the old camera (if it was active and different from new)
  if (activeCamera !== camera && activeProcesses.has(activeCamera)) {
    stopTranscoding(activeCamera);
    console.log(`[Mixer] Stopped transcoding for ${activeCamera}`);
  }

  // Update state
  const previousCamera = activeCamera;
  activeCamera = camera;

  console.log(`[Mixer] Camera switched: ${previousCamera} → ${camera}`);

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
// Returns current mixer state.
// Used by the API server to check which camera is active.
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
// Returns detailed info about all camera slots.
// ─────────────────────────────────────────
router.get('/mixer/cameras', (_req, res) => {
  const cameras = ['cam1', 'cam2', 'cam3'].map((slot) => {
    const connection = activeConnections.get(slot);
    const transcoding = activeProcesses.has(slot);

    return {
      slot,
      isConnected: !!connection,
      isTranscoding: transcoding,
      isActive: slot === activeCamera,
      createdAt: connection?.createdAt || null,
    };
  });

  res.json({ success: true, data: { cameras, activeCamera } });
});

// ─────────────────────────────────────────
// POST /internal/mixer/start-all
// Starts transcoding for all connected cameras.
// Useful when the stream starts and multiple cameras
// are already connected.
// ─────────────────────────────────────────
router.post('/mixer/start-all', (_req, res) => {
  const started = [];

  for (const [slot] of activeConnections) {
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
    generateMasterPlaylist();
  }

  res.json({
    success: true,
    data: { started, activeCamera },
  });
});

// ─────────────────────────────────────────
// POST /internal/mixer/stop-all
// Stops all transcoding. Called when stream ends.
// ─────────────────────────────────────────
router.post('/mixer/stop-all', (_req, res) => {
  for (const [slot] of activeProcesses) {
    stopTranscoding(slot);
  }

  res.json({ success: true, message: 'All transcoding stopped' });
});

// ─────────────────────────────────────────
// HELPER: Get list of connected camera slots
// ─────────────────────────────────────────
function getConnectedCameras() {
  return Array.from(activeConnections.keys());
}

module.exports = router;
