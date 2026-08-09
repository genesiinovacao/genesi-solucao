// Atalhos do PDV — padrão do sistema e o mapa efetivo da loja.
//
// A loja que migra de outro sistema pode remapear tudo pelo dashboard: trocar
// de PDV já é traumático, e obrigar o operador a reaprender F2/F10 custa fila
// nos primeiros dias. O padrão abaixo vale enquanto ninguém configurar nada.

/** Ações remapeáveis, na ordem em que aparecem na tela de ajuda. */
export const ACTIONS = [
  { id: 'help',       key: 'F1',  label: 'Abrir a ajuda de atalhos' },
  { id: 'search',     key: 'F2',  label: 'Ir para a busca / leitor' },
  { id: 'customer',   key: 'F3',  label: 'Identificar cliente' },
  { id: 'discount',   key: 'F4',  label: 'Desconto (%)' },
  { id: 'refresh',    key: 'F5',  label: 'Atualizar catálogo' },
  { id: 'cash',       key: 'F6',  label: 'Sangria / Suprimento' },
  { id: 'return',     key: 'F7',  label: 'Devolução' },
  { id: 'surcharge',  key: 'F8',  label: 'Acréscimo (R$)' },
  { id: 'cancel',     key: 'F9',  label: 'Cancelar a venda (duas vezes)' },
  { id: 'payment',    key: 'F10', label: 'Pagamento' },
  { id: 'quote',      key: 'F11', label: 'Orçamento' },
  { id: 'closeCash',  key: 'F12', label: 'Fechar o caixa' },
];

/** Teclas que o backend aceita — mesma lista de SettingsController. */
export const ALLOWED_KEYS = [
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', '*', '+', '-', '/',
];

export const DEFAULT_MAP = Object.fromEntries(ACTIONS.map((a) => [a.id, a.key]));

/**
 * Mescla o que a loja configurou sobre o padrão, descartando o que não serve.
 *
 * Ignora tecla fora da lista permitida e ação desconhecida (configuração de
 * uma versão futura chegando num PDV antigo). Se a loja mapear duas ações na
 * mesma tecla — o backend recusa, mas um banco editado à mão não —, a
 * primeira na ordem de ACTIONS fica e a outra volta ao padrão, porque uma
 * ação inalcançável é pior que uma tecla diferente da esperada.
 */
export function resolveShortcuts(configured) {
  const map = { ...DEFAULT_MAP };
  if (configured && typeof configured === 'object') {
    for (const [id, key] of Object.entries(configured)) {
      if (id in map && ALLOWED_KEYS.includes(key)) map[id] = key;
    }
  }

  const used = new Set();
  for (const { id } of ACTIONS) {
    if (used.has(map[id])) map[id] = DEFAULT_MAP[id];
    // O padrão também pode colidir com um remapeamento; aí a ação fica sem
    // tecla em vez de roubar a de outra.
    if (used.has(map[id])) map[id] = null;
    if (map[id]) used.add(map[id]);
  }
  return map;
}

/** Mapa inverso tecla → ação, que é como o handler de teclado consulta. */
export function byKey(map) {
  const out = {};
  for (const [id, key] of Object.entries(map)) if (key) out[key] = id;
  return out;
}

/** Rótulo curto para mostrar ao lado do botão. */
export function keyOf(map, id) {
  return map?.[id] || null;
}
