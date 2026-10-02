import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────
// Shared broadcast socket
//
// Every page that listens for live events (Watch, Studio,
// ChatMod, LiveBanner, …) used to open its own WebSocket.
// That meant:
//   • one browser tab = 2–3 sockets, so the server's viewer
//     count counted sockets, not people
//   • each hook's onclose re-armed setTimeout(connect, 5000),
//     including the one fired by its own unmount cleanup — so
//     leaving a page left a socket reconnecting forever
//
// This module keeps exactly ONE socket per tab, reference
// counted across subscribers, and only reconnects while at
// least one subscriber is still mounted.
// ─────────────────────────────────────────

const RECONNECT_DELAY_MS = 5000;

let socket = null;
let reconnectTimer = null;
let refCount = 0;
let nextId = 1;

const subscribers = new Map(); // id -> { onMessage, onOpen }

function resolveUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const configured = import.meta.env.VITE_WS_URL;
  const base = configured || `${protocol}//localhost:4000`;

  // The server accepts upgrades on any path, but /ws is the
  // documented endpoint — append it when the env var omits it.
  const trimmed = base.replace(/\/+$/, '');
  return /\/ws$/.test(trimmed) ? trimmed : `${trimmed}/ws`;
}

function sendAuth() {
  const token = localStorage.getItem('accessToken');
  if (!token || !socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type: 'auth', data: { token } }));
  } catch {}
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function teardown() {
  clearReconnect();
  if (!socket) return;
  const dying = socket;
  socket = null;
  // Drop the handlers first so the close doesn't schedule a reconnect.
  dying.onopen = dying.onmessage = dying.onclose = dying.onerror = null;
  try { dying.close(); } catch {}
}

function connect() {
  if (socket || refCount === 0) return;

  let ws;
  try {
    ws = new WebSocket(resolveUrl());
  } catch {
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    return;
  }

  socket = ws;

  ws.onopen = () => {
    sendAuth();
    subscribers.forEach(({ onOpen }) => {
      try { onOpen?.(); } catch {}
    });
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    // Copy first: a handler may unsubscribe during dispatch.
    [...subscribers.values()].forEach(({ onMessage }) => {
      try { onMessage(msg); } catch {}
    });
  };

  ws.onclose = () => {
    if (socket === ws) socket = null;
    // Only reconnect while somebody is still listening.
    if (refCount > 0) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  };

  ws.onerror = () => {
    // onclose always follows; let it own the reconnect.
    try { ws.close(); } catch {}
  };
}

/**
 * Subscribe to broadcast events.
 *
 * @param {(msg: object) => void} onMessage called for every server event
 * @param {() => void} [onOpen]           called on connect AND reconnect —
 *                                       the place to re-fetch REST state so
 *                                       nothing is missed while disconnected
 */
export default function useWebSocket(onMessage, onOpen) {
  const messageRef = useRef(onMessage);
  const openRef = useRef(onOpen);
  messageRef.current = onMessage;
  openRef.current = onOpen;

  useEffect(() => {
    const id = nextId++;
    subscribers.set(id, {
      onMessage: (msg) => messageRef.current?.(msg),
      onOpen: () => openRef.current?.(),
    });
    refCount++;
    connect();

    return () => {
      subscribers.delete(id);
      refCount--;
      if (refCount === 0) teardown();
    };
  }, []);
}
