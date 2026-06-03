const express = require('express');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'events',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
