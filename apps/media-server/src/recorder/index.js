const { Router } = require('express');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { config } = require('../config');

const router = Router();

// ─────────────────────────────────────────
// S3 client — configured from environment variables
// ─────────────────────────────────────────
const s3 = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

// ─────────────────────────────────────────
// Active recording jobs: streamId → { process, outputPath }
// ─────────────────────────────────────────
const activeRecordings = new Map();

// ─────────────────────────────────────────
// startRecording(streamId, options)
// Merges .ts segments into .mp4 and uploads to S3.
//
// options: { streamId, eventId, streamTitle }
// ─────────────────────────────────────────
async function startRecording(streamId, options = {}) {
  const { eventId, streamTitle } = options;

  // Ensure temp directory exists
  const tempDir = config.recordings.tempPath;
  fs.mkdirSync(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, `${streamId}.mp4`);
  const segmentDir = path.join(config.hls.outputPath, '1080p');

  // Build the date + title for the S3 key
  const date = new Date().toISOString().split('T')[0];
  const safeTitle = (streamTitle || 'recording')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const s3Key = `recordings/${streamId}/${date}_${safeTitle}.mp4`;

  console.log(`[Recorder] Starting recording merge for stream ${streamId}`);

  // ─── Step 1: Merge .ts segments into .mp4 using FFmpeg ───
  return new Promise((resolve, reject) => {
    // Create a concat list of all .ts files
    const concatList = path.join(tempDir, `${streamId}_concat.txt`);

    try {
      const files = fs.readdirSync(segmentDir)
        .filter((f) => f.endsWith('.ts'))
        .sort();

      if (files.length === 0) {
        console.log(`[Recorder] No .ts segments found in ${segmentDir}`);
        return reject(new Error('No video segments to record'));
      }

      // Write concat file for FFmpeg
      const content = files.map((f) => `file '${path.join(segmentDir, f)}'`).join('\n');
      fs.writeFileSync(concatList, content, 'utf-8');
      console.log(`[Recorder] Found ${files.length} segments to merge`);

    } catch (err) {
      return reject(err);
    }

    // FFmpeg concat command: merge segments → single mp4
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c', 'copy',          // Copy streams without re-encoding (fast!)
      '-movflags', '+faststart',  // Move moov atom to start (for web playback)
      outputPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    ffmpeg.on('error', (err) => {
      console.error(`[Recorder] FFmpeg merge failed:`, err.message);
      cleanup(concatList, outputPath);
      reject(err);
    });

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        console.error(`[Recorder] FFmpeg exited with code ${code}`);
        console.error(stderr.slice(-500));
        cleanup(concatList, outputPath);
        return reject(new Error(`FFmpeg merge failed with code ${code}`));
      }

      console.log(`[Recorder] Merge complete → ${outputPath}`);

      try {
        // ─── Step 2: Get file info ───
        const stats = fs.statSync(outputPath);
        const fileSizeBytes = stats.size;

        // Get duration using ffprobe
        const durationSecs = await getDuration(outputPath);
        console.log(`[Recorder] Duration: ${durationSecs}s, Size: ${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB`);

        // ─── Step 3: Upload to S3 ───
        console.log(`[Recorder] Uploading to S3: ${s3Key}`);
        const fileStream = fs.createReadStream(outputPath);

        await s3.send(new PutObjectCommand({
          Bucket: config.s3.bucket,
          Key: s3Key,
          Body: fileStream,
          ContentType: 'video/mp4',
        }));

        const fileUrl = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${s3Key}`;
        console.log(`[Recorder] Upload complete → ${fileUrl}`);

        // ─── Step 4: Notify API server to create recording record ───
        await notifyApiServer({
          stream_id: streamId,
          event_id: eventId || null,
          title: streamTitle || `Recording ${date}`,
          file_url: fileUrl,
          s3_key: s3Key,
          duration_secs: durationSecs,
          file_size_bytes: fileSizeBytes,
        });

        console.log(`[Recorder] Recording saved successfully`);

        // ─── Step 5: Cleanup temp files ───
        cleanup(concatList, outputPath);

        resolve({ fileUrl, s3Key, durationSecs, fileSizeBytes });

      } catch (err) {
        console.error(`[Recorder] Upload/notify failed:`, err.message);
        cleanup(concatList, outputPath);
        reject(err);
      }
    });

    activeRecordings.set(streamId, { process: ffmpeg, outputPath });
  });
}

// ─────────────────────────────────────────
// stopRecording(streamId)
// Stops an active recording (if any).
// ─────────────────────────────────────────
function stopRecording(streamId) {
  const recording = activeRecordings.get(streamId);
  if (recording) {
    try { recording.process.kill('SIGTERM'); } catch {}
    activeRecordings.delete(streamId);
  }
}

// ─────────────────────────────────────────
// HELPER: Get video duration using ffprobe
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
// HELPER: Notify API server to create recording record
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
// HELPER: Clean up temp files
// ─────────────────────────────────────────
function cleanup(concatList, outputPath) {
  try { fs.unlinkSync(concatList); } catch {}
  try { fs.unlinkSync(outputPath); } catch {}
}

// ─────────────────────────────────────────
// GET /recorder/health
// ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'recorder',
    status: 'ok',
    activeRecordings: Array.from(activeRecordings.keys()),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// POST /recorder/start
// Internal — starts recording a stream.
// Body: { streamId, eventId, streamTitle }
// ─────────────────────────────────────────
router.post('/start', async (req, res) => {
  const { streamId, eventId, streamTitle } = req.body;

  if (!streamId) {
    return res.status(400).json({ success: false, error: 'streamId is required' });
  }

  try {
    // Start recording in background (don't block the response)
    startRecording(streamId, { eventId, streamTitle }).catch((err) => {
      console.error(`[Recorder] Background recording failed for ${streamId}:`, err.message);
    });

    res.json({ success: true, message: `Recording started for ${streamId}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// POST /recorder/stop
// Internal — stops an active recording.
// Body: { streamId }
// ─────────────────────────────────────────
router.post('/stop', (req, res) => {
  const { streamId } = req.body;

  if (!streamId) {
    return res.status(400).json({ success: false, error: 'streamId is required' });
  }

  stopRecording(streamId);

  res.json({ success: true, message: `Recording stop requested for ${streamId}` });
});

module.exports = router;
module.exports.startRecording = startRecording;
module.exports.stopRecording = stopRecording;
