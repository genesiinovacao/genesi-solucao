import { useState, useMemo, useEffect, useRef } from 'react';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const baseMethods = [
  { v: 'cash',     icon: '💵', name: 'Dinheiro',      color: 'emerald' },
  { v: 'pix',      icon: '⚡', name: 'Pix',           color: 'cyan' },
  { v: 'debit',    icon: '💳', name: 'Débito',        color: 'blue' },
  { v: 'credit',   icon: '💳', name: 'Crédito',       color: 'indigo' },
  { v: 'transfer', icon: '🏦', name: 'Transferência', color: 'slate' },
];

// Vale crédito só existe com cliente identificado que tenha saldo de devolução
const storeCreditMethod = { v: 'store_credit', icon: '🎟️', name: 'Vale crédito', color: 'amber' };

const colorMap = {
  emerald: { ring: 'ring-emerald-500', border: 'border-emerald-500', text: 'text-emerald-400', glow: 'shadow-emerald-900/40' },
  cyan:    { ring: 'ring-cyan-500',    border: 'border-cyan-500',    text: 'text-cyan-400',    glow: 'shadow-cyan-900/40' },
  blue:    { ring: 'ring-blue-500',    border: 'border-blue-500',    text: 'text-blue-400',    glow: 'shadow-blue-900/40' },
  indigo:  { ring: 'ring-indigo-500',  border: 'border-indigo-500',  text: 'text-indigo-400',  glow: 'shadow-indigo-900/40' },
  slate:   { ring: 'ring-slate-400',   border: 'border-slate-400',   text: 'text-slate-300',   glow: 'shadow-slate-900/40' },
  amber:   { ring: 'ring-amber-500',   border: 'border-amber-500',   text: 'text-amber-400',   glow: 'shadow-amber-900/40' },
};

