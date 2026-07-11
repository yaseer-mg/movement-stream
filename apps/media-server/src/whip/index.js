const { Router } = require('express');
const { RTCPeerConnection } = require('wrtc');
const { config } = require('../config');

const router = Router();

// ─────────────────────────────────────────
// Active peer connections: slot → { pc, createdAt }
// The mixer (Step 9) will read from this map
// to switch between camera feeds.
// ─────────────────────────────────────────
const activeConnections = new Map();

// ─────────────────────────────────────────
// POST /whip
// Accepts a WebRTC SDP offer from a broadcaster's browser.
// The browser sends X-Camera-Slot header (cam1/cam2/cam3)
// to tell us which camera feed this connection is for.
//
// Returns SDP answer with all ICE candidates bundled.
// ─────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const cameraSlot = req.headers['x-camera-slot'];
    const validSlots = ['cam1', 'cam2', 'cam3'];

    if (!cameraSlot || !validSlots.includes(cameraSlot)) {
      return res.status(400).json({
        success: false,
        error: 'X-Camera-Slot header is required (cam1, cam2, or cam3)',
      });
    }

    // SDP offer comes as raw text in the body
    const sdpOffer = req.body;
    if (!sdpOffer || typeof sdpOffer !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Request body must be an SDP offer string',
      });
    }

    // If there's already an active connection on this slot, close it first
    if (activeConnections.has(cameraSlot)) {
      const old = activeConnections.get(cameraSlot);
      try { old.pc.close(); } catch {}
      activeConnections.delete(cameraSlot);
      console.log(`Closed previous connection on ${cameraSlot}`);
    }

    // ─── Create server-side peer connection ───
    const pc = new RTCPeerConnection({
      iceServers: [], // No STUN/TURN needed — server is on same network
    });

    // Store the connection so the mixer can access it later
    activeConnections.set(cameraSlot, { pc, createdAt: new Date() });

    // ─── Handle incoming tracks (video + audio from broadcaster) ───
    pc.ontrack = (event) => {
      console.log(`Track received on ${cameraSlot}: ${event.track.kind} (${event.track.label})`);
      // Step 7 will pipe these tracks into FFmpeg
    };

    // ─── Handle connection state changes ───
    pc.onconnectionstatechange = () => {
      console.log(`[${cameraSlot}] Connection state: ${pc.connectionState}`);

      if (pc.connectionState === 'connected') {
        console.log(`Camera ${cameraSlot} is LIVE`);
        notifyApiServer('camera.connected', { slot: cameraSlot });
      }

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.log(`Camera ${cameraSlot} disconnected`);
        activeConnections.delete(cameraSlot);
        notifyApiServer('camera.disconnected', { slot: cameraSlot });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[${cameraSlot}] ICE state: ${pc.iceConnectionState}`);
    };

    // ─── Set remote description (the SDP offer from browser) ───
    await pc.setRemoteDescription({
      type: 'offer',
      sdp: sdpOffer,
    });

    // ─── Create answer ───
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // ─── Wait for ICE gathering to complete ───
    // This collects all ICE candidates so the browser doesn't need
    // to do trickle ICE (simplifies the client code).
    await waitForIceGathering(pc);

    // ─── Return SDP answer with all ICE candidates bundled ───
    const answerSdp = pc.localDescription.sdp;

    res.status(201)
      .set('Content-Type', 'application/sdp')
      .send(answerSdp);

    console.log(`Camera ${cameraSlot} WHIP handshake complete`);

  } catch (err) {
    console.error(`WHIP error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// DELETE /whip/:slot
// Disconnects a specific camera feed.
// ─────────────────────────────────────────
router.delete('/:slot', (req, res) => {
  const { slot } = req.params;

  if (!activeConnections.has(slot)) {
    return res.status(404).json({ success: false, error: 'No active connection on this slot' });
  }

  const { pc } = activeConnections.get(slot);
  try { pc.close(); } catch {}
  activeConnections.delete(slot);

  notifyApiServer('camera.disconnected', { slot });

  res.json({ success: true, message: `Camera ${slot} disconnected` });
});

// ─────────────────────────────────────────
// GET /whip/connections
// Returns active camera connections (for debugging).
// ─────────────────────────────────────────
router.get('/connections', (_req, res) => {
  const connections = [];
  for (const [slot, { pc, createdAt }] of activeConnections) {
    connections.push({
      slot,
      state: pc.connectionState,
      iceState: pc.iceConnectionState,
      createdAt,
    });
  }
  res.json({ success: true, data: { connections } });
});

// ─────────────────────────────────────────
// HELPER: Wait for ICE gathering to complete
// ─────────────────────────────────────────
function waitForIceGathering(pc) {
  return new Promise((resolve) => {
    // If already gathered, resolve immediately
    if (pc.iceGatheringState === 'complete') {
      return resolve();
    }

    const timeout = setTimeout(() => {
      // Resolve after 2 seconds even if not complete
      // (some networks are slow, but we can't wait forever)
      console.log('ICE gathering timeout — proceeding with available candidates');
      resolve();
    }, 2000);

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
      }
    };
  });
}

// ─────────────────────────────────────────
// HELPER: Notify the API server about camera events
// Fire-and-forget — don't fail the WHIP handshake
// if the API server is unreachable.
// ─────────────────────────────────────────
async function notifyApiServer(eventType, data) {
  try {
    await fetch(`${config.apiServer.url}/api/stream/camera-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-media-secret': config.apiServer.secret,
      },
      body: JSON.stringify({ event: eventType, ...data }),
    });
  } catch {
    // Non-critical — log and move on
    console.log(`Could not notify API server about ${eventType}`);
  }
}

// ─────────────────────────────────────────
// Export activeConnections so the mixer (Step 9)
// can access the peer connections for switching.
// ─────────────────────────────────────────
module.exports = router;
module.exports.activeConnections = activeConnections;
