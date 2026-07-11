const { Router } = require('express');

const router = Router();

// Internal route — called by api-server to switch cameras
router.post('/switch-camera', (req, res) => {
  res.json({
    success: true,
    message: 'Camera switch not yet implemented (Step 9)',
    data: req.body,
  });
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'mixer',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
