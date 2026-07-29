const KEY_ACCESS = 'pdv_access_token';
const KEY_REFRESH = 'pdv_refresh_token';
const KEY_USER = 'pdv_user';

export const auth = {
  getAccessToken: () => localStorage.getItem(KEY_ACCESS),
  getRefreshToken: () => localStorage.getItem(KEY_REFRESH),
  getUser: () => {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  },
  isAuthenticated: () => !!localStorage.getItem(KEY_ACCESS),
  save: ({ accessToken, refreshToken, user }) => {
    localStorage.setItem(KEY_ACCESS, accessToken);
    localStorage.setItem(KEY_REFRESH, refreshToken);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem(KEY_ACCESS);
    localStorage.removeItem(KEY_REFRESH);
    localStorage.removeItem(KEY_USER);
  },

  /**
   * Troca de turno: outro operador assume o caixa sem sair do aplicativo.
   * Mantém a instalação autenticada; só o token do turno e o usuário mudam.
   */
  replaceSession: ({ accessToken, user }) => {
    localStorage.setItem(KEY_ACCESS, accessToken);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
    localStorage.removeItem(KEY_REFRESH); // sessão de turno não renova sozinha
  },
};

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5160';