export default function PaymentModal({ total, onCancel, onConfirm, creditBalance = 0 }) {
  const methods = useMemo(
    () => (creditBalance > 0 ? [...baseMethods, storeCreditMethod] : baseMethods),
    [creditBalance]
  );

  // Um valor por método (string para o input ser controlado)
  const [amounts, setAmounts] = useState({
    cash: '', pix: '', debit: '', credit: '', transfer: '', store_credit: '',
  });

  const numAmounts = useMemo(() => ({
    cash:         Number(amounts.cash)         || 0,
    pix:          Number(amounts.pix)          || 0,
    debit:        Number(amounts.debit)        || 0,
    credit:       Number(amounts.credit)       || 0,
    transfer:     Number(amounts.transfer)     || 0,
    // Nunca deixa lançar mais vale do que o cliente tem
    store_credit: Math.min(Number(amounts.store_credit) || 0, creditBalance),
  }), [amounts, creditBalance]);

  const paid = numAmounts.cash + numAmounts.pix + numAmounts.debit
             + numAmounts.credit + numAmounts.transfer + numAmounts.store_credit;
  const paidNonCash = numAmounts.pix + numAmounts.debit + numAmounts.credit
             + numAmounts.transfer + numAmounts.store_credit;

  // Falta sempre é em relação ao total da venda. Não considera troco como pago.
  // Mas se há dinheiro e dinheiro >= (total - paidNonCash), está coberto e o resto é troco.
  const remainingForCash = Math.max(0, total - paidNonCash);
  const remaining = Math.max(0, total - paid);
  const change = numAmounts.cash > remainingForCash ? numAmounts.cash - remainingForCash : 0;

  const covered = paid + 0.005 >= total;

  // Sugere preenchimento automático do "Falta" no input clicado
  const fillRemaining = (method) => {
    if (method === 'cash') {
      setAmounts((a) => ({ ...a, cash: remainingForCash.toFixed(2) }));
    } else {
      // Pix/Cartão = quanto falta tirando o que já é não-dinheiro + cash
      let slot = Math.max(0, total - paid + (Number(amounts[method]) || 0));
      // O vale nunca ultrapassa o saldo do cliente
      if (method === 'store_credit') slot = Math.min(slot, creditBalance);
      setAmounts((a) => ({ ...a, [method]: slot.toFixed(2) }));
    }
  };

  const clearAll = () => setAmounts({
    cash: '', pix: '', debit: '', credit: '', transfer: '', store_credit: '',
  });

  // Um input por método, para as teclas de função poderem focar direto
  const inputs = useRef({});
  const focusMethod = (v) => {
    const el = inputs.current[v];
    if (el) { el.focus(); el.select(); }
  };

  // O caixa abre esta tela já com o dinheiro em foco: é o caso mais comum,
  // e daí um Enter preenche o total e outro fecha a venda.
  useEffect(() => { focusMethod('cash'); }, []);

  const confirm = () => {
    if (!covered) return;
    const payments = methods
      .filter((m) => numAmounts[m.v] > 0.005)
      .map((m) => {
        // Quando há troco, o pagamento em dinheiro vai com o valor recebido completo
        // (o backend recebe amountReceived + changeAmount separado)
        return { method: m.v, amount: numAmounts[m.v], authorizationCode: null };
      });

    const distinctMethods = payments.map((p) => p.method);
    const paymentMethod = distinctMethods.length > 1 ? 'mixed' : distinctMethods[0];

    onConfirm({
      paymentMethod,
      payments,
      amountReceived: paid,
      changeAmount: change,
    });
  };

  // F1..F6 escolhem a forma; Enter preenche o que falta e, já coberto, fecha
  // a venda; Delete zera tudo. Nada aqui depende do mouse.
  useEffect(() => {
    const onKey = (e) => {
      const fn = e.key.match(/^F([1-9]|1[0-2])$/);
      if (fn) {
        const m = methods[Number(fn[1]) - 1];
        if (m) { e.preventDefault(); focusMethod(m.v); }
        return;
      }
      // Delete só zera tudo quando não há texto para apagar — senão roubaria
      // a tecla de quem está corrigindo um valor digitado errado.
      if (e.key === 'Delete' && !(document.activeElement?.value || '')) {
        e.preventDefault();
        clearAll();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (covered) { confirm(); return; }
        // Ainda falta: completa no campo em foco, ou no dinheiro se o foco
        // estiver fora — poupa o operador de digitar o valor exato.
        const focused = methods.find((m) => inputs.current[m.v] === document.activeElement);
        fillRemaining(focused?.v || 'cash');
        if (!focused) focusMethod('cash');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">💳 Forma de Pagamento</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Digite quanto o cliente vai pagar em cada forma. Pode misturar.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              F1…F{methods.length} escolhe · Enter completa e confirma · Delete limpa · Esc cancela
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white text-3xl leading-none w-9 h-9 flex items-center justify-center">×</button>
        </div>

        {/* ===== Painel TOTAL / PAGO / FALTA ===== */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-slate-950/70 rounded-xl p-4 text-center border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">Total da venda</div>
            <div className="text-2xl font-extrabold text-white">{brl(total)}</div>
          </div>
          <div className="bg-slate-950/70 rounded-xl p-4 text-center border border-emerald-900/50">
            <div className="text-[10px] uppercase text-emerald-500 tracking-wider mb-1">Pago</div>
            <div className="text-2xl font-extrabold text-emerald-400">{brl(paid)}</div>
          </div>
          <div className={`rounded-xl p-4 text-center border ${
            covered && change > 0 ? 'bg-emerald-950/40 border-emerald-700' :
            covered                ? 'bg-emerald-950/40 border-emerald-700' :
                                     'bg-amber-950/40 border-amber-700'}`}>
            <div className={`text-[10px] uppercase tracking-wider mb-1 ${
              covered && change > 0 ? 'text-emerald-400' :
              covered                ? 'text-emerald-400' : 'text-amber-400'}`}>
              {covered && change > 0 ? 'Troco' : covered ? 'Pago completo' : 'Falta'}
            </div>
            <div className={`text-2xl font-extrabold ${
              covered && change > 0 ? 'text-emerald-300' :
              covered                ? 'text-emerald-300' : 'text-amber-300'}`}>
              {covered && change > 0 ? brl(change)
                : covered            ? '✓'
                                     : brl(remaining)}
            </div>
          </div>
        </div>

        {/* ===== Cards de cada forma de pagamento ===== */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {methods.map((m, mi) => {
            const c = colorMap[m.color];
            const value = amounts[m.v];
            const has = numAmounts[m.v] > 0.005;
            return (
              <div key={m.v}
                   className={`bg-slate-950/50 rounded-xl border-2 p-4 transition-all ${
                     has ? `${c.border} shadow-lg ${c.glow}` : 'border-slate-800 hover:border-slate-700'
                   }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{m.icon}</span>
                    <span className={`font-bold text-sm ${has ? c.text : 'text-slate-300'}`}>{m.name}</span>
                    <kbd className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">
                      F{mi + 1}
                    </kbd>
                  </div>
                  {remaining > 0.005 && !has && (
                    <button onClick={() => fillRemaining(m.v)}
                            className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300">
                      = Falta
                    </button>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-base font-mono">R$</span>
                  <input ref={(el) => { inputs.current[m.v] = el; }}
                         type="number" step="0.01" min="0" inputMode="decimal" value={value}
                         max={m.v === 'store_credit' ? creditBalance : undefined}
                         onChange={(e) => setAmounts((a) => ({ ...a, [m.v]: e.target.value }))}
                         placeholder="0,00"
                         className={`w-full pl-10 pr-3 py-3 bg-slate-950 border rounded-lg text-white text-xl font-mono text-right focus:outline-none ${
                           has ? `${c.border} ring-2 ${c.ring}/30` : 'border-slate-700 focus:border-blue-500'
                         }`} />
                </div>

                {/* Hint do que esse campo significa */}
                <p className={`text-[10px] mt-1.5 text-center ${
                  m.v === 'store_credit' ? 'text-amber-400/80' : 'text-slate-500'
                }`}>
                  {m.v === 'cash'
                    ? (numAmounts.cash > remainingForCash
                       ? `Recebido ${brl(numAmounts.cash)} · Troco ${brl(numAmounts.cash - remainingForCash)}`
                       : 'Quanto o cliente entregou em cédulas/moedas')
                    : m.v === 'pix'          ? 'Valor transferido via Pix'
                    : m.v === 'debit'        ? 'Passado no cartão de débito'
                    : m.v === 'credit'       ? 'Passado no cartão de crédito'
                    : m.v === 'transfer'     ? 'TED/DOC já confirmada na conta da loja'
                    :                          `Saldo disponível: ${brl(creditBalance)}`}
                </p>
              </div>
            );
          })}
        </div>

        {/* ===== Aviso "Falta R$ X" ===== */}
        {!covered && paid > 0 && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-700 rounded-lg text-center">
            <span className="text-amber-300 text-sm">
              Ainda faltam <span className="font-bold text-lg">{brl(remaining)}</span> — escolha outra forma ou complete em dinheiro.
            </span>
          </div>
        )}

        {covered && change > 0 && (
          <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-700 rounded-lg text-center">
            <span className="text-emerald-300 text-sm">
              Pago ✓ · Troco em dinheiro: <span className="font-bold text-lg">{brl(change)}</span>
            </span>
          </div>
        )}

        {/* ===== Botões ===== */}
        <div className="flex gap-2 pt-2 border-t border-slate-800">
          <button onClick={onCancel}
                  className="px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg text-sm">
            Cancelar
          </button>
          <button onClick={clearAll}
                  className="px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-lg text-sm">
            🗑️ Limpar · Del
          </button>
          <button onClick={confirm} disabled={!covered}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg">
            {covered ? '✅ Confirmar venda · Enter' : `Faltam ${brl(remaining)} · Enter completa`}
          </button>
        </div>
      </div>
    </div>
  );
}
