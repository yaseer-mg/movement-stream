const { Router } = require('express');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');

const router = Router();

// ─────────────────────────────────────────
// Quality presets for adaptive bitrate streaming.
// Each quality runs as its own FFmpeg process so we
// sidestep FFmpeg's multi-HLS-muxer truncation bug
// (only the first -f hls output receives full segments).
// ─────────────────────────────────────────
const QUALITY_PRESETS = [
  { name: '1080p', width: 1920, height: 1080, bitrate: '4000k', maxrate: '4200k', bufsize: '6000k' },
  { name: '720p',  width: 1280, height: 720,  bitrate: '2000k', maxrate: '2100k', bufsize: '3000k' },
  { name: '480p',  width: 854,  height: 480,  bitrate: '1000k', maxrate: '1050k', bufsize: '1500k' },
  { name: '240p',  width: 426,  height: 240,  bitrate: '400k',  maxrate: '420k',  bufsize: '600k' },
];

// ─────────────────────────────────────────
// Active FFmpeg process groups: slot → entry
// entry = { slot, processes: [child...], stdins: [Writable...] }
// ─────────────────────────────────────────
const activeProcesses = new Map();

function activePresets() {
  const enabled = Array.isArray(config.hls?.renditions) ? config.hls.renditions : HLS_RENDITION_NAMES;
  return QUALITY_PRESETS.filter((preset) => enabled.includes(preset.name));
}

function slotDir(slot, quality) {
  return path.join(config.hls.outputPath, slot, quality);
}

// ─────────────────────────────────────────
// buildProcessArgs(slot, preset)
// Returns the CLI args for ONE FFmpeg process that reads
// webm (matroska) from pipe:0 and writes a single HLS
// rendition for the given preset.
// ─────────────────────────────────────────
function buildProcessArgs(slot, preset) {
  const outputDir = slotDir(slot, preset.name);
  const segmentPattern = path.join(outputDir, 'stream_%03d.ts');
  const playlistPath = path.join(outputDir, 'stream.m3u8');

  return [
    '-hide_banner',
    '-nostdin',
    '-y',

    // ─── Input: webm (matroska) from stdin ───
    '-f', 'matroska',
    '-probesize', '512000',
    '-analyzeduration', '0',
    '-i', 'pipe:0',

    // ─── Video encoding ───
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-profile:v', 'main',
    '-level', '4.1',
    '-b:v', preset.bitrate,
    '-maxrate', preset.maxrate,
    '-bufsize', preset.bufsize,
    '-r', '30',
    '-fps_mode', 'cfr',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-vf', `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,

    // ─── Audio encoding ───
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',

    // ─── HLS output (keep-all segments for recording) ───
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_flags', 'temp_file+independent_segments',
    '-hls_allow_cache', '0',
    '-hls_segment_filename', segmentPattern,
    playlistPath,
  ];
}

// ─────────────────────────────────────────
// clearSlotHls(slot)
// Removes a slot's previous HLS output so a reconnecting
// camera starts with a clean playlist. Safe because any
// session that needed those segments already snapshotted
// them into the recording workspace at switch/end time.
// Walks every known preset, not just the active ones, so a
// rendition disabled since the last run leaves no stale dir.
// ─────────────────────────────────────────
function clearSlotHls(slot) {
  const hlsBase = config.hls.outputPath;
  if (!fs.existsSync(hlsBase)) return;

  for (const preset of QUALITY_PRESETS) {
    const dir = path.join(hlsBase, slot, preset.name);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      try { fs.unlinkSync(path.join(dir, file)); } catch {}
    }
  }
  for (const file of ['master.m3u8']) {
    const p = path.join(hlsBase, file);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
  console.log(`[Transcoder] Cleared HLS output for ${slot}`);
}

