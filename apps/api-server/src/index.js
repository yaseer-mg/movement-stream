const cors = require('cors');
const express = require('express');
const http = require('node:http');

const { env } = require('./config/env');
const { closePool } = require('./db/pool');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const streamRoutes = require('./routes/stream');
const chatRoutes = require('./routes/chat');
const recordingRoutes = require('./routes/recordings');
const { initWebSocket } = require('./websocket');
const { startScheduler, stopScheduler } = require('./services/scheduler.service');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/recordings', recordingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
const wss = initWebSocket(server);

server.on('error', (error) => {
  console.error('API server failed to start:', error.message);
  process.exit(1);
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error.message);
  process.exit(1);
});

server.listen(env.port, env.host, () => {
  console.log(`API server listening on http://${env.host}:${env.port}`);
});

startScheduler();

async function shutdown() {
  server.close();
  wss.close();
  stopScheduler();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
