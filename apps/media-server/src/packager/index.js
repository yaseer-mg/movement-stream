const { Router } = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');

const router = Router();

// ─────────────────────────────────────────
// Quality levels that match the transcoder presets.
// Each entry maps a quality name to its bitrate
// so the master playlist can list them correctly.
// ─────────────────────────────────────────
const QUALITY_LEVELS = [
  { name: '1080p', bandwidth: 4000000, resolution: '1920x1080' },
  { name: '720p',  bandwidth: 2000000, resolution: '1280x720' },
  { name: '480p',  bandwidth: 1000000, resolution: '854x480' },
  { name: '240p',  bandwidth: 400000,  resolution: '426x240' },
];

// ─────────────────────────────────────────
// generateMasterPlaylist()
// Writes /var/hls/master.m3u8 — the master
// playlist that HLS.js loads first.
//
// This file lists all available quality levels
// and tells the player where to find each one.
// ─────────────────────────────────────────
function generateMasterPlaylist() {
  const hlsBase = config.hls.outputPath;
  const masterPath = path.join(hlsBase, 'master.m3u8');

  let content = '#EXTM3U\n';
  content += '#EXT-X-VERSION:3\n\n';

  for (const level of QUALITY_LEVELS) {
    const playlistPath = `${level.name}/stream.m3u8`;
    const width = level.resolution.split('x')[0];
    const height = level.resolution.split('x')[1];

    content += `#EXT-X-STREAM-INF:BANDWIDTH=${level.bandwidth},RESOLUTION=${width}x${height},NAME="${level.name}"\n`;
    content += `${playlistPath}\n\n`;
  }

  fs.mkdirSync(hlsBase, { recursive: true });
  fs.writeFileSync(masterPath, content, 'utf-8');
  console.log(`Master playlist written → ${masterPath}`);

  return masterPath;
}

// ─────────────────────────────────────────
// cleanupHlsDirectory()
// Removes all HLS files (segments + playlists).
// Called when stream ends to prepare for next stream.
// ─────────────────────────────────────────
function cleanupHlsDirectory() {
  const hlsBase = config.hls.outputPath;

  if (!fs.existsSync(hlsBase)) return;

  const entries = fs.readdirSync(hlsBase, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(hlsBase, entry.name);

    if (entry.isDirectory()) {
      // Delete all files inside quality directories
      const files = fs.readdirSync(fullPath);
      for (const file of files) {
        fs.unlinkSync(path.join(fullPath, file));
      }
    } else {
      // Delete files in root (master.m3u8, etc.)
      fs.unlinkSync(fullPath);
    }
  }

  console.log('HLS directory cleaned up');
}

// ─────────────────────────────────────────
// getHlsStatus()
// Returns which quality playlists exist and
// how many segments each has.
// ─────────────────────────────────────────
function getHlsStatus() {
  const hlsBase = config.hls.outputPath;
  const status = { masterExists: false, qualities: [] };

  const masterPath = path.join(hlsBase, 'master.m3u8');
  status.masterExists = fs.existsSync(masterPath);

  for (const level of QUALITY_LEVELS) {
    const dir = path.join(hlsBase, level.name);
    const playlistPath = path.join(dir, 'stream.m3u8');

    let segmentCount = 0;
    let playlistExists = false;

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      segmentCount = files.filter((f) => f.endsWith('.ts')).length;
      playlistExists = files.includes('stream.m3u8');
    }

    status.qualities.push({
      name: level.name,
      playlistExists,
      segmentCount,
    });
  }

  return status;
}

// ─────────────────────────────────────────
// GET /packager/health
// ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'packager',
    status: 'ok',
    hls: getHlsStatus(),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// POST /packager/generate-master
// Internal — generates the master.m3u8 playlist.
// Called after transcoding starts.
// ─────────────────────────────────────────
router.post('/generate-master', (_req, res) => {
  try {
    const masterPath = generateMasterPlaylist();
    res.json({ success: true, data: { path: masterPath } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// POST /packager/cleanup
// Internal — cleans up HLS files.
// Called when stream ends.
// ─────────────────────────────────────────
router.post('/cleanup', (_req, res) => {
  try {
    cleanupHlsDirectory();
    res.json({ success: true, message: 'HLS directory cleaned up' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /packager/status
// Internal — returns current HLS status.
// ─────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({ success: true, data: getHlsStatus() });
});

module.exports = router;
module.exports.generateMasterPlaylist = generateMasterPlaylist;
module.exports.cleanupHlsDirectory = cleanupHlsDirectory;
