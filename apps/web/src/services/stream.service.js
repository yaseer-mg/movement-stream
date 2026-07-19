import api from './api';

export async function getStreamStatus() {
  const { data } = await api.get('/api/stream/status');
  return data.data.status;
}

export async function startStream({ title, description, event_id }) {
  const { data } = await api.post('/api/stream/start', { title, description, event_id });
  return data.data.status;
}

export async function endStream() {
  const { data } = await api.post('/api/stream/end');
  return data.data.status;
}

export async function switchCamera(camera) {
  const { data } = await api.patch('/api/stream/camera', { camera });
  return data.data.active_camera;
}

export async function toggleChat(enabled) {
  const { data } = await api.patch('/api/stream/chat', { enabled });
  return data.data.chat_enabled;
}

export async function getStreamKey() {
  const { data } = await api.get('/api/stream/key');
  return data.data.stream_key;
}
