const { Router } = require('express');
const { query, queryOne } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/error-handler');

const router = Router();

// ─────────────────────────────────────────
// GET /api/recordings
// Public — list public + ready recordings.
// Admin requests return all recordings.
// ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    // Check if requester is an admin (optional auth)
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const { env } = require('../config/env');
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, env.jwt.accessSecret);
        if (payload.role === 'admin' || payload.role === 'super_admin') {
          isAdmin = true;
        }
      } catch {
        // Invalid token — treat as public viewer
      }
    }

    let sql;
    let params = [];

    if (isAdmin) {
      // Admins see everything
      sql = `
        SELECT r.*, e.title AS event_title
        FROM recordings r
        LEFT JOIN events e ON e.id = r.event_id
        ORDER BY r.recorded_at DESC
      `;
    } else {
      // Public only sees public + ready recordings
      sql = `
        SELECT r.*, e.title AS event_title
        FROM recordings r
        LEFT JOIN events e ON e.id = r.event_id
        WHERE r.is_public = true AND r.processing_status = 'ready'
        ORDER BY r.recorded_at DESC
      `;
    }

    const recordings = await query(sql, params);

    res.json({ success: true, data: { recordings } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/recordings/:id
// Public — single recording.
// Public users can only see public + ready.
// Admins can see all.
// ─────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const { env } = require('../config/env');
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, env.jwt.accessSecret);
        if (payload.role === 'admin' || payload.role === 'super_admin') {
          isAdmin = true;
        }
      } catch {
        // Invalid token — treat as public viewer
      }
    }

    let sql;
    let params = [req.params.id];

    if (isAdmin) {
      sql = `
        SELECT r.*, e.title AS event_title
        FROM recordings r
        LEFT JOIN events e ON e.id = r.event_id
        WHERE r.id = $1
      `;
    } else {
      sql = `
        SELECT r.*, e.title AS event_title
        FROM recordings r
        LEFT JOIN events e ON e.id = r.event_id
        WHERE r.id = $1 AND r.is_public = true AND r.processing_status = 'ready'
      `;
    }

    const recording = await queryOne(sql, params);

    if (!recording) {
      throw new AppError('Recording not found', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: { recording } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// PATCH /api/recordings/:id
// Admin — update recording metadata.
// Updateable: title, description, is_public.
// Cannot change file_url or s3_key.
// ─────────────────────────────────────────
router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT id FROM recordings WHERE id = $1', [req.params.id]);

    if (!existing) {
      throw new AppError('Recording not found', 404, 'NOT_FOUND');
    }

    const { title, description, is_public } = req.body;

    // Build dynamic update — only update provided fields
    const updates = [];
    const params = [];

    if (title !== undefined) {
      params.push(title);
      updates.push(`title = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${params.length}`);
    }
    if (is_public !== undefined) {
      params.push(is_public);
      updates.push(`is_public = $${params.length}`);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    }

    updates.push('updated_at = now()');
    params.push(req.params.id);

    const [recording] = await query(
      `UPDATE recordings SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    res.json({ success: true, data: { recording } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// DELETE /api/recordings/:id
// Admin — delete a recording.
// NOTE: S3 file deletion will be wired up in Step 10.
// For now just delete the DB record.
// ─────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT id FROM recordings WHERE id = $1', [req.params.id]);

    if (!existing) {
      throw new AppError('Recording not found', 404, 'NOT_FOUND');
    }

    await query('DELETE FROM recordings WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: null, message: 'Recording deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
