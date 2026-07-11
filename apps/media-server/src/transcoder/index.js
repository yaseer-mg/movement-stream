const { Router } = require('express');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');

const router = Router();

// ─────────────────────────────────────────
// Quality presets for adaptive bitrate streaming
// Each preset defines resolution, bitrate, and FFmpeg scaling.
// ─────────────────────────────────────────
const QUALITY_PRESETS = [
  { name: '1080p', width: 1920, height: 1080, bitrate: '4000k', maxrate: '4200k', bufsize: '6000k' },
  { name: '720p',  width: 1280, height: 720,  bitrate: '2000k', maxrate: '2100k', bufsize: '3000k' },
  { name: '480p',  width: 854,  height: 480,  bitrate: '1000k', maxrate: '1050k', bufsize: '1500k' },
  { name: '240p',  width: 426,  height: 240,  bitrate: '400k',  maxrate: '420k',  bufsize: '600k' },
];

// ─────────────────────────────────────────
// Active FFmpeg processes: slot → [{ process, quality }]
// Used to kill processes when stream ends or camera switches.
// ─────────────────────────────────────────
const activeProcesses = new Map();

// ─────────────────────────────────────────
// startTranscoding(slot)
// Spawns 4 FFmpeg processes (one per quality level).
// Each reads raw YUV420P video from stdin and outputs HLS segments.
//
// The caller (WHIP endpoint) writes raw video frames to the
// stdin of the returned write stream.
// ─────────────────────────────────────────
function startTranscoding(slot) {
  // Ensure HLS output directories exist
  const hlsBase = config.hls.outputPath;
  for (const preset of QUALITY_PRESETS) {
    const dir = path.join(hlsBase, preset.name);
    fs.mkdirSync(dir, { recursive: true });
  }

  const processes = [];

  for (const preset of QUALITY_PRESETS) {
    const outputDir = path.join(hlsBase, preset.name);
    const segmentPattern = path.join(outputDir, 'stream_%03d.ts');
    const playlistPath = path.join(outputDir, 'stream.m3u8');

    const args = [
      // ─── Input: raw video from stdin ───
      '-f', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      '-s', `${preset.width}x${preset.height}`,
      '-r', '30',                     // 30 fps
      '-i', 'pipe:0',                 // read from stdin

      // ─── Video encoding ───
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-profile:v', 'main',
      '-level', '4.1',
      '-b:v', preset.bitrate,
      '-maxrate', preset.maxrate,
      '-bufsize', preset.bufsize,
      '-g', '60',                     // keyframe every 2 seconds (30fps * 2)
      '-keyint_min', '60',
      '-sc_threshold', '0',

      // ─── Scale to target resolution ───
      '-vf', `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,

      // ─── HLS output ───
      '-f', 'hls',
      '-hls_time', '2',               // 2-second segments
      '-hls_list_size', '10',         // keep last 10 segments (rolling window)
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', segmentPattern,
      playlistPath,
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    // Log FFmpeg errors but don't crash the server
    let stderrOutput = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderrOutput += chunk.toString();
      // Log every 5 seconds to avoid flooding
      if (stderrOutput.length > 1000) {
        console.log(`[${slot}/${preset.name}] ffmpeg: ${stderrOutput.slice(-200)}`);
        stderrOutput = '';
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[${slot}/${preset.name}] FFmpeg failed to start:`, err.message);
    });

    ffmpeg.on('close', (code) => {
      console.log(`[${slot}/${preset.name}] FFmpeg exited with code ${code}`);
    });

    processes.push({ process: ffmpeg, quality: preset.name, stdin: ffmpeg.stdin });
    console.log(`[${slot}/${preset.name}] FFmpeg started → ${playlistPath}`);
  }

  activeProcesses.set(slot, processes);
  return processes;
}

// ─────────────────────────────────────────
// stopTranscoding(slot)
// Kills all FFmpeg processes for a camera slot.
// Called when camera disconnects or stream ends.
// ─────────────────────────────────────────
function stopTranscoding(slot) {
  const processes = activeProcesses.get(slot);
  if (!processes) return;

  for (const { process: ffmpeg, quality } of processes) {
    try {
      // Close stdin first so FFmpeg can finish writing
      ffmpeg.stdin.end();
      // Give it 2 seconds to finish, then force kill
      setTimeout(() => {
        try { ffmpeg.kill('SIGTERM'); } catch {}
      }, 2000);
      console.log(`[${slot}/${quality}] Stopping FFmpeg`);
    } catch (err) {
      console.error(`[${slot}/${quality}] Error stopping FFmpeg:`, err.message);
    }
  }

  activeProcesses.delete(slot);
}

// ─────────────────────────────────────────
// stopAllTranscoding()
// Kills all FFmpeg processes. Called when stream ends.
// ─────────────────────────────────────────
function stopAllTranscoding() {
  for (const slot of activeProcesses.keys()) {
    stopTranscoding(slot);
  }
}

// ─────────────────────────────────────────
// getStdin(slot, quality)
// Returns the stdin writable stream for a specific quality level.
// The WHIP endpoint writes raw YUV420P frames to this stream.
// ─────────────────────────────────────────
function getStdin(slot, quality) {
  const processes = activeProcesses.get(slot);
  if (!processes) return null;
  const proc = processes.find((p) => p.quality === quality);
  return proc ? proc.stdin : null;
}

// ─────────────────────────────────────────
// GET /transcoder/health
// ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  const active = [];
  for (const [slot, processes] of activeProcesses) {
    active.push({
      slot,
      processes: processes.map((p) => ({
        quality: p.quality,
        pid: p.process.pid,
        running: !p.process.killed,
      })),
    });
  }

  res.json({
    success: true,
    service: 'transcoder',
    status: 'ok',
    active,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// POST /transcoder/start
// Internal — starts transcoding for a camera slot.
// Called by the WHIP endpoint when a camera connects.
// ─────────────────────────────────────────
router.post('/start', (req, res) => {
  const { slot } = req.body;

  if (!slot || !['cam1', 'cam2', 'cam3'].includes(slot)) {
    return res.status(400).json({ success: false, error: 'Valid slot required (cam1/cam2/cam3)' });
  }

  if (activeProcesses.has(slot)) {
    return res.status(409).json({ success: false, error: `Transcoding already active for ${slot}` });
  }

  const processes = startTranscoding(slot);

  res.json({
    success: true,
    data: {
      slot,
      qualities: processes.map((p) => p.quality),
    },
  });
});

// ─────────────────────────────────────────
// POST /transcoder/stop
// Internal — stops transcoding for a camera slot.
// ─────────────────────────────────────────
router.post('/stop', (req, res) => {
  const { slot } = req.body;

  if (!slot) {
    return res.status(400).json({ success: false, error: 'slot is required' });
  }

  stopTranscoding(slot);

  res.json({ success: true, message: `Transcoding stopped for ${slot}` });
});

// ─────────────────────────────────────────
// POST /transcoder/stop-all
// Internal — stops all transcoding (stream ended).
// ─────────────────────────────────────────
router.post('/stop-all', (_req, res) => {
  stopAllTranscoding();
  res.json({ success: true, message: 'All transcoding stopped' });
});

module.exports = router;
module.exports.startTranscoding = startTranscoding;
module.exports.stopTranscoding = stopTranscoding;
module.exports.stopAllTranscoding = stopAllTranscoding;
module.exports.getStdin = getStdin;
module.exports.activeProcesses = activeProcesses;
