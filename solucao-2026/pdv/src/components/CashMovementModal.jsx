import { useState } from 'react';
import { api } from '../lib/api';

// Sangria (retirada) ou Suprimento (entrada) de dinheiro no caixa.
// Ambos viram registros em cash_movements e entram no cálculo do Z report
// (esperado_no_caixa = abertura + vendas_dinheiro + suprimentos - sangrias).
export default function CashMovementModal({ sessionId, onClose, onDone }) {
  const [type, setType] = useState('withdraw'); // 'withdraw' = sangria | 'supply' = suprimento
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Sangria feita pelo caixa precisa de aval do gerente (validado no servidor)
  const [supCode, setSupCode] = useState('');
  const [supPin, setSupPin] = useState('');
  const [needsSupervisor, setNeedsSupervisor] = useState(false);

  const isWithdraw = type === 'withdraw';

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) { setError('Informe um valor maior que zero.'); return; }
    if (!reason.trim()) { setError('Informe o motivo.'); return; }

    setLoading(true);
    setError('');
    try {
      await api.post(`/api/cash-sessions/${sessionId}/movements`, {
        type, amount: value, reason: reason.trim(),
        supervisorCode: supCode.trim() || null,
        supervisorPin: supPin.trim() || null,
      });
      onDone?.({ type, amount: value, reason: reason.trim() });
    } catch (err) {
      // 403 com requiresSupervisor: mostra os campos e deixa o gerente liberar
      if (err.response?.data?.requiresSupervisor) setNeedsSupervisor(true);
      setError(err.response?.data?.error || err.message);
      setSupPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">💵 Movimentação de Caixa</h2>
            <p className="text-xs text-slate-400 mt-1">Sangria (retirada) ou Suprimento (entrada).</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* Toggle tipo */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-700 rounded-lg">
            <button type="button" onClick={() => setType('withdraw')}
                    className={`py-3 rounded-md text-sm font-semibold transition ${
                      isWithdraw ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}>
              ↓ Sangria
            </button>
            <button type="button" onClick={() => setType('supply')}
                    className={`py-3 rounded-md text-sm font-semibold transition ${
                      !isWithdraw ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}>
              ↑ Suprimento
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Valor (R$)
            </label>
            <input type="number" step="0.01" min="0" autoFocus value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   className="w-full px-4 py-4 bg-slate-950 border border-slate-700 rounded-lg text-white text-3xl text-center font-mono focus:border-blue-500 focus:outline-none"
                   placeholder="0,00" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Motivo
            </label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                   placeholder={isWithdraw ? 'Ex: Pagamento de fornecedor, troco extra...' : 'Ex: Reforço de troco, reposição...'}
                   className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none text-sm" />
          </div>

          {needsSupervisor && isWithdraw && (
            <div className="border border-amber-700 bg-amber-950/30 rounded-lg p-3 space-y-2">
              <p className="text-xs text-amber-300 font-semibold">🔑 Autorização do gerente</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={supCode} onChange={(e) => setSupCode(e.target.value.toUpperCase())}
                       placeholder="Código" maxLength={10} autoFocus
                       className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-center font-mono focus:border-amber-500 focus:outline-none" />
                <input type="password" inputMode="numeric" value={supPin} maxLength={8}
                       onChange={(e) => setSupPin(e.target.value.replace(/\D/g, ''))}
                       placeholder="PIN"
                       className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-center font-mono tracking-widest focus:border-amber-500 focus:outline-none" />
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3">⚠️ {error}</div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
                    className={`flex-1 text-white font-bold py-3 rounded-lg disabled:opacity-50 ${
                      isWithdraw ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}>
              {loading ? 'Registrando…' : (isWithdraw ? '↓ Confirmar Sangria' : '↑ Confirmar Suprimento')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
