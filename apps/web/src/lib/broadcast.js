// ─────────────────────────────────────────
// broadcast.js
// Module-scoped live ingest singleton.
//
// MediaRecorder + the ingest socket must NOT die just because the
// broadcaster navigates between Studio, Camera Mixer and Dashboard.
// Keeping all references at module scope means the upload survives
// React unmounts; only an explicit End Stream (or a full page reload)
// stops it.
//
// Transport note: chunks go out over a WebSocket, not a streaming
// fetch(). Chrome cannot send a ReadableStream request body over
// HTTP/1.1 — it fails the fetch with net::ERR_ALPN_NEGOTIATION_FAILED
// before any bytes reach nginx. WebSocket binary frames are the
// reliable browser channel for incremental media.
// ─────────────────────────────────────────

let recorderRef = null;
let wsRef = null;
let streamRef = null;
let slotRef = null;
let active = false;

// Components that need to know when the broadcast starts or stops —
// especially a Studio page that mounts *after* the broadcast began, or
// must react if the ingest socket dies mid-show.
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(active); } catch {}
  }
}

export function subscribeBroadcast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Chunks already handed to the socket but not yet flushed to the
// network. If the broadcaster outruns the network we drop frames
// rather than growing this without bound.
const MAX_SOCKET_BACKLOG = 8 * 1024 * 1024;

// How long to wait for the ingest socket to open before giving up.
const CONNECT_TIMEOUT_MS = 10_000;

export function isBroadcasting() {
  return active;
}

// The MediaStream currently feeding the broadcast. A Studio page that
// mounts while the broadcast is already running adopts this so the
// operator keeps their local preview instead of seeing "no camera".
export function getBroadcastStream() {
  return active ? streamRef : null;
}

export function getBroadcastSlot() {
  return active ? slotRef : null;
}

function ingestSocketUrl(slot) {
  const configured = import.meta.env.VITE_MEDIA_SERVER_URL;
  if (configured) {
    const url = new URL(configured);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `/ingest/${slot}`;
    return url.toString();
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ingest/${slot}`;
}

function openSocket(slot) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(ingestSocketUrl(slot));
    } catch (err) {
      reject(new Error('Could not reach the ingest server'));
      return;
    }
    ws.binaryType = 'arraybuffer';

    const timer = setTimeout(() => {
      cleanup();
      try { ws.close(); } catch {}
      reject(new Error('Could not reach the ingest server'));
    }, CONNECT_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
    }
    function onOpen() {
      cleanup();
      resolve(ws);
    }
    function onError() {
      cleanup();
      reject(new Error('Could not reach the ingest server'));
    }

    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
  });
}

export async function startBroadcast({ stream, slot = 'cam1' }) {
  if (active) {
    throw new Error('Broadcast is already active');
  }
  if (!stream) {
    throw new Error('No camera or screen share active');
  }

  // Connect before recording so a bad ingest URL fails fast with a
  // useful message instead of silently dropping every chunk.
  const ws = await openSocket(slot);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  });

  recorderRef = recorder;
  wsRef = ws;
  streamRef = stream;
  slotRef = slot;
  active = true;
  notify();

  recorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_SOCKET_BACKLOG) return; // let it catch up

    e.data
      .arrayBuffer()
      .then((buf) => {
        if (ws.readyState === WebSocket.OPEN && buf.byteLength > 0) {
          ws.send(buf);
        }
      })
      .catch(() => {});
  };

  recorder.onerror = () => {
    active = false;
    notify();
  };

  // A socket that dies mid-broadcast (network drop, server restart)
  // must not leave the recorder running and pretending to be live.
  ws.addEventListener('close', () => {
    if (wsRef !== ws) return; // we closed it deliberately in stopBroadcast
    wsRef = null;
    active = false;
    notify();
    const rec = recorderRef;
    recorderRef = null;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch {}
    }
  });

  recorder.start(1000);
  return recorder;
}

export function stopBroadcast() {
  const recorder = recorderRef;
  const ws = wsRef;

  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch {}
  }

  if (ws) {
    wsRef = null;
    // Give the recorder's final chunk a moment to reach the socket
    // before closing it, so FFmpeg sees a clean end of stream and can
    // flush its last HLS segment.
    setTimeout(() => {
      try { ws.close(1000, 'broadcast ended'); } catch {}
    }, 250);
  }

  if (streamRef) {
    try { streamRef.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef = null;
  }

  recorderRef = null;
  slotRef = null;
  active = false;
  notify();
}
