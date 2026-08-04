// tests/integration/api-integration.test.js
// Integration tests — tests the full flow between API server routes.
// Mocks the database but tests actual HTTP request/response flow
// across multiple endpoints in sequence.

const express = require('express');

// ─── Mock database ───
jest.mock('../../apps/api-server/src/db/pool', () => {
  const mock = require('../mocks/db');
  return { query: mock.query, queryOne: mock.queryOne };
});

// ─── Mock config ───
jest.mock('../../apps/api-server/src/config/env', () => ({
  env: {
    port: 4000,
    host: '127.0.0.1',
    corsOrigin: 'http://localhost:5173',
    jwt: {
      accessSecret: 'test-access-secret',
      refreshSecret: 'test-refresh-secret',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    mediaServer: { url: 'http://localhost:3001', secret: 'test-secret' },
    s3: { accessKeyId: 'test', secretAccessKey: 'test', region: 'eu-west-1', bucket: 'test-bucket' },
    social: {
      streamPublicUrl: 'http://localhost:5173',
      timezone: 'Africa/Lagos',
      facebook: { pageId: '', accessToken: '' },
      whatsapp: { phoneNumberId: '', accessToken: '', apiVersion: 'v17.0', recipients: [] },
      twitter: { apiKey: '', apiSecret: '', accessToken: '', accessSecret: '' },
    },
    cron: { eventReminder: '0 8 * * *' },
  },
}));

// ─── Mock social service (never hit real social APIs in tests) ───
jest.mock('../../apps/api-server/src/services/social.service', () => ({
  notifyStreamStart: jest.fn().mockResolvedValue(),
  notifyStreamEnd: jest.fn().mockResolvedValue(),
  postEventReminder: jest.fn().mockResolvedValue(),
}));

// ─── Mock WebSocket broadcast ───
jest.mock('../../apps/api-server/src/websocket/index', () => ({
  broadcast: jest.fn(),
  getClientCount: jest.fn(() => 0),
  initWebSocket: jest.fn(),
}));

const { db, reset } = require('../mocks/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-access-secret';

// ─── Helper: create full API app ───
function createFullApp() {
  const app = express();
  app.use(express.json());

  const authRoutes = require('../../apps/api-server/src/routes/auth.routes');
  const eventRoutes = require('../../apps/api-server/src/routes/events');
  const streamRoutes = require('../../apps/api-server/src/routes/stream');
  const chatRoutes = require('../../apps/api-server/src/routes/chat');
  const recordingRoutes = require('../../apps/api-server/src/routes/recordings');

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/recordings', recordingRoutes);

  app.use((err, req, res, next) => {
    const { AppError } = require('../../apps/api-server/src/middleware/error-handler');
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    res.status(500).json({ success: false, error: err.message });
  });

  return app;
}

// ─── Helper: generate JWT ───
function makeToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
}

// ─── Helper: seed user ───
async function seedUser(overrides = {}) {
  const hash = await bcrypt.hash('Test1234!', 10);
  const user = {
    id: overrides.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: overrides.email || `test-${Date.now()}@movement.ng`,
    password_hash: hash,
    display_name: overrides.display_name || 'Test User',
    role: overrides.role || 'viewer',
    is_active: true,
    created_at: new Date().toISOString(),
  };
  db.users.push(user);
  return user;
}

// ============================================================
// FULL AUTH FLOW INTEGRATION TEST
// ============================================================
describe('Integration: Full Auth Flow', () => {
  let request;
  let app;

  beforeAll(() => {
    app = createFullApp();
    request = require('supertest');
  });

  beforeEach(() => reset());

  it('should complete full auth lifecycle: register → login → me → refresh → logout', async () => {
    // 1. Register
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'lifecycle@test.com', password: 'Test1234!', display_name: 'Lifecycle User' });

    expect(registerRes.status).toBe(201);
    const { accessToken, refreshToken } = registerRes.body.data;

    // 2. Get profile
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('lifecycle@test.com');

    // 3. Refresh token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    // 4. Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);

    // 5. Refresh should fail after logout
    const refreshAfterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshAfterLogout.status).toBe(401);
  });
});

