import api from './api';

export async function getChatHistory(streamId) {
  const { data } = await api.get(`/api/chat/${streamId}`);
  return data.data.messages;
}

export async function sendMessage({ message, stream_id }) {
  const { data } = await api.post('/api/chat', { message, stream_id });
  return data.data.message;
}

export async function deleteMessage(messageId) {
  const { data } = await api.delete(`/api/chat/${messageId}`);
  return data.message;
}
