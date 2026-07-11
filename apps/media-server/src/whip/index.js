const { Router } = require('express');

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'whip',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
