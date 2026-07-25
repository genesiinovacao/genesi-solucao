import axios from 'axios';
import { auth } from './auth';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5160',
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
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    // 402 = assinatura vencida. Numa sessão de suporte isso não deveria
    // acontecer (o backend isenta a impersonação); se acontecer com um token
    // antigo, devolve o superadmin ao painel em vez de prendê-lo na tela.
    if (err.response?.status === 402 && auth.isImpersonating()) {
      auth.exitImpersonation();
      window.location.assign('/admin');
    }
    return Promise.reject(err);
  }
);
