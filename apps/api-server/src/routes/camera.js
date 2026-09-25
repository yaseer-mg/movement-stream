// src/routes/camera.js
// ============================================================
// Camera operator routes — protected by requireCameraAccess
// (super_admin, admin, and camera_op roles).
//
// Camera operators control the slot they are assigned to
// (cameras.operator_id, falling back to the camN@ email
// convention for seeded dev accounts). Admins can control
// any slot.
// ============================================================

const { Router } = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireCameraAccess } = require('../middleware/auth');
const { AppError } = require('../middleware/error-handler');
const { broadcast } = require('../websocket');

const router = Router();

const VALID_SLOTS = ['cam1', 'cam2', 'cam3'];

// ─────────────────────────────────────────
// getControllableSlots(user)
// Returns the slots the requester may control:
//   - admins / super_admins → all slots
//   - camera ops → slots linked via cameras.operator_id,
//     falling back to the camN@movement.ng email convention
// ─────────────────────────────────────────
async function getControllableSlots(user) {
  if (user.role === 'super_admin' || user.role === 'admin') {
    return [...VALID_SLOTS];
  }

  const linked = await query('SELECT slot FROM cameras WHERE operator_id = $1', [user.userId]);
  const slots = linked.map((r) => r.slot).filter((s) => VALID_SLOTS.includes(s));

  if (slots.length > 0) {
    return slots;
  }

  const match = /^cam(\d)@/i.exec(user.email || '');
  const slot = match ? `cam${match[1]}` : null;
  return slot && VALID_SLOTS.includes(slot) ? [slot] : [];
}

// ─────────────────────────────────────────
// GET /api/camera/slots
// Lists every camera slot with its current state and
// which of them the requester is allowed to control.
// ─────────────────────────────────────────
router.get('/slots', requireAuth, requireCameraAccess, async (req, res, next) => {
  try {
    const cameras = await query(
      `SELECT c.slot, c.label, c.operator_id,
              c.is_connected, c.last_seen_at
       FROM cameras c
       ORDER BY c.slot`
    );

    const active = await query(
      'SELECT active_camera, is_live FROM stream_status LIMIT 1'
    );

    const controllable = await getControllableSlots(req.user);

    res.json({
      success: true,
      data: {
        cameras: cameras.map((c) => ({
          slot: c.slot,
          label: c.label,
          is_connected: c.is_connected,
          last_seen_at: c.last_seen_at,
          is_active: active[0]?.active_camera === c.slot,
          is_live: active[0]?.is_live === true,
        })),
        controllable,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/camera/:slot/connect
// Camera op marks their camera online. Admins may do this
// for any slot. Sets cameras.is_connected and broadcasts
// camera.connected to all clients.
// ─────────────────────────────────────────
router.post('/:slot/connect', requireAuth, requireCameraAccess, async (req, res, next) => {
  try {
    const { slot } = req.params;
    validateSlot(slot);

    const controllable = await getControllableSlots(req.user);
    if (!controllable.includes(slot)) {
      throw new AppError('You do not control this camera slot', 403, 'FORBIDDEN');
    }

    await query(
      `UPDATE cameras SET is_connected = true, last_seen_at = now(), updated_at = now() WHERE slot = $1`,
      [slot]
    );

    broadcast({ type: 'camera.connected', data: { slot } });
    console.log(`Camera ${slot} connected by ${req.user.email} (${req.user.role})`);

    res.json({ success: true, data: { slot, is_connected: true } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/camera/:slot/disconnect
// Camera op (or admin) marks their camera offline.
// ─────────────────────────────────────────
router.post('/:slot/disconnect', requireAuth, requireCameraAccess, async (req, res, next) => {
  try {
    const { slot } = req.params;
    validateSlot(slot);

    const controllable = await getControllableSlots(req.user);
    if (!controllable.includes(slot)) {
      throw new AppError('You do not control this camera slot', 403, 'FORBIDDEN');
    }

    await query(
      `UPDATE cameras SET is_connected = false, updated_at = now() WHERE slot = $1`,
      [slot]
    );

    broadcast({ type: 'camera.disconnected', data: { slot } });
    console.log(`Camera ${slot} disconnected by ${req.user.email} (${req.user.role})`);

    res.json({ success: true, data: { slot, is_connected: false } });
  } catch (err) {
    next(err);
  }
});

function validateSlot(slot) {
  if (!VALID_SLOTS.includes(slot)) {
    throw new AppError(`slot must be one of: ${VALID_SLOTS.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
}

module.exports = router;