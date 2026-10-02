// tests/integration/ws-contract.test.js
// Contract tests for the pieces that drifted between the API server
// and the web client:
//
//   1. stream.live must broadcast the FULL status row. It used to send
//      only { title, description, started_at }, and because the client
//      merged that straight into its store, every omitted field
//      (id, chat_enabled, active_camera, viewer_count) was wiped —
//      leaving viewers with stream.id === undefined and no chat.
//   2. The Team screen needs a list endpoint next to create-staff.
//   3. GET /api/stream/key exposed a secret with no consumer.

const express = require('express');

jest.mock('../../apps/api-server/src/db/pool', () => {
  const mock = require('../mocks/db');
  return { query: mock.query, queryOne: mock.queryOne };
});

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

jest.mock('../../apps/api-server/src/services/social.service', () => ({
  notifyStreamStart: jest.fn().mockResolvedValue(),
  notifyStreamEnd: jest.fn().mockResolvedValue(),
  postEventReminder: jest.fn().mockResolvedValue(),
}));

jest.mock('../../apps/api-server/src/websocket/index', () => ({
  broadcast: jest.fn(),
  getClientCount: jest.fn(() => 0),
  initWebSocket: jest.fn(),
}));

const { broadcast } = require('../../apps/api-server/src/websocket/index');
const { db, reset } = require('../mocks/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-access-secret';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../../apps/api-server/src/routes/auth.routes'));
  app.use('/api/stream', require('../../apps/api-server/src/routes/stream'));
  app.use((err, req, res, next) => {
    const { AppError } = require('../../apps/api-server/src/middleware/error-handler');
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    res.status(500).json({ success: false, error: err.message });
  });
  return app;
}

async function seedUser(overrides = {}) {
  const user = {
    id: overrides.id || `user-${Math.random().toString(36).slice(2, 8)}`,
    email: overrides.email || `user-${Math.random().toString(36).slice(2, 8)}@movement.ng`,
    password_hash: await bcrypt.hash('Test1234!', 4),
    display_name: overrides.display_name || 'Test User',
    role: overrides.role || 'super_admin',
    is_active: true,
    created_at: new Date().toISOString(),
  };
  db.users.push(user);
  return user;
}

const tokenFor = (user) =>
  jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });

const liveBroadcast = () =>
  broadcast.mock.calls.map((c) => c[0]).filter((e) => e.type === 'stream.live').pop();

describe('WS contract: stream.live carries the full status row', () => {
  let request, app, admin;

  beforeAll(() => {
    app = createApp();
    request = require('supertest');
  });

  beforeEach(async () => {
    reset();
    broadcast.mockClear();
    admin = await seedUser({ role: 'super_admin' });
  });

  it('includes id, chat_enabled, active_camera and viewer_count — not just the title', async () => {
    const res = await request(app)
      .post('/api/stream/start')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ title: 'Sunday Service', description: 'Main hall' });

    expect(res.status).toBe(200);

    const event = liveBroadcast();
    expect(event).toBeDefined();

    // Every field the client stores must be present. `undefined`
    // values are what used to blank the store.
    for (const field of [
      'id',
      'is_live',
      'title',
      'description',
      'event_id',
      'active_camera',
      'chat_enabled',
      'viewer_count',
      'peak_viewers',
      'started_at',
    ]) {
      expect(Object.keys(event.data)).toContain(field);
      expect(event.data[field]).not.toBeUndefined();
    }

    expect(event.data.id).toBe(db.stream_status.id);
    expect(event.data.is_live).toBe(true);
    expect(event.data.title).toBe('Sunday Service');
    expect(event.data.chat_enabled).toBe(db.stream_status.chat_enabled);
    expect(event.data.active_camera).toBe(db.stream_status.active_camera);
  });

  it('does not leak the stream key into the broadcast', async () => {
    await request(app)
      .post('/api/stream/start')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ title: 'Key check' });

    expect(liveBroadcast().data).not.toHaveProperty('stream_key');
  });
});

describe('Auth contract: staff listing backs the Team screen', () => {
  let request, app, superAdmin, viewer;

  beforeAll(() => {
    app = createApp();
    request = require('supertest');
  });

  beforeEach(async () => {
    reset();
    superAdmin = await seedUser({ role: 'super_admin', display_name: 'Root Admin' });
    viewer = await seedUser({ role: 'viewer', display_name: 'Watcher' });
  });

  it('lists accounts for a super admin without exposing password hashes', async () => {
    const res = await request(app)
      .get('/api/auth/staff')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`);

    expect(res.status).toBe(200);
    const users = res.body.data.users;
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.display_name)).toEqual(
      expect.arrayContaining(['Root Admin', 'Watcher'])
    );
    users.forEach((u) => expect(u).not.toHaveProperty('password_hash'));
  });

  it('rejects non-super-admins', async () => {
    const res = await request(app)
      .get('/api/auth/staff')
      .set('Authorization', `Bearer ${tokenFor(viewer)}`);

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/auth/staff');
    expect(res.status).toBe(401);
  });
});

describe('Stream key endpoint is gone', () => {
  let request, app, admin;

  beforeAll(() => {
    app = createApp();
    request = require('supertest');
  });

  beforeEach(async () => {
    reset();
    admin = await seedUser({ role: 'super_admin' });
  });

  it('GET /api/stream/key no longer exists', async () => {
    const res = await request(app)
      .get('/api/stream/key')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(404);
  });
});
