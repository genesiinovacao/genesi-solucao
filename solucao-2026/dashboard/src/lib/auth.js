const KEY_ACCESS = 'solucao_access_token';
const KEY_REFRESH = 'solucao_refresh_token';
const KEY_USER = 'solucao_user';

// Sessão original do superadmin, guardada enquanto ele acessa como um cliente
const KEY_SA_ACCESS = 'solucao_sa_access';
const KEY_SA_REFRESH = 'solucao_sa_refresh';
const KEY_SA_USER = 'solucao_sa_user';

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
    localStorage.removeItem(KEY_SA_ACCESS);
    localStorage.removeItem(KEY_SA_REFRESH);
    localStorage.removeItem(KEY_SA_USER);
  },

  // ---- Impersonação (acesso de suporte do superadmin a um cliente) ----
  isImpersonating: () => !!localStorage.getItem(KEY_SA_ACCESS),

  enterImpersonation: ({ accessToken, user }) => {
    localStorage.setItem(KEY_SA_ACCESS, localStorage.getItem(KEY_ACCESS) || '');
    localStorage.setItem(KEY_SA_REFRESH, localStorage.getItem(KEY_REFRESH) || '');
    localStorage.setItem(KEY_SA_USER, localStorage.getItem(KEY_USER) || '');
    localStorage.setItem(KEY_ACCESS, accessToken);
    localStorage.removeItem(KEY_REFRESH); // sessão de suporte não renova — expira sozinha
    localStorage.setItem(KEY_USER, JSON.stringify(user));
  },

  exitImpersonation: () => {
    localStorage.setItem(KEY_ACCESS, localStorage.getItem(KEY_SA_ACCESS) || '');
    const r = localStorage.getItem(KEY_SA_REFRESH);
    if (r) localStorage.setItem(KEY_REFRESH, r); else localStorage.removeItem(KEY_REFRESH);
    localStorage.setItem(KEY_USER, localStorage.getItem(KEY_SA_USER) || '');
    localStorage.removeItem(KEY_SA_ACCESS);
    localStorage.removeItem(KEY_SA_REFRESH);
    localStorage.removeItem(KEY_SA_USER);
  },
};
