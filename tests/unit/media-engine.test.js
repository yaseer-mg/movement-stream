// tests/unit/media-engine.test.js
// Unit tests for the Media Engine phase: Transcoder, Packager, Mixer, Recorder, WHIP.
// Tests module logic by mocking external dependencies (FFmpeg, S3, WebRTC).

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

// ─── Mock config ───
jest.mock('../../apps/media-server/src/config', () => ({
  config: {
    port: 3001,
    isDev: true,
    apiServer: { url: 'http://localhost:4000', secret: 'test-secret' },
    hls: { outputPath: '/tmp/test-hls' },
    recordings: { tempPath: '/tmp/test-recordings' },
    s3: { accessKeyId: 'test', secretAccessKey: 'test', region: 'eu-west-1', bucket: 'test-bucket' },
  },
}));

// ─── Mock child_process ───
jest.mock('node:child_process', () => {
  const EventEmitter = require('events');
  return {
    spawn: jest.fn((cmd, args, opts) => {
      const proc = new EventEmitter();
      proc.stdin = { write: jest.fn(), end: jest.fn() };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = jest.fn();
      proc.killed = false;
      proc.pid = Math.floor(Math.random() * 10000);

      // Simulate FFmpeg starting successfully
      setTimeout(() => proc.emit('close', 0), 10);

      return proc;
    }),
  };
});

// ─── Mock fs for file operations ───
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => []),
    readFileSync: jest.fn(() => ''),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    existsSync: jest.fn(() => false),
    statSync: jest.fn(() => ({ size: 1024 * 1024 * 5 })),
    createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
  };
});

// ─── Mock AWS S3 ───
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

// ─── Mock wrtc ───
jest.mock('wrtc', () => ({
  RTCPeerConnection: jest.fn(() => ({
    setRemoteDescription: jest.fn(),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
    setLocalDescription: jest.fn(),
    close: jest.fn(),
    connectionState: 'new',
    iceGatheringState: 'complete',
    iceConnectionState: 'new',
    localDescription: { sdp: 'mock-answer-sdp' },
    ontrack: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    onicegatheringstatechange: null,
  })),
}));

