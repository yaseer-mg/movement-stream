const { Router } = require('express');
const { query, queryOne } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/error-handler');

const router = Router();

// ─────────────────────────────────────────
// GET /api/events
// Public — list all events. Supports ?status= and ?featured=true filters.
// ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, featured } = req.query;

    let sql = `
      SELECT e.*, u.display_name AS created_by_name
      FROM events e
      JOIN users u ON u.id = e.created_by
    `;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }

    if (featured === 'true') {
      conditions.push('e.is_featured = true');
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY e.starts_at ASC';

    const events = await query(sql, params);

    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/events/:id
// Public — single event by ID.
// ─────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const event = await queryOne(
      `SELECT e.*, u.display_name AS created_by_name
       FROM events e
       JOIN users u ON u.id = e.created_by
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (!event) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/events
// Admin — create a new event.
// ─────────────────────────────────────────
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { title, description, location, thumbnail_url, starts_at, ends_at, is_featured } = req.body;

    if (!title || !starts_at) {
      throw new AppError('title and starts_at are required', 400, 'VALIDATION_ERROR');
    }

    const startDate = new Date(starts_at);
    if (isNaN(startDate.getTime())) {
      throw new AppError('starts_at must be a valid date', 400, 'VALIDATION_ERROR');
    }

    if (ends_at) {
      const endDate = new Date(ends_at);
      if (isNaN(endDate.getTime())) {
        throw new AppError('ends_at must be a valid date', 400, 'VALIDATION_ERROR');
      }
    }

    const [event] = await query(
      `INSERT INTO events (title, description, location, thumbnail_url, starts_at, ends_at, is_featured, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        title.trim(),
        description || null,
        location || null,
        thumbnail_url || null,
        startDate.toISOString(),
        ends_at ? new Date(ends_at).toISOString() : null,
        is_featured === true,
        req.user.userId,
      ]
    );

    res.status(201).json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// PUT /api/events/:id
// Admin — update an existing event.
// ─────────────────────────────────────────
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT * FROM events WHERE id = $1', [req.params.id]);

    if (!existing) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    const {
      title = existing.title,
      description = existing.description,
      location = existing.location,
      thumbnail_url = existing.thumbnail_url,
      starts_at = existing.starts_at,
      ends_at = existing.ends_at,
      status = existing.status,
      is_featured = existing.is_featured,
    } = req.body;

    const validStatuses = ['upcoming', 'live', 'ended', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError(`status must be one of: ${validStatuses.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    if (starts_at) {
      const startDate = new Date(starts_at);
      if (isNaN(startDate.getTime())) {
        throw new AppError('starts_at must be a valid date', 400, 'VALIDATION_ERROR');
      }
    }

    const [event] = await query(
      `UPDATE events SET
         title = $1, description = $2, location = $3, thumbnail_url = $4,
         starts_at = $5, ends_at = $6, status = $7, is_featured = $8,
         updated_at = now()
       WHERE id = $9
       RETURNING *`,
      [
        title,
        description,
        location,
        thumbnail_url,
        starts_at,
        ends_at,
        status,
        is_featured,
        req.params.id,
      ]
    );

    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// DELETE /api/events/:id
// Admin — delete an event.
// ─────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const existing = await queryOne('SELECT id FROM events WHERE id = $1', [req.params.id]);

    if (!existing) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    await query('DELETE FROM events WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: null, message: 'Event deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
