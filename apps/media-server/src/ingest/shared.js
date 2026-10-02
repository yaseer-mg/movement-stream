const connections = require('../connections');
const { config } = require('../config');

// ─────────────────────────────────────────
// notifyApiServer(eventType, data)
// Fire-and-forget callback to the api-server.
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
    console.log(`[Ingest] Could not notify api-server about ${eventType}`);
  }
}

// ─────────────────────────────────────────
// dropPreviousConnection(slot)
// A slot can only have one broadcaster. Tear down whatever
// is currently attached (POST request or WebSocket) so a
// reconnect always wins.
// ─────────────────────────────────────────
function dropPreviousConnection(slot) {
  const previous = connections.get(slot);
  if (!previous) return;

  console.log(`[Ingest] Aborting previous connection on ${slot}`);
  try { previous.req?.destroy(); } catch {}
  try { previous.abortController?.abort(); } catch {}
  try { previous.ws?.close(4001, 'replaced by a new broadcaster'); } catch {}
  connections.remove(slot);
}

// ─────────────────────────────────────────
// handleSlotClosed(slot)
// Runs when a broadcaster goes away (clean or abrupt). Closes
// FFmpeg stdin so playlists finalize, tells the api-server the
// camera dropped, and — if it was the last camera — asks it to
// wind the broadcast down instead of leaving stale LIVE state.
// ─────────────────────────────────────────
function handleSlotClosed(slot) {
  connections.remove(slot);
  try { require('../transcoder').endSlot(slot); } catch {}

  notifyApiServer('camera.disconnected', { slot });

  if (connections.list().length === 0) {
    notifyApiServer('camera.all_disconnected', {});
  }
}

module.exports = { notifyApiServer, dropPreviousConnection, handleSlotClosed };
