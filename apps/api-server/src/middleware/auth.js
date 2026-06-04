// src/middleware/auth.js
// ============================================================
// JWT middleware — verifies access tokens on protected routes.
// Provides role-based guards for admin-only routes.
// ============================================================

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('./error-handler');

// ─────────────────────────────────────────
// requireAuth
// Verifies the JWT in the Authorization header.
// Attaches decoded payload to req.user.
// Use on any route that needs the user to be logged in.
//
// Example:
//   router.get('/dashboard', requireAuth, handler)
// ─────────────────────────────────────────
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];

    const payload = jwt.verify(token, env.jwt.accessSecret);

    req.user = payload; // { userId, role, email } — available in all downstream handlers
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
}

// ─────────────────────────────────────────
// requireRole
// Use AFTER requireAuth. Restricts a route to specific roles.
//
// Example:
//   router.post('/events', requireAuth, requireRole('admin', 'super_admin'), handler)
// ─────────────────────────────────────────
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to do this', 403, 'FORBIDDEN'));
    }

    next();
  };
}

// ─────────────────────────────────────────
// Shorthand guards for common role checks
// ─────────────────────────────────────────

// Only super_admin and admin
const requireAdmin = requireRole('super_admin', 'admin');

// Only super_admin
const requireSuperAdmin = requireRole('super_admin');

// Admins and camera operators
const requireCameraAccess = requireRole('super_admin', 'admin', 'camera_op');

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireCameraAccess,
};
