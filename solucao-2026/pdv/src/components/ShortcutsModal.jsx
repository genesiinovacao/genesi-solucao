// Referência dos atalhos do PDV (F1).
// Caixa de supermercado trabalha sem mouse: se o operador não souber a tecla,
// ela não existe na prática. Esta tela é a única documentação que ele terá.
const GROUPS = [
  {
    title: 'Venda',
    items: [
      ['F2', 'Ir para a busca / leitor'],
      ['Enter', 'Confirmar o item digitado na busca'],
      ['12*código', 'Lançar 12 unidades de uma vez'],
      ['F3', 'Identificar cliente'],
      ['F10', 'Fechar a venda (pagamento)'],
      ['F9 F9', 'Cancelar a venda (duas vezes)'],
    ],
  },
  {
    title: 'Item destacado',
    items: [
      ['↑ ↓', 'Escolher o item no carrinho'],
      ['+ / −', 'Somar ou tirar uma unidade'],
      ['Delete', 'Remover o item'],
      ['—', 'Só funcionam com a busca vazia'],
    ],
  },
  {
    title: 'Valores',
    items: [
      ['F4', 'Desconto (%)'],
      ['F8', 'Acréscimo (R$)'],
      ['Enter', 'Voltar para a busca'],
    ],
  },
  {
    title: 'Caixa',
    items: [
      ['F6', 'Sangria / Suprimento'],
      ['F7', 'Devolução'],
      ['F12', 'Fechar o caixa'],
      ['F5', 'Atualizar catálogo'],
    ],
  },
  {
    title: 'Pagamento',
    items: [
      ['F1…F6', 'Escolher a forma de pagamento'],
      ['Enter', 'Preencher o que falta e confirmar'],
      ['Delete', 'Limpar os valores'],
    ],
  },
  {
    title: 'Sempre',
    items: [
      ['Esc', 'Fechar a janela aberta'],
      ['F1', 'Esta tela'],
    ],
  },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-6 no-print"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl p-7 max-h-[90vh] overflow-auto custom-scrollbar">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-xl font-bold text-white">⌨️ Atalhos do teclado</h2>
            <p className="text-xs text-slate-400 mt-1">Todo o PDV funciona sem mouse.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-2">{g.title}</h3>
              <div className="space-y-1.5">
                {g.items.map(([key, desc]) => (
                  <div key={key + desc} className="flex items-baseline gap-2 text-sm">
                    <kbd className="flex-shrink-0 min-w-[3.5rem] text-center px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-200">
                      {key}
                    </kbd>
                    <span className="text-slate-400 text-xs leading-tight">{desc}</span>
                  </div>
                ))}
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
