// src/routes/restream.js
// ============================================================
// Restream targets — social platforms the live feed is pushed
// out to via RTMP when the stream goes live.
//
// Admin (admin + super_admin) can manage targets.
// The media server fetches enabled targets (WITH stream keys)
// via the internal, x-media-secret-protected endpoints and
// reports per-target runtime status back here.
//
// SECURITY: stream_key is write-only. Admin responses expose
// only whether a key is set + the last 4 characters.
// ============================================================

const { Router } = require('express');
const { query, queryOne } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/error-handler');
const { env } = require('../config/env');

const router = Router();

const VALID_PLATFORMS = ['youtube', 'facebook', 'instagram', 'custom'];

// In-memory runtime snapshot pushed by the media server:
//   targetId → { status: 'starting'|'running'|'error'|'stopped', startedAt, lastError }
const runtimeStatus = new Map();

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function maskKey(streamKey) {
  if (!streamKey) return '';
  return streamKey.length <= 4 ? '****' : `****${streamKey.slice(-4)}`;
}

function toPublicTarget(row) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    ingest_url: row.ingest_url,
    enabled: row.enabled,
    has_key: Boolean(row.stream_key),
    key_hint: maskKey(row.stream_key),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateTarget(body) {
  const { name, platform, ingest_url, stream_key, enabled } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('name is required', 400, 'VALIDATION_ERROR');
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    throw new AppError(`platform must be one of: ${VALID_PLATFORMS.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (!ingest_url || !/^rtmps?:\/\//i.test(ingest_url)) {
    throw new AppError('ingest_url must be an rtmp:// or rtmps:// URL', 400, 'VALIDATION_ERROR');
  }
  if (stream_key !== undefined && (!stream_key || typeof stream_key !== 'string')) {
    throw new AppError('stream_key must be a non-empty string', 400, 'VALIDATION_ERROR');
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new AppError('enabled must be a boolean', 400, 'VALIDATION_ERROR');
  }
}

function requireInternal(req, res, next) {
  if (req.headers['x-media-secret'] !== env.mediaServer.secret) {
    return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
  }
  next();
}

// ─────────────────────────────────────────
// GET /api/restream/targets
// Admin — list configured targets (no stream keys).
// ─────────────────────────────────────────
router.get('/targets', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const rows = await query('SELECT * FROM restream_targets ORDER BY created_at');
    res.json({ success: true, data: { targets: rows.map(toPublicTarget) } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/restream/targets
// Admin — add a target.
// ─────────────────────────────────────────
router.post('/targets', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    validateTarget(req.body);
    const { name, platform, ingest_url, stream_key, enabled } = req.body;

    const [row] = await query(
      `INSERT INTO restream_targets (name, platform, ingest_url, stream_key, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name.trim(), platform, ingest_url.trim(), stream_key, enabled ?? true, req.user.userId]
    );

    res.status(201).json({ success: true, data: { target: toPublicTarget(row) } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// PATCH /api/restream/targets/:id
// Admin — update a target. Omitting stream_key keeps the old
// one; passing it overwrites.
// ─────────────────────────────────────────
router.patch('/targets/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    validateTarget({ ...req.body, stream_key: req.body.stream_key === '' ? undefined : req.body.stream_key });

    const existing = await queryOne('SELECT * FROM restream_targets WHERE id = $1', [req.params.id]);
    if (!existing) {
      throw new AppError('Restream target not found', 404, 'NOT_FOUND');
    }

    const name = req.body.name?.trim() ?? existing.name;
    const platform = req.body.platform ?? existing.platform;
    const ingestUrl = req.body.ingest_url?.trim() ?? existing.ingest_url;
    const streamKey = req.body.stream_key ?? existing.stream_key;
    const enabled = req.body.enabled ?? existing.enabled;

    const [row] = await query(
      `UPDATE restream_targets SET
         name = $1, platform = $2, ingest_url = $3, stream_key = $4, enabled = $5, updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [name, platform, ingestUrl, streamKey, enabled, req.params.id]
    );

    res.json({ success: true, data: { target: toPublicTarget(row) } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// DELETE /api/restream/targets/:id
// Admin — remove a target.
// ─────────────────────────────────────────
router.delete('/targets/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await query('DELETE FROM restream_targets WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.length === 0) {
      throw new AppError('Restream target not found', 404, 'NOT_FOUND');
    }
    runtimeStatus.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/restream/targets/internal
// Internal (x-media-secret) — enabled targets WITH stream
// keys, fetched by the media server when the stream starts.
// ─────────────────────────────────────────
router.get('/targets/internal', requireInternal, async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, name, platform, ingest_url, stream_key FROM restream_targets WHERE enabled = true ORDER BY created_at`
    );
    res.json({ success: true, data: { targets: rows } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/restream/status
// Internal (x-media-secret) — media server reports the live
// per-target push state. Stored in memory for admin queries.
// ─────────────────────────────────────────
router.post('/status', requireInternal, (req, res, next) => {
  try {
    const { targets } = req.body;
    if (!Array.isArray(targets)) {
      throw new AppError('targets must be an array', 400, 'VALIDATION_ERROR');
    }

    runtimeStatus.clear();
    for (const t of targets) {
      if (t && t.targetId) {
        runtimeStatus.set(t.targetId, {
          status: t.status || 'unknown',
          startedAt: t.startedAt || null,
          lastError: t.lastError || null,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/restream/status
// Admin — configured targets merged with live push state.
// ─────────────────────────────────────────
router.get('/status', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const rows = await query('SELECT * FROM restream_targets ORDER BY created_at');

    res.json({
      success: true,
      data: {
        targets: rows.map((row) => ({
          ...toPublicTarget(row),
          runtime: runtimeStatus.get(row.id) || { status: 'stopped', startedAt: null, lastError: null },
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;