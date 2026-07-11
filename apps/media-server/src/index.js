const express = require('express');
const http = require('node:http');

const { config } = require('./config');
const whipRouter = require('./whip');
const mixerRouter = require('./mixer');
const transcoderRouter = require('./transcoder');
const packagerRouter = require('./packager');
const recorderRouter = require('./recorder');
const webhooksRouter = require('./webhooks');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────
// Internal auth middleware
// The api-server uses this header when calling
// the media-server internally.
// ─────────────────────────────────────────
function requireInternalAuth(req, res, next) {
  const secret = req.headers['x-media-secret'];
  if (secret !== config.apiServer.secret) {
    return res.status(401).json({ success: false, error: 'Invalid media server secret' });
  }
  next();
}

// ─────────────────────────────────────────
// Health check
// ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// Internal routes (called by api-server only)
// Protected by x-media-secret header
// ─────────────────────────────────────────
app.use('/internal', requireInternalAuth, mixerRouter);

// ─────────────────────────────────────────
// Public routes (called by broadcaster browsers)
// ─────────────────────────────────────────
app.use('/whip', whipRouter);
app.use('/transcoder', transcoderRouter);
app.use('/packager', packagerRouter);
app.use('/recorder', recorderRouter);
app.use('/webhooks', webhooksRouter);

// ─────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Media server error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    error: config.isDev ? err.message : 'Internal server error',
  });
});

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`Media server listening on http://localhost:${config.port}`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
