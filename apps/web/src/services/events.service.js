import api from './api';

export async function getAllEvents({ status, featured } = {}) {
  const params = {};
  if (status) params.status = status;
  if (featured) params.featured = 'true';

  const { data } = await api.get('/api/events', { params });
  return data.data.events;
}

export async function getEvent(id) {
  const { data } = await api.get(`/api/events/${id}`);
  return data.data.event;
}

export async function createEvent({ title, description, location, thumbnail_url, starts_at, ends_at, is_featured }) {
  const { data } = await api.post('/api/events', {
    title,
    description,
    location,
    thumbnail_url,
    starts_at,
    ends_at,
    is_featured,
  });
  return data.data.event;
}

export async function updateEvent(id, fields) {
  const { data } = await api.put(`/api/events/${id}`, fields);
  return data.data.event;
}

export async function deleteEvent(id) {
  const { data } = await api.delete(`/api/events/${id}`);
  return data.message;
}
