// tests/mocks/db.js
// Mock database module — replaces pg pool with in-memory data
// for unit tests that don't need a real PostgreSQL database.

const db = {
  users: [],
  events: [],
  stream_status: { id: 'stream-1', is_live: false, active_camera: 'cam1', chat_enabled: true, viewer_count: 0, peak_viewers: 0, stream_key: 'test-stream-key-abc123' },
  cameras: [
    { slot: 'cam1', label: 'Main Stage', is_connected: false },
    { slot: 'cam2', label: 'Wide Angle', is_connected: false },
    { slot: 'cam3', label: 'Speaker Closeup', is_connected: false },
  ],
  chat_messages: [],
  recordings: [],
  refresh_tokens: [],
  stream_analytics: [],
};

function reset() {
  db.users = [];
  db.events = [];
  db.stream_status = { id: 'stream-1', is_live: false, active_camera: 'cam1', chat_enabled: true, viewer_count: 0, peak_viewers: 0, stream_key: 'test-stream-key-abc123' };
  db.cameras = [
    { slot: 'cam1', label: 'Main Stage', is_connected: false },
    { slot: 'cam2', label: 'Wide Angle', is_connected: false },
    { slot: 'cam3', label: 'Speaker Closeup', is_connected: false },
  ];
  db.chat_messages = [];
  db.recordings = [];
  db.refresh_tokens = [];
  db.stream_analytics = [];
}

