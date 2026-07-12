const { WebSocketServer, WebSocket } = require('ws');

const clients = new Set();

// ─────────────────────────────────────────
// Ping/Pong keepalive — drops dead connections
// ─────────────────────────────────────────
const PING_INTERVAL_MS = 30000; // ping every 30 seconds
const PONG_TIMEOUT_MS = 10000;  // kill if no pong in 10 seconds

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
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err.message);
      clients.delete(ws);
    });
  });

  startKeepAlive(wss);
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
      // Broadcaster confirms they are still live.
      // Future: update broadcaster status in DB.
      ws.send(JSON.stringify({ type: 'studio.heartbeat.ack' }));
      break;

    case 'camera.heartbeat':
      // Camera operator confirms their feed is alive.
      // Future: update camera last_seen_at in DB.
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
// Used by REST routes after DB writes:
//   - chat.js sends chat.message, chat.message_deleted
//   - stream.js sends stream.live, stream.ended, etc.
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
// Used by viewer count tracking (Step 13).
// ─────────────────────────────────────────
function getClientCount() {
  return clients.size;
}

module.exports = { initWebSocket, broadcast, getClientCount };
