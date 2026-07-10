const { Router } = require('express');
const { query, queryOne } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/error-handler');
const { broadcast } = require('../websocket/index');

const router = Router();

// In-memory rate limiter: userId → last message timestamp
const rateLimiter = new Map();
const RATE_LIMIT_MS = 2000; // 1 message per 2 seconds

// ─────────────────────────────────────────
// GET /api/chat/:streamId
// Public — fetch chat history for a stream session.
// Only non-deleted messages. Last 100 messages, oldest first.
// ─────────────────────────────────────────
router.get('/:streamId', async (req, res, next) => {
  try {
    const messages = await query(
      `SELECT id, stream_id, user_id, display_name, message, created_at
       FROM chat_messages
       WHERE stream_id = $1 AND is_deleted = false
       ORDER BY created_at ASC
       LIMIT 100`,
      [req.params.streamId]
    );

    res.json({ success: true, data: { messages } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/chat
// Authenticated — send a chat message.
// Validates: stream live, chat enabled, message length, rate limit.
// ─────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, stream_id } = req.body;

    if (!message || !stream_id) {
      throw new AppError('message and stream_id are required', 400, 'VALIDATION_ERROR');
    }

    if (message.trim().length < 1 || message.trim().length > 500) {
      throw new AppError('Message must be between 1 and 500 characters', 400, 'VALIDATION_ERROR');
    }

    // Check stream is live
    const stream = await queryOne('SELECT is_live, chat_enabled FROM stream_status WHERE id = $1', [stream_id]);
    if (!stream) {
      throw new AppError('Stream not found', 404, 'NOT_FOUND');
    }
    if (!stream.is_live) {
      throw new AppError('Stream is not currently live', 400, 'STREAM_NOT_LIVE');
    }
    if (!stream.chat_enabled) {
      throw new AppError('Chat is currently disabled', 403, 'CHAT_DISABLED');
    }

    // Rate limit: max 1 message per 2 seconds per user
    const lastMessage = rateLimiter.get(req.user.userId);
    if (lastMessage && Date.now() - lastMessage < RATE_LIMIT_MS) {
      throw new AppError('You are sending messages too fast. Please wait a moment.', 429, 'RATE_LIMITED');
    }
    rateLimiter.set(req.user.userId, Date.now());

    // Get user's display_name
    const user = await queryOne('SELECT display_name FROM users WHERE id = $1', [req.user.userId]);

    const [newMessage] = await query(
      `INSERT INTO chat_messages (stream_id, user_id, display_name, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, stream_id, user_id, display_name, message, created_at`,
      [stream_id, req.user.userId, user.display_name, message.trim()]
    );

    // Broadcast to all connected clients
    broadcast({
      type: 'chat.message',
      data: newMessage,
    });

    res.status(201).json({ success: true, data: { message: newMessage } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// DELETE /api/chat/:messageId
// Admin — soft delete a message (moderation).
// ─────────────────────────────────────────
router.delete('/:messageId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const existing = await queryOne(
      'SELECT id FROM chat_messages WHERE id = $1',
      [req.params.messageId]
    );

    if (!existing) {
      throw new AppError('Message not found', 404, 'NOT_FOUND');
    }

    await query(
      `UPDATE chat_messages SET
         is_deleted = true,
         deleted_by = $1,
         deleted_at = now()
       WHERE id = $2`,
      [req.user.userId, req.params.messageId]
    );

    broadcast({
      type: 'chat.message_deleted',
      data: { message_id: req.params.messageId },
    });

    res.json({ success: true, data: null, message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
