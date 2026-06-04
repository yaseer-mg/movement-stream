// src/routes/auth.routes.js
// ============================================================
// Authentication routes:
//   POST /api/auth/register      → create viewer account
//   POST /api/auth/login         → get access + refresh token
//   POST /api/auth/refresh       → get new access token
//   POST /api/auth/logout        → revoke refresh token
//   GET  /api/auth/me            → get current user profile
//   POST /api/auth/create-staff  → super_admin creates staff accounts
// ============================================================

const crypto = require('node:crypto');

const { Router } = require('express');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const { query, queryOne }         = require('../db/pool');
const { env }                     = require('../config/env');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { AppError }                = require('../middleware/error-handler');

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'auth',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Calculates refresh token expiry date (7 days from now)
function refreshExpiryDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────
// POST /api/auth/register
// Public — creates a viewer account.
// ─────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password || !display_name) {
      throw new AppError('email, password and display_name are required', 400, 'VALIDATION_ERROR');
    }
    if (!isValidEmail(email)) {
      throw new AppError('Invalid email format', 400, 'VALIDATION_ERROR');
    }
    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    }

    const existing = await queryOne(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing) {
      throw new AppError('An account with that email already exists', 409, 'CONFLICT');
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [newUser] = await query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'viewer')
       RETURNING *`,
      [email.toLowerCase(), password_hash, display_name.trim()]
    );

    const accessToken  = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [newUser.id, hashToken(refreshToken), refreshExpiryDate()]
    );

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [newUser.id]);

    console.log(`✅ New user registered: ${newUser.email}`);

    res.status(201).json({
      success: true,
      data:    { user: sanitizeUser(newUser), accessToken, refreshToken },
      message: 'Account created successfully',
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('email and password are required', 400, 'VALIDATION_ERROR');
    }

    const user = await queryOne(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Same error for wrong email OR wrong password (security best practice)
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      throw new AppError('This account has been deactivated', 403, 'ACCOUNT_DISABLED');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Single session — delete old refresh tokens for this user
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(refreshToken), refreshExpiryDate()]
    );

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    console.log(`✅ User logged in: ${user.email} (${user.role})`);

    res.json({
      success: true,
      data:    { user: sanitizeUser(user), accessToken, refreshToken },
      message: 'Login successful',
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────
// POST /api/auth/refresh
// Send refreshToken → get new accessToken
// ─────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('refreshToken is required', 400, 'VALIDATION_ERROR');
    }

    // Verify JWT signature
    let payload;
    try {
      payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_TOKEN');
    }

    // Check it exists in DB and hasn't expired
    const stored = await queryOne(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()`,
      [hashToken(refreshToken), payload.userId]
    );

    if (!stored) {
      throw new AppError('Refresh token has been revoked or expired', 401, 'INVALID_TOKEN');
    }

    const user = await queryOne(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [payload.userId]
    );

    if (!user) {
      throw new AppError('User not found or deactivated', 401, 'UNAUTHORIZED');
    }

    const newAccessToken = generateAccessToken(user);

    res.json({
      success: true,
      data:    { accessToken: newAccessToken },
      message: 'Token refreshed',
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────
// POST /api/auth/logout
// Revokes refresh token permanently
// ─────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('refreshToken is required', 400, 'VALIDATION_ERROR');
    }

    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);

    res.json({
      success: true,
      data:    null,
      message: 'Logged out successfully',
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────
// GET /api/auth/me
// Returns current user profile (requires login)
// ─────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await queryOne(
      `SELECT id, email, display_name, role, avatar_url,
              is_active, last_login_at, created_at
       FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data:    { user },
    });

  } catch (err) { next(err); }
});

// ─────────────────────────────────────────
// POST /api/auth/create-staff
// Super admin only — creates admin or camera_op accounts
// ─────────────────────────────────────────
router.post('/create-staff', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, password, display_name, role } = req.body;

    if (!email || !password || !display_name || !role) {
      throw new AppError('email, password, display_name and role are required', 400, 'VALIDATION_ERROR');
    }

    const staffRoles = ['admin', 'camera_op', 'super_admin'];
    if (!staffRoles.includes(role)) {
      throw new AppError(`role must be one of: ${staffRoles.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    if (!isValidEmail(email)) {
      throw new AppError('Invalid email format', 400, 'VALIDATION_ERROR');
    }

    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    }

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) {
      throw new AppError('An account with that email already exists', 409, 'CONFLICT');
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [newUser] = await query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, role, created_at`,
      [email.toLowerCase(), password_hash, display_name.trim(), role]
    );

    console.log(`✅ Staff created: ${newUser.email} (${newUser.role}) by ${req.user.email}`);

    res.status(201).json({
      success: true,
      data:    { user: newUser },
      message: `${role} account created successfully`,
    });

  } catch (err) { next(err); }
});

module.exports = router;
