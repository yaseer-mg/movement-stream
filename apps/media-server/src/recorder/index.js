const { Router } = require('express');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');
const { getHlsStatus } = require('../packager');

const router = Router();

// ─────────────────────────────────────────
// Session state — one per streamId (if recording is active).
// ─────────────────────────────────────────
const sessions = new Map();

// ─────────────────────────────────────────
// startSession(streamId, options)
// Creates a recording workspace and begins tracking
// segment copies for the given stream.
// ─────────────────────────────────────────
function startSession(streamId, options = {}) {
  // Use a unique recording id per broadcast so consecutive streams
  // on this single stream_status row never overwrite each other's file.
  const recordingId = crypto.randomUUID();
  const workspace = path.join(config.recordings.tempPath, recordingId);

  fs.mkdirSync(workspace, { recursive: true });

  sessions.set(streamId, {
    recordingId,
    workspace,
    streamTitle: options.streamTitle || 'Untitled Recording',
    eventId: options.eventId || null,
    copied: new Set(),
    orderCounter: 0,
  });

  console.log(`[Recorder] Session started for stream ${streamId} (recording ${recordingId})`);
}

// ─────────────────────────────────────────
// snapshotSlot(streamId, slot)
// Copies any new 1080p segments from the given slot
// into the recording workspace. Called by the mixer
// when a camera switch happens or at session end.
// ─────────────────────────────────────────
function snapshotSlot(streamId, slot) {
  const session = sessions.get(streamId);
  if (!session) return;

  const slotHlsDir = path.join(config.hls.outputPath, slot, '1080p');
  if (!fs.existsSync(slotHlsDir)) return;

  const files = fs.readdirSync(slotHlsDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.ts.tmp'))
    .sort();

  for (const file of files) {
    if (session.copied.has(file)) continue;
    session.copied.add(file);

    const src = path.join(slotHlsDir, file);
    const order = String(++session.orderCounter).padStart(8, '0');
    const dest = path.join(session.workspace, `seg_${order}.ts`);

    try { fs.copyFileSync(src, dest); } catch (err) {
      console.error(`[Recorder] Failed to snapshot ${file}:`, err.message);
    }
  }

  console.log(`[Recorder] Snapshot ${slot} → ${session.orderCounter} segments (stream ${streamId})`);
}

// ─────────────────────────────────────────
// endSession(streamId, activeSlot)
// Takes a final snapshot, concatenates workspace
// segments into a single mp4, notifies the api-server,
// and cleans up the HLS directory for the next stream.
// ─────────────────────────────────────────
async function endSession(streamId, activeSlot) {
  const session = sessions.get(streamId);
  if (!session) {
    console.log(`[Recorder] No session to end for ${streamId}`);
    return;
  }

  // Final snapshot of whatever is on-air right now
  snapshotSlot(streamId, activeSlot);

  if (session.orderCounter === 0) {
    console.log(`[Recorder] No segments to record for stream ${streamId}`);
    cleanupTransientFiles(session.workspace);
    sessions.delete(streamId);
    return;
  }
  const concatList = path.join(session.workspace, 'concat.txt');
  const entries = fs.readdirSync(session.workspace)
    .filter((f) => f.startsWith('seg_') && f.endsWith('.ts'))
    .sort();
  const content = entries.map((f) => `file '${path.join(session.workspace, f)}'`).join('\n');
  fs.writeFileSync(concatList, content, 'utf-8');

  const outputPath = path.join(session.workspace, 'final.mp4');

  console.log(`[Recorder] Concatenating ${entries.length} segments → ${outputPath}`);

  try {
    await concatSegments(concatList, outputPath);
    console.log(`[Recorder] Merge complete → ${outputPath}`);

    const stats = fs.statSync(outputPath);
    const fileSizeBytes = stats.size;
    const durationSecs = await getDuration(outputPath);
    console.log(`[Recorder] Duration: ${durationSecs}s, Size: ${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB`);

    const publicPath = `/recordings/${session.recordingId}/final.mp4`;
    const s3Key = `recordings/${session.recordingId}/final.mp4`;

    await notifyApiServer({
      stream_id: streamId,
      event_id: session.eventId,
      title: session.streamTitle,
      file_url: publicPath,
      s3_key: s3Key,
      duration_secs: durationSecs,
      file_size_bytes: fileSizeBytes,
    });

    console.log(`[Recorder] Recording saved for stream ${streamId}`);
  } catch (err) {
    console.error(`[Recorder] Recording failed for ${streamId}:`, err.message);
  }

  // Remove transient segment + concat files but keep final.mp4
  // so the public /recordings/<recordingId>/final.mp4 URL stays valid.
  cleanupTransientFiles(session.workspace);
  sessions.delete(streamId);
}

// ─────────────────────────────────────────
// concatSegments(listPath, outputPath)
// Merges .ts files into a single mp4 via FFmpeg concat.
// ─────────────────────────────────────────
function concatSegments(listPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    ffmpeg.on('error', reject);

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(stderr.slice(-400));
        return reject(new Error(`FFmpeg concat failed with code ${code}`));
      }
      resolve();
    });
  });
}

// ─────────────────────────────────────────
// getDuration(filePath) — via ffprobe
// ─────────────────────────────────────────
function getDuration(filePath) {
  return new Promise((resolve) => {
    const probe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let output = '';
    probe.stdout.on('data', (chunk) => { output += chunk.toString(); });

    probe.on('close', () => {
      const duration = parseFloat(output.trim());
      resolve(isNaN(duration) ? 0 : Math.round(duration));
    });
    probe.on('error', () => resolve(0));
  });
}

// ─────────────────────────────────────────
// notifyApiServer(data)
// Creates the recording record in the api-server DB.
// ─────────────────────────────────────────
async function notifyApiServer(data) {
  const response = await fetch(`${config.apiServer.url}/api/recordings/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-media-secret': config.apiServer.secret,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API server returned ${response.status}: ${text}`);
  }
}

// ─────────────────────────────────────────
// cleanupTransientFiles(workspace)
// Removes segment and concat files from the workspace
// but preserves final.mp4 so the public URL stays valid.
// ─────────────────────────────────────────
function cleanupTransientFiles(workspace) {
  if (!fs.existsSync(workspace)) return;
  for (const file of fs.readdirSync(workspace)) {
    if (file === 'final.mp4') continue;
    try { fs.unlinkSync(path.join(workspace, file)); } catch {}
  }
}

// ─────────────────────────────────────────
// hasActiveSession(streamId)
// ─────────────────────────────────────────
function hasActiveSession(streamId) {
  return sessions.has(streamId);
}

// ─────────────────────────────────────────
// GET /recorder/health
// ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'recorder',
    status: 'ok',
    activeSessions: Array.from(sessions.keys()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
module.exports.startSession = startSession;
module.exports.endSession = endSession;
module.exports.snapshotSlot = snapshotSlot;
module.exports.hasActiveSession = hasActiveSession;