// Mock query function — handles basic SQL patterns
async function query(sql, params = []) {
  const lower = sql.trim().toLowerCase();

  // SELECT
  if (lower.startsWith('select')) {
    return handleSelect(sql, params);
  }

  // INSERT
  if (lower.startsWith('insert')) {
    return handleInsert(sql, params);
  }

  // UPDATE
  if (lower.startsWith('update')) {
    return handleUpdate(sql, params);
  }

  // DELETE
  if (lower.startsWith('delete')) {
    return handleDelete(sql, params);
  }

  return [];
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function handleSelect(sql, params) {
  const lower = sql.toLowerCase();

  if (lower.includes('from users')) {
    let rows = [...db.users];
    if (lower.includes('where email = $1')) {
      rows = rows.filter((u) => u.email === params[0]);
    }
    if (lower.includes('where id = $1')) {
      rows = rows.filter((u) => u.id === params[0]);
    }
    return rows;
  }

  if (lower.includes('from events')) {
    let rows = [...db.events];
    if (lower.includes('where e.id = $1') || lower.includes('where id = $1')) {
      rows = rows.filter((e) => e.id === params[0]);
    }
    if (lower.includes('where e.status')) {
      const statusParam = params.find((p) => ['upcoming', 'live', 'ended', 'cancelled'].includes(p));
      if (statusParam) rows = rows.filter((e) => e.status === statusParam);
    }
    if (lower.includes('e.is_featured = true')) {
      rows = rows.filter((e) => e.is_featured);
    }
    if (lower.includes('order by e.starts_at asc')) {
      rows.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    }
    return rows;
  }

  if (lower.includes('from stream_status')) {
    const colsMatch = lower.match(/select\s+([\s\S]+?)\s+from\s+stream_status/);
    if (colsMatch) {
      const cols = colsMatch[1].split(',').map(c => c.trim().split(/\s+/).pop());
      if (!cols.includes('*')) {
        const filtered = {};
        for (const col of cols) { if (db.stream_status[col] !== undefined) filtered[col] = db.stream_status[col]; }
        return [filtered];
      }
    }
    return [db.stream_status];
  }

  if (lower.includes('from cameras')) {
    let rows = [...db.cameras];
    if (lower.includes('where slot = $1')) {
      rows = rows.filter((c) => c.slot === params[0]);
    }
    if (lower.includes('where last_seen_at <')) {
      const cutoff = new Date(Date.now() - 10000);
      rows = rows.filter((c) => c.last_seen_at && c.last_seen_at < cutoff);
    }
    return rows;
  }

  if (lower.includes('from chat_messages')) {
    let rows = [...db.chat_messages];
    if (lower.includes('where stream_id = $1')) {
      rows = rows.filter((m) => m.stream_id === params[0]);
    }
    if (lower.includes('is_deleted = false')) {
      rows = rows.filter((m) => !m.is_deleted);
    }
    if (lower.includes('order by created_at asc')) {
      rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    if (lower.includes('limit 100')) {
      rows = rows.slice(0, 100);
    }
    return rows;
  }

  if (lower.includes('from recordings')) {
    let rows = [...db.recordings];
    if (lower.includes('where id = $1')) {
      rows = rows.filter((r) => r.id === params[0]);
    }
    if (lower.includes('is_public = true')) {
      rows = rows.filter((r) => r.is_public);
    }
    if (lower.includes("processing_status = 'ready'")) {
      rows = rows.filter((r) => r.processing_status === 'ready');
    }
    if (lower.includes('order by r.recorded_at desc') || lower.includes('order by recorded_at desc')) {
      rows.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    }
    return rows;
  }

  if (lower.includes('from refresh_tokens')) {
    let rows = [...db.refresh_tokens];
    if (lower.includes('where token_hash = $1')) {
      rows = rows.filter((t) => t.token_hash === params[0]);
    }
    if (lower.includes('where user_id = $1')) {
      rows = rows.filter((t) => t.user_id === params[0]);
    }
    return rows;
  }

  return [];
}

function handleInsert(sql, params) {
  const lower = sql.toLowerCase();

  if (lower.includes('into users')) {
    const user = {
      id: params[0] || `user-${Date.now()}`,
      email: params[0],
      password_hash: params[1],
      display_name: params[2],
      role: params[3] || 'viewer',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    return [{ ...user }];
  }

  if (lower.includes('into events')) {
    const event = {
      id: `event-${Date.now()}`,
      title: params[0],
      description: params[1],
      location: params[2],
      thumbnail_url: params[3],
      starts_at: params[4],
      ends_at: params[5],
      is_featured: params[6],
      created_by: params[7],
      status: 'upcoming',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.events.push(event);
    return [{ ...event }];
  }

  if (lower.includes('into refresh_tokens')) {
    const token = {
      user_id: params[0],
      token_hash: params[1],
      expires_at: params[2],
    };
    db.refresh_tokens.push(token);
    return [token];
  }

  if (lower.includes('into chat_messages')) {
    const msg = {
      id: `msg-${Date.now()}`,
      stream_id: params[0],
      user_id: params[1],
      display_name: params[2],
      message: params[3],
      is_deleted: false,
      created_at: new Date().toISOString(),
    };
    db.chat_messages.push(msg);
    return [{ ...msg }];
  }

  if (lower.includes('into recordings')) {
    const rec = {
      id: `rec-${Date.now()}`,
      stream_id: params[0],
      event_id: params[1],
      title: params[2],
      file_url: params[3],
      s3_key: params[4],
      duration_secs: params[5],
      file_size_bytes: params[6],
      processing_status: params[7] || 'ready',
      is_public: true,
      recorded_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    db.recordings.push(rec);
    return [{ ...rec }];
  }

  if (lower.includes('into stream_analytics')) {
    const sample = {
      stream_id: params[0],
      viewer_count: params[1],
      sampled_at: new Date().toISOString(),
    };
    db.stream_analytics.push(sample);
    return [sample];
  }

  return [];
}

function handleUpdate(sql, params) {
  const lower = sql.toLowerCase();

  if (lower.includes('update users')) {
    const idx = db.users.findIndex((u) => u.id === params[params.length - 1] || u.email === params[0]);
    if (idx !== -1) {
      if (lower.includes('last_login_at')) db.users[idx].last_login_at = new Date().toISOString();
      if (lower.includes('set is_active')) db.users[idx].is_active = params[0];
      return [{ ...db.users[idx] }];
    }
    return [];
  }

  if (lower.includes('update events')) {
    const idx = db.events.findIndex((e) => e.id === params[params.length - 1]);
    if (idx !== -1) {
      if (lower.includes('title = $1')) {
        db.events[idx].title = params[0];
        db.events[idx].description = params[1];
        db.events[idx].location = params[2];
        db.events[idx].thumbnail_url = params[3];
        db.events[idx].starts_at = params[4];
        db.events[idx].ends_at = params[5];
        db.events[idx].status = params[6];
        db.events[idx].is_featured = params[7];
      }
      if (lower.includes("status = 'live'")) db.events[idx].status = 'live';
      if (lower.includes("status = 'ended'")) db.events[idx].status = 'ended';
      db.events[idx].updated_at = new Date().toISOString();
      return [{ ...db.events[idx] }];
    }
    return [];
  }

  if (lower.includes('update stream_status')) {
    if (lower.includes('is_live = $1')) {
      db.stream_status.is_live = params[0];
      db.stream_status.title = params[1];
      db.stream_status.description = params[2];
      db.stream_status.event_id = params[3];
      db.stream_status.started_at = new Date().toISOString();
    }
    if (lower.includes('is_live = true')) {
      db.stream_status.is_live = true;
      db.stream_status.title = params[0];
      db.stream_status.description = params[1];
      db.stream_status.event_id = params[2];
      db.stream_status.started_at = new Date().toISOString();
      db.stream_status.ended_at = null;
      db.stream_status.viewer_count = 0;
      db.stream_status.peak_viewers = 0;
    }
    if (lower.includes('is_live = false')) {
      db.stream_status.is_live = false;
      db.stream_status.ended_at = new Date().toISOString();
    }
    if (lower.includes('active_camera = $1')) {
      db.stream_status.active_camera = params[0];
    }
    if (lower.includes('chat_enabled = $1')) {
      db.stream_status.chat_enabled = params[0];
    }
    if (lower.includes('viewer_count = $1')) {
      db.stream_status.viewer_count = params[0];
    }
    db.stream_status.updated_at = new Date().toISOString();
    return [{ ...db.stream_status }];
  }

  if (lower.includes('update cameras')) {
    const idx = db.cameras.findIndex((c) => c.slot === params[1] || c.slot === params[0]);
    if (idx !== -1) {
      if (lower.includes('is_connected = $1')) {
        db.cameras[idx].is_connected = params[0];
        db.cameras[idx].last_seen_at = new Date().toISOString();
      }
      if (lower.includes('is_connected=false')) {
        db.cameras[idx].is_connected = false;
      }
      return [{ ...db.cameras[idx] }];
    }
    return [];
  }

  if (lower.includes('update chat_messages')) {
    const idx = db.chat_messages.findIndex((m) => m.id === params[1]);
    if (idx !== -1) {
      db.chat_messages[idx].is_deleted = true;
      db.chat_messages[idx].deleted_by = params[0];
      db.chat_messages[idx].deleted_at = new Date().toISOString();
      return [{ ...db.chat_messages[idx] }];
    }
    return [];
  }

  if (lower.includes('update recordings')) {
    const idx = db.recordings.findIndex((r) => r.id === params[params.length - 1]);
    if (idx !== -1) {
      if (lower.includes('title = $1')) db.recordings[idx].title = params[0];
      if (lower.includes('description = $1')) db.recordings[idx].description = params[0];
      if (lower.includes('is_public = $1')) db.recordings[idx].is_public = params[0];
      db.recordings[idx].updated_at = new Date().toISOString();
      return [{ ...db.recordings[idx] }];
    }
    return [];
  }

  return [];
}

function handleDelete(sql, params) {
  const lower = sql.toLowerCase();

  if (lower.includes('from refresh_tokens')) {
    const before = db.refresh_tokens.length;
    if (lower.includes('where token_hash = $1')) {
      db.refresh_tokens = db.refresh_tokens.filter((t) => t.token_hash !== params[0]);
    }
    if (lower.includes('where user_id = $1')) {
      db.refresh_tokens = db.refresh_tokens.filter((t) => t.user_id !== params[0]);
    }
    return [{ count: before - db.refresh_tokens.length }];
  }

  if (lower.includes('from events')) {
    db.events = db.events.filter((e) => e.id !== params[0]);
    return [{ count: 1 }];
  }

  if (lower.includes('from recordings')) {
    db.recordings = db.recordings.filter((r) => r.id !== params[0]);
    return [{ count: 1 }];
  }

  return [{ count: 0 }];
}

module.exports = { db, query, queryOne, reset };
