import api from './api';

export async function getRestreamStatus() {
  const { data } = await api.get('/api/restream/status');
  return data.data;
}

export async function createRestreamTarget(payload) {
  const { data } = await api.post('/api/restream/targets', payload);
  return data.data.target;
}

export async function updateRestreamTarget(id, payload) {
  const { data } = await api.patch(`/api/restream/targets/${id}`, payload);
  return data.data.target;
}

export async function deleteRestreamTarget(id) {
  const { data } = await api.delete(`/api/restream/targets/${id}`);
  return data.data;
}