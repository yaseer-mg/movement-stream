const { WebSocketServer, WebSocket } = require('ws');

const clients = new Set();

function initWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total: ${clients.size}`);

    ws.send(JSON.stringify({
      type: 'connection.ready',
      data: { message: 'Connected to Movement Stream' },
    }));

    ws.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        handleClientMessage(ws, event);
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format' },
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

  console.log('WebSocket server ready');
  return wss;
}

function handleClientMessage(_ws, event) {
  switch (event.type) {
    case 'chat.message':
      break;
    default:
      break;
  }
}

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

function getClientCount() {
  return clients.size;
}

module.exports = { initWebSocket, broadcast, getClientCount };
