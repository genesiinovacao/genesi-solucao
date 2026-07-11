import axios from 'axios';
import { auth, API_BASE } from './auth';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = auth.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      auth.clear();
      window.location.hash = '#/login';
    }
    return Promise.reject(err);
  }
);
