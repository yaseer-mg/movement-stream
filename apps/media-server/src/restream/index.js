// src/restream/index.js
// ============================================================
// Restream service — pushes the live "program" HLS feed out to
// configured social media RTMP targets (YouTube, Facebook, ...).
//
// On stream start, the api-server calls POST /internal/restream/start.
// The media server then:
//   1. fetches enabled targets (WITH stream keys) from the api-server
//   2. waits until the transcoder has produced real HLS segments
//   3. spawns one FFmpeg per target:
//        ffmpeg -re -i /var/hls/master.m3u8 \
//               -map 0:v:0? -map 0:a:0? -c copy -f flv <ingest_url>/<key>
//      The master playlist repoints on camera switch, so the
//      pushed feed always matches what app viewers see.
//
// If a push process crashes while the stream is still live it is
// restarted automatically. Every status change is reported back
// to the api-server for the admin UI.
// ============================================================

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Router } = require('express');
const { config } = require('../config');

const router = Router();

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;
const FEED_POLL_MS = 1000;

// targetId → process record
const processes = new Map();
let active = false;
let watcherRunning = false;

// ─────────────────────────────────────────
// feedHasSegments()
// True once the transcoder has written at least one completed
// HLS segment (any slot/quality). Used to avoid spawning the
// push before there is anything to read.
// ─────────────────────────────────────────
function feedHasSegments() {
  const base = config.hls.outputPath;
  if (!fs.existsSync(base)) return false;

  for (const slot of fs.readdirSync(base)) {
    const slotDir = path.join(base, slot);
    if (!fs.existsSync(slotDir) || !fs.statSync(slotDir).isDirectory()) continue;

    for (const quality of fs.readdirSync(slotDir)) {
      const qualityDir = path.join(slotDir, quality);
      if (!fs.existsSync(qualityDir) || !fs.statSync(qualityDir).isDirectory()) continue;

      for (const file of fs.readdirSync(qualityDir)) {
        if (file.endsWith('.ts') && !file.endsWith('.ts.tmp')) return true;
      }
    }
  }

  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// fetchTargets()
// Pulls the enabled restream targets (with keys) from the
// api-server over the trusted internal channel.
// ─────────────────────────────────────────
async function fetchTargets() {
  const res = await fetch(`${config.apiServer.url}/api/restream/targets/internal`, {
    headers: { 'x-media-secret': config.apiServer.secret },
  });
  if (!res.ok) {
    throw new Error(`api-server returned ${res.status} for restream targets`);
  }
  const json = await res.json();
  return json.data?.targets || [];
}

// ─────────────────────────────────────────
// reportStatus()
// Sends the current per-target push state to the api-server.
// ─────────────────────────────────────────
async function reportStatus() {
  const targets = [];
  for (const [targetId, entry] of processes) {
    targets.push({
      targetId,
      status: entry.status,
      startedAt: entry.startedAt,
      lastError: entry.lastError,
    });
  }

  try {
    await fetch(`${config.apiServer.url}/api/restream/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-media-secret': config.apiServer.secret,
      },
      body: JSON.stringify({ targets }),
    });
  } catch (err) {
    console.log('[Restream] Status report to api-server failed:', err.message);
  }
}

// ─────────────────────────────────────────
// pushTarget(target)
// Spawns a single FFmpeg that pushes the live master playlist
// to the target's RTMP ingest. Handles respawn on failure
// while the stream remains live.
// ─────────────────────────────────────────
function pushTarget(target) {
  const existing = processes.get(target.id);
  if (existing && existing.status === 'running') return;

  const args = [
    '-nostdin',
    '-loglevel', 'error',
    '-re',
    '-i', path.join(config.hls.outputPath, 'master.m3u8'),
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-c', 'copy',
    '-f', 'flv',
    `${target.ingest_url}/${target.stream_key}`,
  ];

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

  const entry = {
    ffmpeg,
    target,
    status: 'starting',
    startedAt: null,
    lastError: null,
    attempts: 1,
    stderrTail: '',
  };
  processes.set(target.id, entry);

  ffmpeg.stderr.on('data', (chunk) => {
    entry.stderrTail = (entry.stderrTail + chunk.toString()).slice(-1200);
  });

  ffmpeg.once('spawn', () => {
    entry.status = 'running';
    entry.attempts = 1;
    entry.startedAt = new Date().toISOString();
    entry.lastError = null;
    console.log(`[Restream] ${target.name} → ${target.ingest_url} (running)`);
    reportStatus();
  });

  ffmpeg.once('error', (err) => {
    entry.status = 'error';
    entry.lastError = err.message;
    console.error(`[Restream] ${target.name} failed to start: ${err.message}`);
    reportStatus();
    scheduleRetry(entry);
  });

  ffmpeg.once('close', (code) => {
    const wasRunning = entry.status === 'running';
    if (active) {
      entry.status = 'error';
      entry.lastError = entry.stderrTail || (wasRunning ? `exited with code ${code}` : 'exited');
      console.error(`[Restream] ${target.name} stopped unexpectedly (code ${code})`);
      reportStatus();
      scheduleRetry(entry);
    } else {
      entry.status = 'stopped';
      console.log(`[Restream] ${target.name} stopped (code ${code})`);
    }
  });
}

function scheduleRetry(entry) {
  if (!active) return;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lastError = (entry.lastError ? `${entry.lastError} — ` : '') + `giving up after ${MAX_ATTEMPTS} attempts`;
    console.error(`[Restream] ${entry.target.name}: ${entry.lastError}`);
    reportStatus();
    return;
  }

  entry.attempts += 1;
  setTimeout(() => {
    if (!active) return;
    console.log(`[Restream] ${entry.target.name}: retry ${entry.attempts}/${MAX_ATTEMPTS}`);
    pushTarget(entry.target);
  }, RETRY_DELAY_MS);
}

async function spawnAllTargets() {
  let targets;
  try {
    targets = await fetchTargets();
  } catch (err) {
    console.error('[Restream] Failed to fetch targets:', err.message);
    return;
  }

  if (targets.length === 0) {
    console.log('[Restream] No enabled targets configured — nothing to push');
    reportStatus();
    return;
  }

  for (const target of targets) {
    pushTarget(target);
  }
}

// ─────────────────────────────────────────
// ensureTargetsRunning()
// Waits (in the background) for the transcoder to produce its
// first segment, then spawns one push per target. Prevents
// the classic "0:v:0 matches no streams" failure when the push
// starts before the feed exists.
// ─────────────────────────────────────────
async function ensureTargetsRunning() {
  watcherRunning = true;
  while (active) {
    if (feedHasSegments()) {
      await spawnAllTargets();
      break;
    }
    await sleep(FEED_POLL_MS);
  }
  watcherRunning = false;
}

function stopAll() {
  active = false;
  for (const [, entry] of processes) {
    entry.status = 'stopped';
    entry.lastError = null;
    if (entry.ffmpeg && !entry.ffmpeg.killed) {
      entry.ffmpeg.kill('SIGTERM');
    }
  }
  reportStatus();
}

// ─────────────────────────────────────────
// Routes — called by the api-server (x-media-secret)
// ─────────────────────────────────────────

// POST /internal/restream/start
router.post('/start', (_req, res) => {
  if (active) {
    return res.json({ success: true, message: 'Restream already active' });
  }

  active = true;
  processes.clear();
  ensureTargetsRunning().catch((err) => {
    console.error('[Restream] Watcher error:', err.message);
  });

  res.json({ success: true, message: 'Restream armed (waiting for feed)' });
});

// POST /internal/restream/stop
router.post('/stop', (_req, res) => {
  stopAll();
  res.json({ success: true, message: 'Restream stopped' });
});

// GET /internal/restream/status
router.get('/status', (_req, res) => {
  const targets = [];
  for (const [targetId, entry] of processes) {
    targets.push({
      targetId,
      name: entry.target.name,
      ingest_url: entry.target.ingest_url,
      status: entry.status,
      startedAt: entry.startedAt,
      lastError: entry.lastError,
      attempts: entry.attempts,
    });
  }
  res.json({ success: true, data: { active, watcherRunning, targets } });
});

module.exports = router;