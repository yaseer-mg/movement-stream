const { WebSocketServer, WebSocket } = require('ws');
const { query, queryOne } = require('../db/pool');

const clients = new Set();

// ─────────────────────────────────────────
// Viewer count tracking
// ─────────────────────────────────────────
let viewerCount = 0;

// ─────────────────────────────────────────
// Ping/Pong keepalive — drops dead connections
// ─────────────────────────────────────────
const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;

function startKeepAlive(wss) {
  const interval = setInterval(() => {
    clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('WebSocket client timed out — closing');
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(interval));
}

// ─────────────────────────────────────────
// updateViewerCount()
// Called whenever a client connects or disconnects.
// Updates the DB and broadcasts to all clients.
// ─────────────────────────────────────────
async function updateViewerCount() {
  const count = clients.size;

  if (count === viewerCount) return; // no change
  viewerCount = count;

  try {
    const status = await queryOne(
      'SELECT id, peak_viewers FROM stream_status LIMIT 1'
    );

    if (!status) return;

    const newPeak = count > (status.peak_viewers || 0) ? count : status.peak_viewers;

    if (count > (status.peak_viewers || 0)) {
      await queryOne(
        'UPDATE stream_status SET viewer_count = $1, peak_viewers = $2, updated_at = now() WHERE id = $3',
        [count, newPeak, status.id]
      );
    } else {
      await queryOne(
        'UPDATE stream_status SET viewer_count = $1, updated_at = now() WHERE id = $2',
        [count, status.id]
      );
    }
  } catch (err) {
    console.error('Failed to update viewer count in DB:', err.message);
  }

  broadcast({
    type: 'stream.viewers_update',
    data: { viewer_count: count },
  });
}

// ─────────────────────────────────────────
// Analytics snapshot — every 60 seconds
// Inserts a row into stream_analytics while live.
// ─────────────────────────────────────────
function startAnalyticsSnapshot() {
  const ANALYTICS_INTERVAL_MS = 60000;

  setInterval(async () => {
    if (viewerCount === 0) return;

    try {
      const status = await queryOne('SELECT id, is_live FROM stream_status LIMIT 1');
      if (!status || !status.is_live) return;

      await queryOne(
        'INSERT INTO stream_analytics (stream_id, viewer_count) VALUES ($1, $2)',
        [status.id, viewerCount]
      );

      console.log(`Analytics snapshot: ${viewerCount} viewers`);
    } catch (err) {
      console.error('Analytics snapshot failed:', err.message);
    }
  }, ANALYTICS_INTERVAL_MS);
}

// ─────────────────────────────────────────
// Camera heartbeat handler
// Called when a camera operator sends:
// { type: 'camera.heartbeat', data: { slot: 'cam1' } }
// Updates the camera's last_seen_at in the DB.
// ─────────────────────────────────────────
async function handleCameraHeartbeat(slot) {
  const validSlots = ['cam1', 'cam2', 'cam3'];
  if (!validSlots.includes(slot)) return;

  try {
    await queryOne(
      "UPDATE cameras SET is_connected = true, last_seen_at = now() WHERE slot = $1",
      [slot]
    );
  } catch (err) {
    console.error(`Failed to update heartbeat for ${slot}:`, err.message);
  }
}

// ─────────────────────────────────────────
// Camera heartbeat checker — runs every 10 seconds
// If a camera hasn't sent a heartbeat in 10 seconds,
// mark it as disconnected and broadcast the event.
// ─────────────────────────────────────────
function startHeartbeatChecker() {
  const CHECK_INTERVAL_MS = 10000;

  setInterval(async () => {
    try {
      const staleCameras = await query(
        "SELECT slot FROM cameras WHERE last_seen_at < now() - interval '10 seconds' AND is_connected = true"
      );

      for (const cam of staleCameras) {
        await queryOne(
          "UPDATE cameras SET is_connected = false WHERE slot = $1",
          [cam.slot]
        );

        broadcast({
          type: 'camera.disconnected',
          data: { slot: cam.slot },
        });

        console.log(`Camera ${cam.slot} marked disconnected (no heartbeat)`);
      }
    } catch (err) {
      console.error('Heartbeat checker failed:', err.message);
    }
  }, CHECK_INTERVAL_MS);
}

// ─────────────────────────────────────────
// initWebSocket(server)
// Creates the WebSocket server, attaches to
// the same HTTP server as Express.
// ─────────────────────────────────────────
function initWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    clients.add(ws);
    console.log(`WebSocket client connected. Total: ${clients.size}`);

    // Welcome message — confirms connection is live
    ws.send(JSON.stringify({
      type: 'connection.ready',
      data: { message: 'Connected to Movement Stream' },
    }));

    // Update viewer count after adding the client
    updateViewerCount();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        handleClientMessage(ws, event);
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format — send valid JSON' },
        }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Total: ${clients.size}`);
      // Update viewer count after removing the client
      updateViewerCount();
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err.message);
      clients.delete(ws);
    });
  });

  startKeepAlive(wss);
  startAnalyticsSnapshot();
  startHeartbeatChecker();
  console.log('WebSocket server ready');
  return wss;
}

// ─────────────────────────────────────────
// handleClientMessage(ws, event)
// Processes messages sent FROM the browser.
//
// IMPORTANT: Chat messages are sent via HTTP
// POST /api/chat, NOT via WebSocket. The
// WebSocket is used for RECEIVING broadcasts.
//
// Client → Server event types:
//   studio.heartbeat — broadcaster is alive
//   camera.heartbeat — camera op is alive
// ─────────────────────────────────────────
function handleClientMessage(ws, event) {
  switch (event.type) {
    case 'studio.heartbeat':
      ws.send(JSON.stringify({ type: 'studio.heartbeat.ack' }));
      break;

    case 'camera.heartbeat':
      handleCameraHeartbeat(event.data?.slot);
      ws.send(JSON.stringify({ type: 'camera.heartbeat.ack' }));
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: `Unknown event type: ${event.type}` },
      }));
      break;
  }
}

// ─────────────────────────────────────────
// broadcast(event)
// Sends a JSON event to ALL connected clients.
// ─────────────────────────────────────────
function broadcast(event) {
  const message = JSON.stringify(event);
  let sent = 0;

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent++;
    }
  });

  console.log(`Broadcast [${event.type}] -> ${sent} clients`);
}

// ─────────────────────────────────────────
// getClientCount()
// Returns the number of active WebSocket connections.
// ─────────────────────────────────────────
function getClientCount() {
  return clients.size;
}

module.exports = { initWebSocket, broadcast, getClientCount };
