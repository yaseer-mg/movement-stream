// src/middleware/errorHandler.js
// ============================================================
// Global error handler — catches any error thrown in routes
// and returns a clean JSON response instead of crashing.
// Must be the LAST middleware registered in index.js.
// ============================================================

// Custom error class — throw this anywhere in your routes
// Example: throw new AppError('User not found', 404)
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.name       = 'AppError';
    this.statusCode = statusCode;
    this.code       = code;
  }
}

// Global error handler — Express knows this is an error handler
// because it has 4 parameters (err, req, res, next)
function errorHandler(err, req, res, next) {
  // Known application error (we threw it intentionally)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error:   err.message,
      code:    err.code,
    });
  }

  // Unknown error — log it and return a generic message
  console.error('❌ Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV !== 'production'
      ? err.message            // show real error in development
      : 'Internal server error', // hide details in production
  });
}

// 404 handler — for routes that don't exist
// Register this BEFORE errorHandler in index.js
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error:   `Route not found: ${req.method} ${req.path}`,
  });
}

module.exports = { AppError, errorHandler, notFoundHandler };
