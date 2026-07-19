import api from './api';

export async function getAllRecordings() {
  const { data } = await api.get('/api/recordings');
  return data.data.recordings;
}

export async function getRecording(id) {
  const { data } = await api.get(`/api/recordings/${id}`);
  return data.data.recording;
}

export async function updateRecording(id, fields) {
  const { data } = await api.patch(`/api/recordings/${id}`, fields);
  return data.data.recording;
}

export async function deleteRecording(id) {
  const { data } = await api.delete(`/api/recordings/${id}`);
  return data.message;
}
