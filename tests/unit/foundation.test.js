// tests/unit/foundation.test.js
// Unit tests for the Foundation phase: Auth, Events, Stream, Chat, Recordings.
// Tests route logic by mocking the database and external services.

const express = require('express');

// ─── Mock database BEFORE requiring any route modules ───
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
    n8n: { streamStartWebhook: '', streamEndWebhook: '' },
  },
}));

// ─── Mock AWS S3 ───
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

// ─── Mock WebSocket broadcast ───
jest.mock('../../apps/api-server/src/websocket/index', () => ({
  broadcast: jest.fn(),
  getClientCount: jest.fn(() => 0),
  initWebSocket: jest.fn(),
}));

const { db, reset } = require('../mocks/db');
const { AppError } = require('../../apps/api-server/src/middleware/error-handler');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-access-secret';

// ─── Helper: create Express app with a single route ───
function createApp(routePath, router) {
  const app = express();
  app.use(express.json());
  app.use(routePath, router);
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    res.status(500).json({ success: false, error: err.message });
  });
  return app;
}

// ─── Helper: generate JWT token ───
function makeToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
}

// ─── Helper: seed a test user ───
async function seedUser(overrides = {}) {
  const hash = await bcrypt.hash('Test1234!', 10);
  const user = {
    id: overrides.id || `user-${Date.now()}`,
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
// AUTH TESTS
// ============================================================
describe('Auth Routes', () => {
  let authRouter;

  beforeAll(() => {
    authRouter = require('../../apps/api-server/src/routes/auth.routes');
  });

  beforeEach(() => reset());

  describe('POST /api/auth/register', () => {
    it('should create a new viewer account', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@test.com', password: 'Test1234!', display_name: 'New User' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('newuser@test.com');
      expect(res.body.data.user.role).toBe('viewer');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject missing fields', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject duplicate email', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      await seedUser({ email: 'exists@test.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'exists@test.com', password: 'Test1234!', display_name: 'Dup' });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const user = await seedUser({ email: 'login@test.com' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'Test1234!' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      await seedUser({ email: 'wrong@test.com' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@test.com', password: 'WrongPass!' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const user = await seedUser({ id: 'me-user-1', email: 'me@test.com' });
      const token = makeToken(user);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('me@test.com');
    });

    it('should reject unauthenticated request', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/create-staff', () => {
    it('should allow super_admin to create admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const sa = await seedUser({ id: 'sa-1', email: 'sa@test.com', role: 'super_admin' });
      const token = makeToken(sa);

      const res = await request(app)
        .post('/api/auth/create-staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'newadmin@test.com', password: 'Test1234!', display_name: 'New Admin', role: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should reject viewer trying to create staff', async () => {
      const request = require('supertest');
      const app = createApp('/api/auth', authRouter);

      const viewer = await seedUser({ email: 'viewer@test.com', role: 'viewer' });
      const token = makeToken(viewer);

      const res = await request(app)
        .post('/api/auth/create-staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'nope@test.com', password: 'Test1234!', display_name: 'Nope', role: 'admin' });

      expect(res.status).toBe(403);
    });
  });
});

// ============================================================
// EVENTS TESTS
// ============================================================
describe('Events Routes', () => {
  let eventsRouter;

  beforeAll(() => {
    eventsRouter = require('../../apps/api-server/src/routes/events');
  });

  beforeEach(() => reset());

  describe('GET /api/events', () => {
    it('should list all events', async () => {
      const request = require('supertest');
      const app = createApp('/api/events', eventsRouter);

      const admin = await seedUser({ id: 'ev-admin-1', email: 'evadmin@test.com', role: 'admin' });
      db.events.push({
        id: 'ev-1', title: 'Abuja Conference', status: 'upcoming', is_featured: true,
        starts_at: '2025-12-01T10:00:00Z', created_by: admin.id, created_at: new Date().toISOString(),
      });

      const res = await request(app).get('/api/events');
      expect(res.status).toBe(200);
      expect(res.body.data.events.length).toBe(1);
      expect(res.body.data.events[0].title).toBe('Abuja Conference');
    });

    it('should filter by status', async () => {
      const request = require('supertest');
      const app = createApp('/api/events', eventsRouter);

      const admin = await seedUser({ id: 'ev-admin-2', email: 'evadmin2@test.com', role: 'admin' });
      db.events.push(
        { id: 'ev-2', title: 'Upcoming', status: 'upcoming', is_featured: false, starts_at: '2025-12-01T10:00:00Z', created_by: admin.id, created_at: new Date().toISOString() },
        { id: 'ev-3', title: 'Ended', status: 'ended', is_featured: false, starts_at: '2025-11-01T10:00:00Z', created_by: admin.id, created_at: new Date().toISOString() },
      );

      const res = await request(app).get('/api/events?status=upcoming');
      expect(res.body.data.events.length).toBe(1);
      expect(res.body.data.events[0].title).toBe('Upcoming');
    });
  });

  describe('POST /api/events', () => {
    it('should create event as admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/events', eventsRouter);

      const admin = await seedUser({ id: 'ev-admin-3', email: 'evadmin3@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Kano Rally', starts_at: '2025-12-15T10:00:00Z', location: 'Kano' });

      expect(res.status).toBe(201);
      expect(res.body.data.event.title).toBe('Kano Rally');
    });

    it('should reject viewer creating event', async () => {
      const request = require('supertest');
      const app = createApp('/api/events', eventsRouter);

      const viewer = await seedUser({ email: 'evviewer@test.com', role: 'viewer' });
      const token = makeToken(viewer);

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Nope', starts_at: '2025-12-15T10:00:00Z' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/events/:id', () => {
    it('should delete event as admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/events', eventsRouter);

      const admin = await seedUser({ id: 'ev-admin-4', email: 'evadmin4@test.com', role: 'admin' });
      const token = makeToken(admin);
      db.events.push({ id: 'ev-del-1', title: 'Delete Me', status: 'upcoming', starts_at: '2025-12-01T10:00:00Z', created_by: admin.id, created_at: new Date().toISOString() });

      const res = await request(app)
        .delete('/api/events/ev-del-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(db.events.length).toBe(0);
    });

    it('should return 404 for non-existent event', async () => {
      const request = require('supertest');
      const app = createApp('/api/events', eventsRouter);

      const admin = await seedUser({ id: 'ev-admin-5', email: 'evadmin5@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .delete('/api/events/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});

// ============================================================
// STREAM TESTS
// ============================================================
describe('Stream Routes', () => {
  let streamRouter;

  beforeAll(() => {
    streamRouter = require('../../apps/api-server/src/routes/stream');
  });

  beforeEach(() => reset());

  describe('GET /api/stream/status', () => {
    it('should return stream status', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const res = await request(app).get('/api/stream/status');
      expect(res.status).toBe(200);
      expect(res.body.data.status.is_live).toBe(false);
      expect(res.body.data.status.active_camera).toBe('cam1');
    });

    it('should not expose stream_key', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const res = await request(app).get('/api/stream/status');
      expect(res.body.data.status.stream_key).toBeUndefined();
    });
  });

  describe('POST /api/stream/start', () => {
    it('should start stream as super_admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const sa = await seedUser({ id: 'str-sa-1', email: 'strsa@test.com', role: 'super_admin' });
      const token = makeToken(sa);

      const res = await request(app)
        .post('/api/stream/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Live Test' });

      expect(res.status).toBe(200);
      expect(db.stream_status.is_live).toBe(true);
      expect(db.stream_status.title).toBe('Live Test');
    });

    it('should reject admin starting stream', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const admin = await seedUser({ id: 'str-admin-1', email: 'stradmin@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .post('/api/stream/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Nope' });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/stream/camera', () => {
    it('should switch camera as admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const admin = await seedUser({ id: 'cam-admin-1', email: 'camadmin@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .patch('/api/stream/camera')
        .set('Authorization', `Bearer ${token}`)
        .send({ camera: 'cam2' });

      expect(res.status).toBe(200);
      expect(db.stream_status.active_camera).toBe('cam2');
    });

    it('should reject invalid camera slot', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const admin = await seedUser({ id: 'cam-admin-2', email: 'camadmin2@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .patch('/api/stream/camera')
        .set('Authorization', `Bearer ${token}`)
        .send({ camera: 'cam5' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/stream/chat', () => {
    it('should toggle chat', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const admin = await seedUser({ id: 'ch-admin-1', email: 'chadmin@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .patch('/api/stream/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(db.stream_status.chat_enabled).toBe(false);
    });
  });

  describe('GET /api/stream/key', () => {
    it('should return stream key for super_admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/stream', streamRouter);

      const sa = await seedUser({ id: 'key-sa-1', email: 'keysa@test.com', role: 'super_admin' });
      const token = makeToken(sa);

      const res = await request(app)
        .get('/api/stream/key')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.stream_key).toBeDefined();
    });
  });
});

// ============================================================
// CHAT TESTS
// ============================================================
describe('Chat Routes', () => {
  let chatRouter;

  beforeAll(() => {
    chatRouter = require('../../apps/api-server/src/routes/chat');
  });

  beforeEach(() => reset());

  describe('GET /api/chat/:streamId', () => {
    it('should return chat history', async () => {
      const request = require('supertest');
      const app = createApp('/api/chat', chatRouter);

      db.chat_messages.push(
        { id: 'msg-1', stream_id: 'stream-1', user_id: 'u1', display_name: 'User1', message: 'Hello', is_deleted: false, created_at: new Date().toISOString() },
        { id: 'msg-2', stream_id: 'stream-1', user_id: 'u2', display_name: 'User2', message: 'Deleted', is_deleted: true, created_at: new Date().toISOString() },
      );

      const res = await request(app).get('/api/chat/stream-1');
      expect(res.status).toBe(200);
      expect(res.body.data.messages.length).toBe(1);
      expect(res.body.data.messages[0].message).toBe('Hello');
    });
  });

  describe('POST /api/chat', () => {
    it('should send message when stream is live', async () => {
      const request = require('supertest');
      const app = createApp('/api/chat', chatRouter);

      db.stream_status.is_live = true;
      db.stream_status.chat_enabled = true;

      const user = await seedUser({ id: 'chat-user-1', email: 'chatuser@test.com', role: 'viewer' });
      const token = makeToken(user);

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Salam Alaikum!', stream_id: 'stream-1' });

      expect(res.status).toBe(201);
      expect(res.body.data.message.message).toBe('Salam Alaikum!');
    });

    it('should reject message when stream is not live', async () => {
      const request = require('supertest');
      const app = createApp('/api/chat', chatRouter);

      db.stream_status.is_live = false;

      const user = await seedUser({ id: 'chat-user-2', email: 'chatuser2@test.com', role: 'viewer' });
      const token = makeToken(user);

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Hello', stream_id: 'stream-1' });

      expect(res.status).toBe(400);
    });

    it('should reject message when chat is disabled', async () => {
      const request = require('supertest');
      const app = createApp('/api/chat', chatRouter);

      db.stream_status.is_live = true;
      db.stream_status.chat_enabled = false;

      const user = await seedUser({ id: 'chat-user-3', email: 'chatuser3@test.com', role: 'viewer' });
      const token = makeToken(user);

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Hello', stream_id: 'stream-1' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/chat/:messageId', () => {
    it('should soft delete message as admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/chat', chatRouter);

      db.chat_messages.push({ id: 'msg-del-1', stream_id: 'stream-1', display_name: 'User', message: 'Bad msg', is_deleted: false, created_at: new Date().toISOString() });

      const admin = await seedUser({ id: 'chat-admin-1', email: 'chatadmin@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .delete('/api/chat/msg-del-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(db.chat_messages[0].is_deleted).toBe(true);
    });
  });
});

// ============================================================
// RECORDINGS TESTS
// ============================================================
describe('Recordings Routes', () => {
  let recordingsRouter;

  beforeAll(() => {
    recordingsRouter = require('../../apps/api-server/src/routes/recordings');
  });

  beforeEach(() => reset());

  describe('GET /api/recordings', () => {
    it('should list public ready recordings', async () => {
      const request = require('supertest');
      const app = createApp('/api/recordings', recordingsRouter);

      db.recordings.push(
        { id: 'rec-1', title: 'Public Rec', is_public: true, processing_status: 'ready', file_url: 'http://s3/test.mp4', s3_key: 'test.mp4', recorded_at: new Date().toISOString() },
        { id: 'rec-2', title: 'Private Rec', is_public: false, processing_status: 'ready', file_url: 'http://s3/test2.mp4', s3_key: 'test2.mp4', recorded_at: new Date().toISOString() },
      );

      const res = await request(app).get('/api/recordings');
      expect(res.status).toBe(200);
      expect(res.body.data.recordings.length).toBe(1);
      expect(res.body.data.recordings[0].title).toBe('Public Rec');
    });
  });

  describe('DELETE /api/recordings/:id', () => {
    it('should delete recording as admin', async () => {
      const request = require('supertest');
      const app = createApp('/api/recordings', recordingsRouter);

      db.recordings.push({ id: 'rec-del-1', title: 'Delete Me', s3_key: 'del.mp4', is_public: true, processing_status: 'ready', file_url: 'http://s3/del.mp4', recorded_at: new Date().toISOString() });

      const admin = await seedUser({ id: 'rec-admin-1', email: 'recadmin@test.com', role: 'admin' });
      const token = makeToken(admin);

      const res = await request(app)
        .delete('/api/recordings/rec-del-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(db.recordings.length).toBe(0);
    });
  });
});
