import { useState } from 'react';
import { api } from '../lib/api';
import { cashSession } from '../lib/cashSession';

export default function OpenCashModal({ onOpened }) {
  const [opening, setOpening] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/api/cash-sessions/open', {
        openingAmount: Number(opening) || 0,
        posTerminalId: 'pdv-electron-01',
      });
      cashSession.set(data.id);
      onOpened(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">💰</div>
          <h2 className="text-2xl font-bold text-white">Abertura de Caixa</h2>
          <p className="text-sm text-slate-400 mt-1">Informe o valor de troco inicial em dinheiro.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Fundo de troco (R$)
            </label>
            <input type="number" step="0.01" min="0" autoFocus value={opening}
                   onChange={(e) => setOpening(e.target.value)}
                   className="w-full px-4 py-4 bg-slate-950 border border-slate-700 rounded-lg text-white text-3xl text-center font-mono focus:border-blue-500 focus:outline-none" />
          </div>
          {error && (
            <div className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3">⚠️ {error}</div>
          )}
          <button type="submit" disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-4 rounded-lg text-lg">
            {loading ? 'Abrindo…' : '🔓 Abrir Caixa'}
          </button>
        </form>
      </div>
    </div>
  );
}