// ============================================================
// FULL EVENT MANAGEMENT INTEGRATION TEST
// ============================================================
describe('Integration: Event Management Flow', () => {
  let request;
  let app;
  let adminToken;
  let admin;

  beforeAll(async () => {
    app = createFullApp();
    request = require('supertest');
    admin = await seedUser({ id: 'int-admin-1', email: 'intadmin@test.com', role: 'admin' });
    adminToken = makeToken(admin);
  });

  beforeEach(() => reset());

  it('should complete full event lifecycle: create → list → get → update → delete', async () => {
    // 1. Create event
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Abuja Peace Conference', starts_at: '2025-12-01T10:00:00Z', location: 'Abuja' });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.event.id;

    // 2. List events
    const listRes = await request(app).get('/api/events');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.events.length).toBe(1);

    // 3. Get single event
    const getRes = await request(app).get(`/api/events/${eventId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.event.title).toBe('Abuja Peace Conference');

    // 4. Update event
    const updateRes = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Abuja Peace Summit', location: 'Abuja Centenary City' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.event.title).toBe('Abuja Peace Summit');

    // 5. Delete event
    const deleteRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);

    // 6. Verify deleted
    const getAfterDelete = await request(app).get(`/api/events/${eventId}`);
    expect(getAfterDelete.status).toBe(404);
  });
});

// ============================================================
// FULL STREAM CONTROL INTEGRATION TEST
// ============================================================
describe('Integration: Stream Control Flow', () => {
  let request;
  let app;
  let saToken;
  let adminToken;

  beforeAll(async () => {
    app = createFullApp();
    request = require('supertest');
    const sa = await seedUser({ id: 'int-sa-1', email: 'intsa@test.com', role: 'super_admin' });
    const admin = await seedUser({ id: 'int-admin-2', email: 'intadmin2@test.com', role: 'admin' });
    saToken = makeToken(sa);
    adminToken = makeToken(admin);
  });

  beforeEach(() => reset());

  it('should complete full stream lifecycle: start → camera switch → chat toggle → end', async () => {
    // 1. Check initial status (not live)
    const status1 = await request(app).get('/api/stream/status');
    expect(status1.body.data.status.is_live).toBe(false);

    // 2. Start stream
    const startRes = await request(app)
      .post('/api/stream/start')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ title: 'Live Test Stream' });

    expect(startRes.status).toBe(200);
    expect(db.stream_status.is_live).toBe(true);

    // 3. Switch camera
    const switchRes = await request(app)
      .patch('/api/stream/camera')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ camera: 'cam2' });

    expect(switchRes.status).toBe(200);
    expect(db.stream_status.active_camera).toBe('cam2');

    // 4. Toggle chat off
    const chatOff = await request(app)
      .patch('/api/stream/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });

    expect(chatOff.status).toBe(200);
    expect(db.stream_status.chat_enabled).toBe(false);

    // 5. Get stream key
    const keyRes = await request(app)
      .get('/api/stream/key')
      .set('Authorization', `Bearer ${saToken}`);

    expect(keyRes.status).toBe(200);
    expect(keyRes.body.data.stream_key).toBeDefined();

    // 6. End stream
    const endRes = await request(app)
      .post('/api/stream/end')
      .set('Authorization', `Bearer ${saToken}`);

    expect(endRes.status).toBe(200);
    expect(db.stream_status.is_live).toBe(false);

    // 7. Verify status after end
    const status2 = await request(app).get('/api/stream/status');
    expect(status2.body.data.status.is_live).toBe(false);
  });
});

// ============================================================
// FULL CHAT FLOW INTEGRATION TEST
// ============================================================
describe('Integration: Chat Flow', () => {
  let request;
  let app;
  let viewerToken;
  let adminToken;

  beforeAll(async () => {
    app = createFullApp();
    request = require('supertest');
    viewerToken = makeToken({ id: 'int-viewer-1', email: 'intviewer@test.com', role: 'viewer' });
    adminToken = makeToken({ id: 'int-admin-3', email: 'intadmin3@test.com', role: 'admin' });
  });

  beforeEach(async () => {
    reset();
    await seedUser({ id: 'int-viewer-1', email: 'intviewer@test.com', role: 'viewer' });
    await seedUser({ id: 'int-admin-3', email: 'intadmin3@test.com', role: 'admin' });
    db.stream_status.is_live = true;
    db.stream_status.chat_enabled = true;
  });

  it('should complete chat flow: send → fetch → delete', async () => {
    // 1. Send message
    const sendRes = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ message: 'Wa Alaikum Salam!', stream_id: 'stream-1' });

    expect(sendRes.status).toBe(201);
    const msgId = sendRes.body.data.message.id;

    // 2. Fetch history
    const fetchRes = await request(app).get('/api/chat/stream-1');
    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.data.messages.length).toBe(1);
    expect(fetchRes.body.data.messages[0].message).toBe('Wa Alaikum Salam!');

    // 3. Delete message (admin)
    const deleteRes = await request(app)
      .delete(`/api/chat/${msgId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);

    // 4. Verify deleted message hidden
    const fetchAfter = await request(app).get('/api/chat/stream-1');
    expect(fetchAfter.body.data.messages.length).toBe(0);
  });
});

