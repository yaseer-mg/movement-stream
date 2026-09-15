const VALID_SLOTS = ['cam1', 'cam2', 'cam3'];

const activeConnections = new Map();

function isValidSlot(slot) {
  return VALID_SLOTS.includes(slot);
}

function get(slot) {
  return activeConnections.get(slot);
}

function set(slot, connection) {
  activeConnections.set(slot, connection);
  return connection;
}

function remove(slot) {
  return activeConnections.delete(slot);
}

function has(slot) {
  return activeConnections.has(slot);
}

function keys() {
  return activeConnections.keys();
}

function list() {
  const out = [];
  for (const [slot, conn] of activeConnections) {
    out.push({
      slot,
      protocol: conn.protocol || 'unknown',
      connectedAt: conn.connectedAt,
      bytesReceived: conn.bytesReceived || 0,
    });
  }
  return out;
}

module.exports = { VALID_SLOTS, isValidSlot, activeConnections, get, set, remove, has, keys, list };