// Preferências de impressão persistidas no localStorage.
// silent: imprime sem caixa de diálogo, direto na deviceName escolhida.
// auto:   imprime automaticamente após cada venda (só vale se silent=true).
const KEY = 'solucao.printerPrefs';

const defaults = {
  silent: false,
  auto: false,
  deviceName: '',
  copies: 1,
};

export const printerPrefs = {
  get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  },
  set(prefs) {
    localStorage.setItem(KEY, JSON.stringify({ ...defaults, ...prefs }));
  },
};