// ============================================================
// FULL RECORDINGS FLOW INTEGRATION TEST
// ============================================================
describe('Integration: Recordings Flow', () => {
  let request;
  let app;
  let adminToken;

  beforeAll(async () => {
    app = createFullApp();
    request = require('supertest');
    const admin = await seedUser({ id: 'int-rec-admin-1', email: 'intrecadmin@test.com', role: 'admin' });
    adminToken = makeToken(admin);
  });

  beforeEach(() => reset());

  it('should complete recordings flow: internal create → list → get → delete', async () => {
    // 1. Create recording via internal endpoint (called by media server)
    const createRes = await request(app)
      .post('/api/recordings/internal')
      .set('x-media-secret', 'test-secret')
      .send({
        stream_id: 'stream-1',
        title: 'Test Recording',
        file_url: 'https://s3.amazonaws.com/test/recording.mp4',
        s3_key: 'recordings/stream-1/2025-12-01_test.mp4',
        duration_secs: 3600,
        file_size_bytes: 524288000,
      });

    expect(createRes.status).toBe(201);
    const recId = createRes.body.data.recording.id;

    // 2. List recordings (public)
    const listRes = await request(app).get('/api/recordings');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.recordings.length).toBe(1);

    // 3. Get single recording
    const getRes = await request(app).get(`/api/recordings/${recId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.recording.title).toBe('Test Recording');

    // 4. Delete recording
    const deleteRes = await request(app)
      .delete(`/api/recordings/${recId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);

    // 5. Verify deleted
    const getAfter = await request(app).get(`/api/recordings/${recId}`);
    expect(getAfter.status).toBe(404);
  });
});

// ============================================================
// ROLE-BASED ACCESS CONTROL INTEGRATION TEST
// ============================================================
describe('Integration: Role-Based Access Control', () => {
  let request;
  let app;
  let tokens = {};

  beforeAll(async () => {
    app = createFullApp();
    request = require('supertest');

    const sa = await seedUser({ id: 'rbac-sa', email: 'rbac-sa@test.com', role: 'super_admin' });
    const admin = await seedUser({ id: 'rbac-admin', email: 'rbac-admin@test.com', role: 'admin' });
    const camOp = await seedUser({ id: 'rbac-cam', email: 'rbac-cam@test.com', role: 'camera_op' });
    const viewer = await seedUser({ id: 'rbac-viewer', email: 'rbac-viewer@test.com', role: 'viewer' });

    tokens.super_admin = makeToken(sa);
    tokens.admin = makeToken(admin);
    tokens.camera_op = makeToken(camOp);
    tokens.viewer = makeToken(viewer);
  });

  beforeEach(() => reset());

  it('should enforce role-based access on stream start', async () => {
    // super_admin: allowed
    const sa = await request(app)
      .post('/api/stream/start')
      .set('Authorization', `Bearer ${tokens.super_admin}`)
      .send({ title: 'SA Test' });
    expect(sa.status).toBe(200);

    reset();
    db.stream_status.is_live = false;

    // admin: forbidden
    const admin = await request(app)
      .post('/api/stream/start')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ title: 'Admin Test' });
    expect(admin.status).toBe(403);

    // viewer: forbidden
    const viewer = await request(app)
      .post('/api/stream/start')
      .set('Authorization', `Bearer ${tokens.viewer}`)
      .send({ title: 'Viewer Test' });
    expect(viewer.status).toBe(403);
  });

  it('should enforce role-based access on event creation', async () => {
    // admin: allowed
    const admin = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ title: 'Admin Event', starts_at: '2025-12-01T10:00:00Z' });
    expect(admin.status).toBe(201);

    // viewer: forbidden
    const viewer = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokens.viewer}`)
      .send({ title: 'Viewer Event', starts_at: '2025-12-01T10:00:00Z' });
    expect(viewer.status).toBe(403);
  });

  it('should allow public access to stream status', async () => {
    const res = await request(app).get('/api/stream/status');
    expect(res.status).toBe(200);
  });

  it('should reject unauthenticated access to protected routes', async () => {
    const res = await request(app)
      .post('/api/stream/start')
      .send({ title: 'No Token' });
    expect(res.status).toBe(401);
  });
});
