import { ACTIONS, keyOf } from '../lib/shortcuts';

// Referência dos atalhos do PDV.
// Caixa de supermercado trabalha sem mouse: se o operador não souber a tecla,
// ela não existe na prática. Esta tela é a única documentação que ele terá —
// por isso lê o mapa da loja, não uma lista fixa. Loja que remapeou vê as
// teclas dela aqui.

const LABEL = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label]));

/** Grupos por contexto; `id` puxa a tecla do mapa, `fixed` é tecla imutável. */
const GROUPS = [
  {
    title: 'Venda',
    items: [
      { id: 'search' },
      { fixed: 'Enter', desc: 'Confirmar o item digitado na busca' },
      { fixed: '12*código', desc: 'Lançar 12 unidades de uma vez' },
      { id: 'customer' },
      { id: 'payment' },
      { id: 'cancel' },
    ],
  },
  {
    title: 'Item destacado',
    items: [
      { fixed: '↑ ↓', desc: 'Escolher o item no carrinho' },
      { fixed: '+ / −', desc: 'Somar ou tirar uma unidade' },
      { fixed: 'Delete', desc: 'Remover o item' },
      { fixed: '—', desc: 'Só funcionam com a busca vazia' },
    ],
  },
  {
    title: 'Andar pela tela',
    items: [
      { fixed: '← →', desc: 'Próximo campo / campo anterior, como Tab' },
      { fixed: 'Tab', desc: 'Continua funcionando igual' },
      { fixed: '—', desc: 'Dentro de um texto a seta só anda na ponta' },
    ],
  },
  {
    title: 'Valores',
    items: [
      { id: 'discount' },
      { id: 'surcharge' },
      { fixed: 'Enter', desc: 'Voltar para a busca' },
    ],
  },
  {
    title: 'Caixa',
    items: [
      { id: 'cash' },
      { id: 'return' },
      { id: 'closeCash' },
      { id: 'refresh' },
    ],
  },
  {
    title: 'Pagamento',
    items: [
      { fixed: 'F1…F6', desc: 'Escolher a forma de pagamento' },
      { fixed: 'Enter', desc: 'Preencher o que falta e confirmar' },
      { fixed: 'Delete', desc: 'Limpar os valores' },
    ],
  },
  {
    title: 'Orçamento',
    items: [
      { id: 'quote' },
      { fixed: 'F2 / F3', desc: 'Aba Novo / aba Salvos' },
      { fixed: 'F10', desc: 'Salvar e imprimir' },
      { fixed: 'Enter', desc: 'Devolver o salvo ao carrinho' },
      { fixed: 'F4', desc: 'Reimprimir o destacado' },
    ],
  },
  {
    title: 'Sempre',
    items: [
      { fixed: 'Esc', desc: 'Fechar a janela aberta' },
      { id: 'help' },
    ],
  },
];

export default function ShortcutsModal({ onClose, shortcutMap, customized }) {
  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-6 no-print"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl p-7 max-h-[90vh] overflow-auto custom-scrollbar">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-xl font-bold text-white">⌨️ Atalhos do teclado</h2>
            <p className="text-xs text-slate-400 mt-1">
              Todo o PDV funciona sem mouse.
              {customized && ' Esta loja usa teclas personalizadas.'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-2">{g.title}</h3>
              <div className="space-y-1.5">
                {g.items.map((item, i) => {
                  const key = item.fixed ?? (keyOf(shortcutMap, item.id) || 'sem tecla');
                  const desc = item.desc ?? LABEL[item.id];
                  return (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <kbd className="flex-shrink-0 min-w-[3.5rem] text-center px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-200">
                        {key}
                      </kbd>
                      <span className="text-slate-400 text-xs leading-tight">{desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg">
          Fechar · Esc
        </button>
      </div>
    </div>
  );
}
