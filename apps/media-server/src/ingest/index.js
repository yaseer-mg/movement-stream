const { Router } = require('express');
const connections = require('../connections');
const {
  startTranscoding,
  stopTranscoding,
  writeToSlot,
  endSlot,
  activeProcesses,
} = require('../transcoder');
const { config } = require('../config');
const { generateMasterPlaylist } = require('../packager');
const { notifyApiServer, dropPreviousConnection, handleSlotClosed } = require('./shared');

const router = Router();

// ─────────────────────────────────────────
// POST /ingest/:slot
// Streams a live webm upload from a broadcaster and tees the bytes
// into four per-slot FFmpeg processes, each writing one HLS
// rendition. The request stays open for the duration of the
// broadcast.
//
// Live browsers use the WebSocket route in ./ws.js instead — Chrome
// cannot send a ReadableStream request body over HTTP/1.1. This HTTP
// route is kept for scripted/CLI uploads and tests.
// ─────────────────────────────────────────
router.post('/:slot', async (req, res) => {
  const { slot } = req.params;

  if (!connections.isValidSlot(slot)) {
    return res.status(400).json({ success: false, error: 'Invalid slot (cam1/cam2/cam3)' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('video/webm') && !contentType.includes('video/mp4')) {
    return res.status(415).json({ success: false, error: 'Content-Type must be video/webm or video/mp4' });
  }

  // Abort any existing ingest on this slot
  dropPreviousConnection(slot);

  const abortController = new AbortController();
  const createdAt = new Date();
  let bytesReceived = 0;
  let paused = false;
  let drainsPending = 0;

  // Ensure transcoding is running for this slot
  if (!activeProcesses.has(slot)) {
    try {
      startTranscoding(slot);
      generateMasterPlaylist();
    } catch (err) {
      console.error(`[Ingest] Failed to start transcoding for ${slot}:`, err.message);
      return res.status(500).json({ success: false, error: 'Failed to start transcoding' });
    }
  }

  const entry = connections.set(slot, {
    protocol: 'ingest',
    req,
    abortController,
    connectedAt: createdAt,
    bytesReceived: 0,
  });

  console.log(`[Ingest] ${slot} connected`);

  try {
    await notifyApiServer('camera.connected', { slot });
  } catch {}

  const stdins = activeProcesses.get(slot)?.stdins || [];
  if (stdins.length === 0) {
    connections.remove(slot);
    return res.status(503).json({ success: false, error: 'FFmpeg not ready' });
  }

  req.on('data', (chunk) => {
    bytesReceived += chunk.length;
    entry.bytesReceived = bytesReceived;

    const accepted = writeToSlot(slot, chunk);
    if (!accepted) {
      paused = true;
      req.pause();
    }
  });

  req.on('end', () => {
    console.log(`[Ingest] ${slot} upload ended (${bytesReceived} bytes)`);
    connections.remove(slot);
    endSlot(slot);
    if (!res.headersSent) {
      res.status(200).json({ success: true, message: 'Ingest ended' });
    }
  });

  req.on('error', (err) => {
    if (err.code === 'ECONNRESET' || abortController.signal.aborted) return;
    console.error(`[Ingest] ${slot} connection error:`, err.message);
  });

  req.on('close', () => {
    // The body never reached a clean EOF (or a newer broadcaster took
    // this slot). Send end-of-stream to FFmpeg so it finalizes its
    // playlists, and tell the API server the camera dropped so it can
    // wind the broadcast down instead of leaving stale "LIVE" state.
    if (connections.get(slot) === entry) {
      console.log(`[Ingest] ${slot} connection closed without clean end`);
      handleSlotClosed(slot);
    }
  });

  // Resume the request once every FFmpeg pipe has drained.
  for (const stdin of stdins) {
    if (stdin.destroyed) continue;
    stdin.on('drain', () => {
      drainsPending += 1;
      if (drainsPending === stdins.length) {
        drainsPending = 0;
        if (paused) {
          paused = false;
          req.resume();
        }
      }
    });
  }

  stdins.forEach((stdin) => stdin.on('error', () => {}));

  // Don't send a response until the body ends — the client (fetch)
  // stays open until MediaRecorder is stopped.
});

// ─────────────────────────────────────────
// DELETE /ingest/:slot
// Forces an ingest connection closed.
// ─────────────────────────────────────────
router.delete('/:slot', (req, res) => {
  const { slot } = req.params;

  if (!connections.has(slot)) {
    return res.status(404).json({ success: false, error: 'No active ingest on this slot' });
  }

  const entry = connections.get(slot);
  try { entry.req?.destroy(); } catch {}
  try { entry.ws?.close(1000, 'stopped by mixer'); } catch {}
  connections.remove(slot);

  res.json({ success: true, message: `Ingest on ${slot} stopped` });
});

// ─────────────────────────────────────────
// GET /ingest/connections
// ─────────────────────────────────────────
router.get('/connections', (_req, res) => {
  res.json({ success: true, data: { connections: connections.list() } });
});

// ─────────────────────────────────────────
// GET /ingest/health
// ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'ingest',
    status: 'ok',
    connections: connections.list().map((c) => c.slot),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// notifyApiServer / dropPreviousConnection / handleSlotClosed
// Live in ./shared.js so the HTTP and WebSocket ingest routes
// wind a slot down identically.
// ─────────────────────────────────────────

module.exports = router;