import { useMemo } from 'react';

// Remapeamento das teclas do PDV.
// Serve à loja que vem de outro sistema: trocar de PDV já é traumático, e
// obrigar o operador a reaprender F2/F10 custa fila nos primeiros dias. Aqui
// o admin põe as teclas que a equipe dele já tem no dedo.

/** Espelha ACTIONS do PDV (pdv/src/lib/shortcuts.js). */
export const PDV_ACTIONS = [
  { id: 'help',      key: 'F1',  label: 'Abrir a ajuda de atalhos' },
  { id: 'search',    key: 'F2',  label: 'Ir para a busca / leitor' },
  { id: 'customer',  key: 'F3',  label: 'Identificar cliente' },
  { id: 'discount',  key: 'F4',  label: 'Desconto (%)' },
  { id: 'refresh',   key: 'F5',  label: 'Atualizar catálogo' },
  { id: 'cash',      key: 'F6',  label: 'Sangria / Suprimento' },
  { id: 'return',    key: 'F7',  label: 'Devolução' },
  { id: 'surcharge', key: 'F8',  label: 'Acréscimo (R$)' },
  { id: 'cancel',    key: 'F9',  label: 'Cancelar a venda' },
  { id: 'payment',   key: 'F10', label: 'Pagamento' },
  { id: 'quote',     key: 'F11', label: 'Orçamento' },
  { id: 'closeCash', key: 'F12', label: 'Fechar o caixa' },
];

/** Espelha AllowedShortcutKeys do SettingsController. */
export const ALLOWED_KEYS = [
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', '*', '+', '-', '/',
];

const DEFAULTS = Object.fromEntries(PDV_ACTIONS.map((a) => [a.id, a.key]));

export default function PdvShortcutsEditor({ value, onChange }) {
  // O que está salvo por cima do padrão
  const effective = useMemo(() => ({ ...DEFAULTS, ...(value || {}) }), [value]);

  // Duas ações na mesma tecla deixariam uma inalcançável — o backend recusa,
  // mas o admin precisa ver o conflito antes de tentar salvar.
  const duplicates = useMemo(() => {
    const count = {};
    for (const k of Object.values(effective)) count[k] = (count[k] || 0) + 1;
    return new Set(Object.keys(count).filter((k) => count[k] > 1));
  }, [effective]);

  const setKey = (id, key) => {
    const next = { ...(value || {}) };
    if (key === DEFAULTS[id]) delete next[id];   // voltou ao padrão: não guarda
    else next[id] = key;
    onChange(next);
  };

  const customCount = Object.keys(value || {}).length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500 max-w-lg">
          Teclas que o caixa usa no PDV. Mude se a equipe vem de outro sistema e
          já tem outra tecla no dedo — trocar de PDV custa menos quando o atalho
          continua o mesmo. As alterações chegam ao PDV na próxima atualização
          do catálogo (a cada 5 min, ou na tecla de atualizar).
        </p>
        {customCount > 0 && (
          <button type="button" onClick={() => onChange({})}
                  className="flex-shrink-0 text-xs px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50">
            Voltar ao padrão
          </button>
        )}
      </div>

      {duplicates.size > 0 && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          ⚠️ A tecla <strong>{[...duplicates].join(', ')}</strong> está em mais de uma ação.
          Corrija antes de salvar — uma delas ficaria inalcançável no PDV.
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {PDV_ACTIONS.map((a) => {
          const key = effective[a.id];
          const changed = key !== DEFAULTS[a.id];
          const clash = duplicates.has(key);
          return (
            <label key={a.id} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-slate-700 truncate">{a.label}</span>
              <select value={key} onChange={(e) => setKey(a.id, e.target.value)}
                      className={`w-28 flex-shrink-0 px-2 py-1.5 border rounded-lg text-sm font-mono bg-white ${
                        clash ? 'border-red-400 text-red-700'
                        : changed ? 'border-blue-400 text-blue-700' : 'border-slate-300'
                      }`}>
                {ALLOWED_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">
        Só teclas de função e de controle entram na lista: letras e números são
        o que o leitor de código de barras "digita", e virariam atalho a cada bipe.
      </p>
    </div>
  );
}
