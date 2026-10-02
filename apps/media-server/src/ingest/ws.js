const { WebSocketServer } = require('ws');
const connections = require('../connections');
const { startTranscoding, writeToSlot, endSlot, activeProcesses } = require('../transcoder');
const { generateMasterPlaylist } = require('../packager');
const { notifyApiServer, dropPreviousConnection, handleSlotClosed } = require('./shared');

// ─────────────────────────────────────────
// WebSocket live ingest.
//
// Why a WebSocket instead of the long-lived POST /ingest/:slot?
// Chrome refuses to send a ReadableStream request body over
// HTTP/1.1 — the fetch dies with net::ERR_ALPN_NEGOTIATION_FAILED
// before a single byte reaches nginx. Browsers do have a reliable
// incremental binary channel though: a WebSocket.
//
// The browser's MediaRecorder chunks are sent as binary frames and
// teed straight into the four FFmpeg stdin pipes, so this is
// byte-for-byte the same pipeline the POST path used.
// ─────────────────────────────────────────

// If the broadcaster outruns FFmpeg by this much, the kernel socket
// buffer plus ws bufferedAmount means we are storing frames in RAM
// faster than we can encode. Drop the connection instead of OOMing.
const MAX_BUFFERED_BYTES = 24 * 1024 * 1024;

function attachIngestWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return;
    }

    if (!pathname.startsWith('/ingest/')) return;

    const slot = pathname.slice('/ingest/'.length).replace(/\/+$/, '');
    if (!connections.isValidSlot(slot)) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, slot));
  });

  console.log('[IngestWS] WebSocket ingest listening on /ingest/:slot');
  return wss;
}

function handleConnection(ws, slot) {
  dropPreviousConnection(slot);

  if (!activeProcesses.has(slot)) {
    try {
      startTranscoding(slot);
      generateMasterPlaylist();
    } catch (err) {
      console.error(`[IngestWS] Failed to start transcoding for ${slot}:`, err.message);
      ws.close(1011, 'failed to start transcoding');
      return;
    }
  }

  const entry = connections.set(slot, {
    protocol: 'ingest-ws',
    ws,
    connectedAt: new Date(),
    bytesReceived: 0,
  });

  const stdins = activeProcesses.get(slot)?.stdins || [];
  if (stdins.length === 0) {
    connections.remove(slot);
    ws.close(1011, 'ffmpeg not ready');
    return;
  }

  console.log(`[IngestWS] ${slot} connected`);

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return;

    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (chunk.length === 0) return;

    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      console.warn(`[IngestWS] ${slot} is too far behind — dropping connection`);
      try { ws.close(1013, 'broadcaster too slow'); } catch {}
      return;
    }

    entry.bytesReceived += chunk.length;
    writeToSlot(slot, chunk);
  });

  ws.on('close', () => {
    if (connections.get(slot) !== entry) return; // superseded by a newer connection
    console.log(`[IngestWS] ${slot} disconnected after ${entry.bytesReceived} bytes`);
    handleSlotClosed(slot);
  });

  ws.on('error', (err) => {
    console.error(`[IngestWS] ${slot} socket error:`, err.message);
  });

  notifyApiServer('camera.connected', { slot });
}

module.exports = { attachIngestWebSocket, MAX_BUFFERED_BYTES };