// ─────────────────────────────────────────
// startTranscoding(slot)
// Spawns one FFmpeg process per active rendition, each
// reading webm from its own stdin. Returns the entry whose
// stdins the ingest route writes (tees) to.
// ─────────────────────────────────────────
function startTranscoding(slot) {
  if (activeProcesses.has(slot)) {
    stopTranscoding(slot);
  }

  clearSlotHls(slot);

  const presets = activePresets();
  const processes = [];
  const stdins = [];

  for (const preset of presets) {
    // FFmpeg's HLS muxer will not create the output directory —
    // ensure it exists so segment writes cannot fail after a
    // cleanup removed it.
    fs.mkdirSync(slotDir(slot, preset.name), { recursive: true });

    const args = buildProcessArgs(slot, preset);
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    processes.push(ffmpeg);
    stdins.push(ffmpeg.stdin);

    ffmpeg.stderr.on('data', (chunk) => {
      const line = chunk.toString().trim().split('\n').pop();
      if (line && line.length > 80) {
        console.log(`[Transcoder][${slot}/${preset.name}] ${line.slice(-160)}`);
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[Transcoder][${slot}/${preset.name}] FFmpeg failed to start:`, err.message);
    });

    ffmpeg.on('close', (code) => {
      console.log(`[Transcoder][${slot}/${preset.name}] FFmpeg exited with code ${code}`);
      maybeCleanupSlot(slot);
    });

    // Swallow broken-pipe errors — the browser may disappear mid-stream.
    ffmpeg.stdin.on('error', () => {});
  }

  const entry = { slot, processes, stdins, createdAt: new Date() };
  activeProcesses.set(slot, entry);

  console.log(
    `[Transcoder] Started ${presets.length}-rendition pipeline for ${slot} (${presets.map((p) => p.name).join(', ')})`
  );
  return entry;
}

// ─────────────────────────────────────────
// maybeCleanupSlot(slot)
// Removes the slot entry once every active process exits.
// ─────────────────────────────────────────
function maybeCleanupSlot(slot) {
  const entry = activeProcesses.get(slot);
  if (!entry) return;

  const allExited = entry.processes.every((p) => p.exitCode !== null && p.exitCode !== undefined);
  if (allExited) {
    activeProcesses.delete(slot);
    console.log(`[Transcoder] All renders exited for ${slot}`);
  }
}

// ─────────────────────────────────────────
// writeToSlot(slot, chunk)
// Tees a chunk to every live FFmpeg stdin. Returns true if
// every stream accepted it (respects backpressure upstream).
// ─────────────────────────────────────────
function writeToSlot(slot, chunk) {
  const entry = activeProcesses.get(slot);
  if (!entry) return false;

  let allAccepted = true;
  for (const stdin of entry.stdins) {
    if (stdin.destroyed) continue;
    const accepted = stdin.write(chunk);
    if (!accepted) allAccepted = false;
  }
  return allAccepted;
}

// ─────────────────────────────────────────
// endSlot(slot)
// Signals end-of-stream to every FFmpeg stdin so they
// finalize their HLS playlists, then force-kills after a
// short grace period if they linger.
// ─────────────────────────────────────────

// Signals end-of-stream to every FFmpeg stdin so they
// finalize their HLS playlists, then force-kills after a
// short grace period if they linger.
// ─────────────────────────────────────────
function endSlot(slot) {
  const entry = activeProcesses.get(slot);
  if (!entry) return;

  for (const stdin of entry.stdins) {
    try { stdin.end(); } catch {}
  }
  console.log(`[Transcoder] End-of-stream sent for ${slot}`);
}

// ─────────────────────────────────────────
// stopTranscoding(slot)
// Ends all stdins gracefully (flushes the last HLS segment),
// then force-kills any lingering process after a grace period.
// ─────────────────────────────────────────
function stopTranscoding(slot) {
  const entry = activeProcesses.get(slot);
  if (!entry) return;

  endSlot(slot);

  setTimeout(() => {
    for (const ffmpeg of entry.processes) {
      if (!ffmpeg.killed) {
        try { ffmpeg.kill('SIGTERM'); } catch {}
      }
    }
  }, 2000);

  console.log(`[Transcoder] Stop requested for ${slot}`);
}

// ─────────────────────────────────────────
// stopAllTranscoding()
// ─────────────────────────────────────────
function stopAllTranscoding() {
  for (const slot of Array.from(activeProcesses.keys())) {
    stopTranscoding(slot);
  }
}

// ─────────────────────────────────────────
// GET /transcoder/health
// ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  const active = Array.from(activeProcesses.entries()).map(([slot, entry]) => ({
    slot,
    processes: entry.processes.map((p) => ({
      pid: p.pid,
      running: !p.killed && p.exitCode === null && p.exitCode === undefined,
      exitCode: p.exitCode,
    })),
  }));

  res.json({
    success: true,
    service: 'transcoder',
    status: 'ok',
    active,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
module.exports.startTranscoding = startTranscoding;
module.exports.stopTranscoding = stopTranscoding;
module.exports.stopAllTranscoding = stopAllTranscoding;
module.exports.writeToSlot = writeToSlot;
module.exports.endSlot = endSlot;
module.exports.activeProcesses = activeProcesses;
module.exports.QUALITY_PRESETS = QUALITY_PRESETS;