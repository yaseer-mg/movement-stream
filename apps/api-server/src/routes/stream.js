const { Router } = require('express');
const { query, queryOne } = require('../db/pool');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/error-handler');
const { broadcast } = require('../websocket/index');
const { env } = require('../config/env');
const socialService = require('../services/social.service');

const router = Router();

// ─────────────────────────────────────────
// GET /api/stream/status
// Public — returns current stream state.
// IMPORTANT: never includes stream_key.
// ─────────────────────────────────────────
router.get('/status', async (_req, res, next) => {
  try {
    const status = await queryOne(
      `SELECT id, is_live, title, description, event_id,
              active_camera, chat_enabled, viewer_count, peak_viewers,
              started_at, ended_at
       FROM stream_status
       LIMIT 1`
    );

    res.json({ success: true, data: { status } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/stream/start
// Super admin — go live.
// ─────────────────────────────────────────
router.post('/start', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { title, description, event_id } = req.body;

    if (!title) {
      throw new AppError('title is required', 400, 'VALIDATION_ERROR');
    }

    // Check not already live
    const current = await queryOne('SELECT is_live FROM stream_status LIMIT 1');
    if (current && current.is_live) {
      throw new AppError('Stream is already live', 409, 'ALREADY_LIVE');
    }

    // Update stream_status
    const [status] = await query(
      `UPDATE stream_status SET
         is_live = true,
         title = $1,
         description = $2,
         event_id = $3,
         started_at = now(),
         ended_at = NULL,
         viewer_count = 0,
         peak_viewers = 0,
         updated_at = now()
       RETURNING id, is_live, title, description, event_id, started_at`,
      [title, description || null, event_id || null]
    );

    // If linked to an event, mark that event as live
    if (event_id) {
      await query(
        "UPDATE events SET status = 'live', updated_at = now() WHERE id = $1",
        [event_id]
      );
    }

    // Broadcast to all connected WebSocket clients
    broadcast({
      type: 'stream.live',
      data: { title, description, started_at: status.started_at },
    });

    // Tell media server to start transcoding all connected cameras
    try {
      await fetch(`${env.mediaServer.url}/internal/mixer/start-all`, {
        method: 'POST',
        headers: { 'x-media-secret': env.mediaServer.secret },
      });
    } catch {
      console.log('Could not reach media server for start-all');
    }

    // Fire social media post (fire-and-forget — never await,
    // never let a social API failure fail the stream start)
    const streamUrl = `${env.social.streamPublicUrl}/watch`;
    socialService
      .notifyStreamStart(title, streamUrl)
      .catch((err) => console.log('Social notify failed:', err.message));

    res.json({ success: true, data: { status } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/stream/end
// Super admin — end the live stream.
// ─────────────────────────────────────────
router.post('/end', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const current = await queryOne('SELECT * FROM stream_status LIMIT 1');

    if (!current || !current.is_live) {
      throw new AppError('Stream is not currently live', 400, 'NOT_LIVE');
    }

    const [status] = await query(
      `UPDATE stream_status SET
         is_live = false,
         ended_at = now(),
         updated_at = now()
       RETURNING id, ended_at`
    );

    // If linked to an event, mark that event as ended
    if (current.event_id) {
      await query(
        "UPDATE events SET status = 'ended', updated_at = now() WHERE id = $1",
        [current.event_id]
      );
    }

    // Broadcast to all connected clients
    broadcast({
      type: 'stream.ended',
      data: { ended_at: status.ended_at },
    });

    // Tell media server to start recording (merge segments + upload to S3)
    // This must happen BEFORE cleanup, since it needs the .ts segments
    try {
      await fetch(`${env.mediaServer.url}/recorder/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-media-secret': env.mediaServer.secret,
        },
        body: JSON.stringify({
          streamId: status.id,
          eventId: current.event_id,
          streamTitle: current.title,
        }),
      });
    } catch {
      console.log('Could not reach media server for recording');
    }

    // Tell media server to stop all transcoding (AFTER recording started)
    try {
      await fetch(`${env.mediaServer.url}/internal/mixer/stop-all`, {
        method: 'POST',
        headers: { 'x-media-secret': env.mediaServer.secret },
      });
    } catch {
      console.log('Could not reach media server for stop-all');
    }

    // Fire social media post with the public recordings page link
    // (fire-and-forget — never await, never fail the request)
    const recordingsUrl = `${env.social.streamPublicUrl}/recordings`;
    socialService
      .notifyStreamEnd(recordingsUrl)
      .catch((err) => console.log('Social notify failed:', err.message));

    res.json({ success: true, data: { status } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// PATCH /api/stream/camera
// Admin — switch the active camera.
// ─────────────────────────────────────────
router.patch('/camera', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { camera } = req.body;
    const validSlots = ['cam1', 'cam2', 'cam3'];

    if (!camera || !validSlots.includes(camera)) {
      throw new AppError(`camera must be one of: ${validSlots.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    // Tell the media server to switch the active camera feed
    try {
      await fetch(`${env.mediaServer.url}/internal/switch-camera`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-media-secret': env.mediaServer.secret,
        },
        body: JSON.stringify({ camera }),
      });
    } catch {
      // Media server might be down — log but don't fail the request
      console.log('Could not reach media server for camera switch');
    }

    await query(
      'UPDATE stream_status SET active_camera = $1, updated_at = now()',
      [camera]
    );

    broadcast({
      type: 'stream.camera_switch',
      data: { active_camera: camera },
    });

    res.json({ success: true, data: { active_camera: camera } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// PATCH /api/stream/chat
// Admin — toggle chat on or off.
// ─────────────────────────────────────────
router.patch('/chat', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      throw new AppError('enabled must be a boolean (true or false)', 400, 'VALIDATION_ERROR');
    }

    await query(
      'UPDATE stream_status SET chat_enabled = $1, updated_at = now()',
      [enabled]
    );

    broadcast({
      type: enabled ? 'stream.chat_enabled' : 'stream.chat_disabled',
      data: {},
    });

    res.json({ success: true, data: { chat_enabled: enabled } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/stream/key
// Super admin — get the secret stream key.
// This is the ONLY endpoint that exposes it.
// ─────────────────────────────────────────
router.get('/key', requireAuth, requireSuperAdmin, async (_req, res, next) => {
  try {
    const row = await queryOne('SELECT stream_key FROM stream_status LIMIT 1');

    res.json({ success: true, data: { stream_key: row.stream_key } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
