const KEY = 'pdv_cash_session_id';
export const cashSession = {
  get: () => localStorage.getItem(KEY),
  set: (id) => localStorage.setItem(KEY, id),
  clear: () => localStorage.removeItem(KEY),
};
