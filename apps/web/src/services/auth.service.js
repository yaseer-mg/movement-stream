import api, { setTokens, clearTokens, getRefreshToken as getRefresh } from './api';

export async function register({ email, password, display_name }) {
  const { data } = await api.post('/api/auth/register', { email, password, display_name });
  const { user, accessToken, refreshToken } = data.data;
  setTokens(accessToken, refreshToken);
  return user;
}

export async function login({ email, password }) {
  const { data } = await api.post('/api/auth/login', { email, password });
  const { user, accessToken, refreshToken } = data.data;
  setTokens(accessToken, refreshToken);
  return user;
}

export async function refresh() {
  const { data } = await api.post('/api/auth/refresh');
  return data.data.accessToken;
}

export async function logout() {
  const refresh = getRefresh();
  try {
    await api.post('/api/auth/logout', { refreshToken: refresh });
  } finally {
    clearTokens();
  }
}

export async function getMe() {
  const { data } = await api.get('/api/auth/me');
  return data.data.user;
}

export async function createStaff({ email, password, display_name, role }) {
  const { data } = await api.post('/api/auth/create-staff', {
    email,
    password,
    display_name,
    role,
  });
  return data.data.user;
}
