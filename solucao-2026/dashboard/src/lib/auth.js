const KEY_ACCESS = 'solucao_access_token';
const KEY_REFRESH = 'solucao_refresh_token';
const KEY_USER = 'solucao_user';

export const auth = {
  getAccessToken: () => localStorage.getItem(KEY_ACCESS),
  getRefreshToken: () => localStorage.getItem(KEY_REFRESH),
  getUser: () => {
    const u = localStorage.getItem(KEY_USER);
    return u ? JSON.parse(u) : null;
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
};