// ============================================================
// TRANSCODER TESTS
// ============================================================
describe('Transcoder', () => {
  let transcoder;

  beforeAll(() => {
    transcoder = require('../../apps/media-server/src/transcoder/index');
  });

  beforeEach(() => {
    transcoder.activeProcesses.clear();
  });

  describe('startTranscoding(slot)', () => {
    it('should spawn FFmpeg processes for all quality levels', () => {
      const processes = transcoder.startTranscoding('cam1');
      expect(processes.length).toBe(4);
      expect(transcoder.activeProcesses.has('cam1')).toBe(true);

      const qualities = processes.map((p) => p.quality);
      expect(qualities).toContain('1080p');
      expect(qualities).toContain('720p');
      expect(qualities).toContain('480p');
      expect(qualities).toContain('240p');
    });

    it('should create HLS output directories', () => {
      transcoder.startTranscoding('cam1');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('stopTranscoding(slot)', () => {
    it('should kill all FFmpeg processes for a slot', () => {
      const processes = transcoder.startTranscoding('cam2');
      expect(transcoder.activeProcesses.has('cam2')).toBe(true);

      transcoder.stopTranscoding('cam2');
      expect(transcoder.activeProcesses.has('cam2')).toBe(false);

      for (const { process: ffmpeg } of processes) {
        expect(ffmpeg.stdin.end).toHaveBeenCalled();
      }
    });

    it('should handle stopping non-existent slot gracefully', () => {
      expect(() => transcoder.stopTranscoding('cam99')).not.toThrow();
    });
  });

  describe('getStdin(slot, quality)', () => {
    it('should return stdin for specific quality', () => {
      transcoder.startTranscoding('cam3');
      const stdin = transcoder.getStdin('cam3', '720p');
      expect(stdin).toBeDefined();
      expect(stdin.write).toBeDefined();
    });

    it('should return null for non-existent slot', () => {
      const stdin = transcoder.getStdin('cam99', '720p');
      expect(stdin).toBeNull();
    });
  });

  describe('HTTP routes', () => {
    it('GET /transcoder/health should return status', async () => {
      const request = require('supertest');
      const app = express();
      app.use('/transcoder', transcoder);

      const res = await request(app).get('/transcoder/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('transcoder');
    });

    it('POST /transcoder/start should start transcoding', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/transcoder', transcoder);

      const res = await request(app)
        .post('/transcoder/start')
        .send({ slot: 'cam1' });

      expect(res.status).toBe(200);
      expect(res.body.data.qualities).toContain('1080p');
    });

    it('POST /transcoder/stop should stop transcoding', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/transcoder', transcoder);

      transcoder.startTranscoding('cam1');

      const res = await request(app)
        .post('/transcoder/stop')
        .send({ slot: 'cam1' });

      expect(res.status).toBe(200);
    });
  });
});

// ============================================================
// PACKAGER TESTS
// ============================================================
describe('Packager', () => {
  let packager;

  beforeAll(() => {
    packager = require('../../apps/media-server/src/packager/index');
  });

  describe('generateMasterPlaylist()', () => {
    it('should write master.m3u8 with all quality levels', () => {
      const masterPath = packager.generateMasterPlaylist();
      expect(fs.writeFileSync).toHaveBeenCalled();

      const writtenContent = fs.writeFileSync.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('master.m3u8')
      );
      expect(writtenContent).toBeDefined();
      expect(writtenContent[1]).toContain('#EXTM3U');
      expect(writtenContent[1]).toContain('1080p');
      expect(writtenContent[1]).toContain('720p');
      expect(writtenContent[1]).toContain('480p');
      expect(writtenContent[1]).toContain('240p');
    });
  });

  describe('HTTP routes', () => {
    it('GET /packager/health should return status', async () => {
      const request = require('supertest');
      const app = express();
      app.use('/packager', packager);

      const res = await request(app).get('/packager/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('packager');
    });

    it('POST /packager/generate-master should succeed', async () => {
      const request = require('supertest');
      const app = express();
      app.use('/packager', packager);

      const res = await request(app).post('/packager/generate-master');
      expect(res.status).toBe(200);
    });

    it('POST /packager/cleanup should succeed', async () => {
      const request = require('supertest');
      const app = express();
      app.use('/packager', packager);

      const res = await request(app).post('/packager/cleanup');
      expect(res.status).toBe(200);
    });
  });
});

// ============================================================
// MIXER TESTS
// ============================================================
describe('Mixer', () => {
  let mixer;
  let whipModule;

  beforeAll(() => {
    // Pre-populate activeConnections so mixer can import it
    whipModule = require('../../apps/media-server/src/whip/index');
    mixer = require('../../apps/media-server/src/mixer/index');
  });

  beforeEach(() => {
    whipModule.activeConnections.clear();
  });

  describe('POST /internal/switch-camera', () => {
    it('should switch camera when connection exists', async () => {
      whipModule.activeConnections.set('cam2', { pc: {}, createdAt: new Date() });

      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/internal', mixer);

      const res = await request(app)
        .post('/internal/switch-camera')
        .send({ camera: 'cam2' });

      expect(res.status).toBe(200);
      expect(res.body.data.activeCamera).toBe('cam2');
    });

    it('should reject switch to disconnected camera', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/internal', mixer);

      const res = await request(app)
        .post('/internal/switch-camera')
        .send({ camera: 'cam3' });

      expect(res.status).toBe(404);
    });

    it('should reject invalid camera slot', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/internal', mixer);

      const res = await request(app)
        .post('/internal/switch-camera')
        .send({ camera: 'cam5' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /internal/mixer/status', () => {
    it('should return mixer status', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/internal', mixer);

      const res = await request(app).get('/internal/mixer/status');
      expect(res.status).toBe(200);
      expect(res.body.data.activeCamera).toBeDefined();
    });
  });

  describe('GET /internal/mixer/cameras', () => {
    it('should return camera slot info', async () => {
      whipModule.activeConnections.set('cam1', { pc: {}, createdAt: new Date() });

      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/internal', mixer);

      const res = await request(app).get('/internal/mixer/cameras');
      expect(res.status).toBe(200);
      expect(res.body.data.cameras.length).toBe(3);
    });
  });
});

// ============================================================
// RECORDER TESTS
// ============================================================
describe('Recorder', () => {
  let recorder;

  beforeAll(() => {
    recorder = require('../../apps/media-server/src/recorder/index');
  });

  describe('GET /recorder/health', () => {
    it('should return status', async () => {
      const request = require('supertest');
      const app = express();
      app.use('/recorder', recorder);

      const res = await request(app).get('/recorder/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('recorder');
    });
  });

  describe('POST /recorder/start', () => {
    it('should start recording job', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/recorder', recorder);

      const res = await request(app)
        .post('/recorder/start')
        .send({ streamId: 'test-stream-1', streamTitle: 'Test Recording' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Recording started');
    });

    it('should reject missing streamId', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/recorder', recorder);

      const res = await request(app)
        .post('/recorder/start')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /recorder/stop', () => {
    it('should stop recording', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/recorder', recorder);

      const res = await request(app)
        .post('/recorder/stop')
        .send({ streamId: 'test-stream-1' });

      expect(res.status).toBe(200);
    });
  });
});

// ============================================================
// WHIP TESTS
// ============================================================
describe('WHIP Endpoint', () => {
  let whipRouter;

  beforeAll(() => {
    whipRouter = require('../../apps/media-server/src/whip/index');
  });

  beforeEach(() => {
    whipRouter.activeConnections.clear();
  });

  describe('GET /whip/connections', () => {
    it('should return health status via connections endpoint', async () => {
      const request = require('supertest');
      const app = express();
      app.use('/whip', whipRouter);

      const res = await request(app).get('/whip/connections');
      expect(res.status).toBe(200);
      expect(res.body.data.connections).toEqual([]);
    });

    it('should list connected cameras', async () => {
      whipRouter.activeConnections.set('cam1', { pc: { connectionState: 'connected', iceConnectionState: 'connected' }, createdAt: new Date() });

      const request = require('supertest');
      const app = express();
      app.use('/whip', whipRouter);

      const res = await request(app).get('/whip/connections');
      expect(res.body.data.connections.length).toBe(1);
      expect(res.body.data.connections[0].slot).toBe('cam1');
    });
  });

  describe('POST /whip', () => {
    it('should reject request without X-Camera-Slot', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.text({ type: 'application/sdp' }));
      app.use('/whip', whipRouter);

      const res = await request(app)
        .post('/whip')
        .set('Content-Type', 'application/sdp')
        .send('v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n');

      expect(res.status).toBe(400);
    });

    it('should reject invalid camera slot', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.text({ type: 'application/sdp' }));
      app.use('/whip', whipRouter);

      const res = await request(app)
        .post('/whip')
        .set('Content-Type', 'application/sdp')
        .set('X-Camera-Slot', 'cam5')
        .send('v=0\r\n');

      expect(res.status).toBe(400);
    });

    it('should accept valid WHIP request and create peer connection', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.text({ type: 'application/sdp' }));
      app.use('/whip', whipRouter);

      const sdpOffer = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

      const res = await request(app)
        .post('/whip')
        .set('Content-Type', 'application/sdp')
        .set('X-Camera-Slot', 'cam1')
        .send(sdpOffer);

      expect(res.status).toBe(201);
      expect(res.text).toBe('mock-answer-sdp');
      expect(whipRouter.activeConnections.has('cam1')).toBe(true);
    });
  });

  describe('DELETE /whip/:slot', () => {
    it('should disconnect a camera', async () => {
      whipRouter.activeConnections.set('cam1', {
        pc: { close: jest.fn() },
        createdAt: new Date(),
      });

      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/whip', whipRouter);

      const res = await request(app).delete('/whip/cam1');
      expect(res.status).toBe(200);
      expect(whipRouter.activeConnections.has('cam1')).toBe(false);
    });

    it('should return 404 for non-existent slot', async () => {
      const request = require('supertest');
      const app = express();
      app.use(express.json());
      app.use('/whip', whipRouter);

      const res = await request(app).delete('/whip/cam99');
      expect(res.status).toBe(404);
    });
  });
});
