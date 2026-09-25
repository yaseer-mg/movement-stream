import api from './api';

export async function getCameraSlots() {
  const { data } = await api.get('/api/camera/slots');
  return data.data;
}

export async function connectCamera(slot) {
  const { data } = await api.post(`/api/camera/${slot}/connect`);
  return data.data;
}

export async function disconnectCamera(slot) {
  const { data } = await api.post(`/api/camera/${slot}/disconnect`);
  return data.data;
}