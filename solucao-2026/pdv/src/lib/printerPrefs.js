// Preferências de impressão persistidas no localStorage.
// silent: imprime sem caixa de diálogo, direto na deviceName escolhida.
// auto:   imprime automaticamente após cada venda (só vale se silent=true).
const KEY = 'solucao.printerPrefs';

const defaults = {
  silent: false,
  auto: false,
  deviceName: '',
  copies: 1,
  // Largura da bobina: 58mm (384 dots/linha) ou 80mm (576 dots/linha).
  // O autoteste da impressora informa esse número.
  paperWidth: 80,
  // Como a página é enviada ao driver. Varia por modelo — ver o modal.
  // 1 = margem zero (padrão) · 2 = margem zero + página exata · 3 = driver decide
  printMode: 1,
  // Imprime tudo em negrito. Mais dots por caractere: ajuda quando o cupom
  // sai falhado por bobina fraca ou cabeça gasta. Não substitui a densidade
  // do driver, que é onde o ajuste de verdade fica.
  bold: false,
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
