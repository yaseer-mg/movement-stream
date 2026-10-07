const { Router } = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { config, HLS_RENDITION_NAMES } = require('../config');

const router = Router();

// ─────────────────────────────────────────
// Quality levels that match the transcoder presets.
// ─────────────────────────────────────────
const QUALITY_LEVELS = [
  { name: '1080p', bandwidth: 4000000, resolution: '1920x1080' },
  { name: '720p',  bandwidth: 2000000, resolution: '1280x720' },
  { name: '480p',  bandwidth: 1000000, resolution: '854x480' },
  { name: '240p',  bandwidth: 400000,  resolution: '426x240' },
];

function activeLevels() {
  const enabled = Array.isArray(config.hls?.renditions) ? config.hls.renditions : HLS_RENDITION_NAMES;
  return QUALITY_LEVELS.filter((level) => enabled.includes(level.name));
}

// ─────────────────────────────────────────
// generateMasterPlaylist(activeSlot = 'cam1')
// Writes /var/hls/master.m3u8 pointing at the active
// camera slot's quality playlists. On camera switch the
// mixer calls this with the new active slot so the live
// master always refers to the "program" feed.
// ─────────────────────────────────────────
function generateMasterPlaylist(activeSlot = 'cam1') {
  const hlsBase = config.hls.outputPath;
  const masterPath = path.join(hlsBase, 'master.m3u8');

  let content = '#EXTM3U\n';
  content += '#EXT-X-VERSION:3\n\n';

  for (const level of activeLevels()) {
    const playlistPath = `${activeSlot}/${level.name}/stream.m3u8`;
    const width = level.resolution.split('x')[0];
    const height = level.resolution.split('x')[1];

    content += `#EXT-X-STREAM-INF:BANDWIDTH=${level.bandwidth},RESOLUTION=${width}x${height},NAME="${level.name}"\n`;
    content += `${playlistPath}\n\n`;
  }

  fs.mkdirSync(hlsBase, { recursive: true });
  fs.writeFileSync(masterPath, content, 'utf-8');
  console.log(
    `Master playlist written → ${masterPath} (active: ${activeSlot}, levels: ${activeLevels().map((l) => l.name).join(', ')})`
  );

  return masterPath;
}

// ─────────────────────────────────────────
// cleanupHlsDirectory()
// Removes all HLS files (segments + playlists).
// ─────────────────────────────────────────
function cleanupHlsDirectory() {
  const hlsBase = config.hls.outputPath;
  if (!fs.existsSync(hlsBase)) return;

  const entries = fs.readdirSync(hlsBase, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(hlsBase, entry.name);
    if (entry.isDirectory()) {
      const files = fs.readdirSync(fullPath);
      for (const file of files) {
        const subEntries = fs.readdirSync(path.join(fullPath, file), { withFileTypes: true });
        for (const sub of subEntries) {
          const subPath = path.join(fullPath, file, sub.name);
          if (sub.isDirectory()) {
            const inner = fs.readdirSync(subPath);
            for (const f of inner) { try { fs.unlinkSync(path.join(subPath, f)); } catch {} }
            try { fs.rmdirSync(subPath); } catch {}
          } else {
            try { fs.unlinkSync(subPath); } catch {}
          }
        }
        try { fs.rmdirSync(path.join(fullPath, file)); } catch {}
      }
    } else {
      try { fs.unlinkSync(fullPath); } catch {}
    }
  }

  console.log('[Packager] HLS directory cleaned up');
}

// ─────────────────────────────────────────
// getHlsStatus(activeSlot = 'cam1')
// Returns which active-rendition playlists exist and how
// many segments each has for the active slot.
// ─────────────────────────────────────────
function getHlsStatus(activeSlot = 'cam1') {
  const hlsBase = config.hls.outputPath;
  const status = { activeSlot, masterExists: false, qualities: [] };

  const masterPath = path.join(hlsBase, 'master.m3u8');
  status.masterExists = fs.existsSync(masterPath);

  for (const level of activeLevels()) {
    const dir = path.join(hlsBase, activeSlot, level.name);
    const playlistPath = path.join(dir, 'stream.m3u8');

    let segmentCount = 0;
    let playlistExists = false;

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      segmentCount = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.ts.tmp')).length;
      playlistExists = files.includes('stream.m3u8');
    }

    status.qualities.push({ name: level.name, playlistExists, segmentCount });
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
// GET /packager/status
// ─────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({ success: true, data: getHlsStatus() });
});

module.exports = router;
module.exports.generateMasterPlaylist = generateMasterPlaylist;
module.exports.cleanupHlsDirectory = cleanupHlsDirectory;
module.exports.getHlsStatus = getHlsStatus;