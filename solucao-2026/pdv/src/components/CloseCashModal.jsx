import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cashSession } from '../lib/cashSession';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const dt  = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const methodLabels = {
  cash:      '💵 Dinheiro',
  pix:       '⚡ Pix',
  credit:    '💳 Crédito',
  debit:     '💳 Débito',
  mixed:     '🔀 Misto',
  crediario: '📝 Crediário',
};

export default function CloseCashModal({ sessionId, onClose, onClosed, syncBeforeClose }) {
  const [summary, setSummary] = useState(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [closedZ, setClosedZ] = useState(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      // Garante que vendas offline foram para o servidor antes de calcular o Z
      if (syncBeforeClose) await syncBeforeClose();
      const { data } = await api.get(`/api/cash-sessions/${sessionId}/summary`);
      setSummary(data);
      setCounted(String(data.expectedCash));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [sessionId]);

  const submitClose = async () => {
    setClosing(true);
    setError('');
    try {
      const { data } = await api.post(`/api/cash-sessions/${sessionId}/close`, {
        closingAmount: Number(counted) || 0,
        notes: notes || null,
      });
      cashSession.clear();
      setClosedZ(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setClosing(false);
    }
  };

  // Tela 2: depois de fechar, mostra o Z
  if (closedZ) {
    const diff = closedZ.session.difference;
    const ok = Math.abs(diff) < 0.005;
    return (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">{ok ? '✅' : '⚠️'}</div>
            <h2 className="text-2xl font-bold text-white">Caixa fechado</h2>
            <p className="text-sm text-slate-400 mt-1">{dt(closedZ.session.openedAt)} → {dt(closedZ.session.closedAt)}</p>
          </div>

          <div className="bg-slate-950/50 rounded-lg p-5 space-y-2 mb-4 font-mono text-sm">
            <Row label="Fundo de troco"    value={brl(closedZ.session.openingAmount)} />
            <Row label="Vendas em dinheiro" value={brl(closedZ.summary.cashSales)} />
            <Row label="Sangrias"           value={'- ' + brl(closedZ.summary.withdraws)} />
            <Row label="Suprimentos"        value={'+ ' + brl(closedZ.summary.supplies)} />
            <div className="border-t border-slate-700 pt-2 mt-2">
              <Row label="Esperado em caixa" value={brl(closedZ.session.expectedAmount)} bold />
              <Row label="Contado"           value={brl(closedZ.session.closingAmount)} bold />
              <Row label={ok ? 'Diferença' : (diff > 0 ? 'Sobra' : 'Falta')}
                   value={brl(Math.abs(diff))}
                   highlight={ok ? 'emerald' : 'rose'} bold />
            </div>
          </div>

          <div className="bg-slate-950/50 rounded-lg p-4 mb-6 text-xs text-slate-300">
            <p className="font-semibold mb-2 uppercase text-slate-400">Vendas por método</p>
            {Object.keys(closedZ.summary.salesByMethod).length === 0 && <p className="text-slate-500">Nenhuma venda.</p>}
            {Object.entries(closedZ.summary.salesByMethod).map(([m, v]) => (
              <div key={m} className="flex justify-between py-0.5">
                <span>{methodLabels[m] || m}</span>
                <span>{brl(v)}</span>
              </div>
            ))}
            <div className="border-t border-slate-700 mt-2 pt-1 flex justify-between font-semibold text-slate-200">
              <span>{closedZ.summary.salesCount} venda(s)</span>
              <span>{brl(closedZ.summary.totalSales)}</span>
            </div>
          </div>

          <button onClick={() => onClosed(closedZ)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg">
            Concluir (sair do PDV)
          </button>
        </div>
      </div>
    );
  }

  // Tela 1: contagem do caixa
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">🔒 Fechamento de Caixa</h2>
            <p className="text-sm text-slate-400 mt-1">Confira os valores e conte o dinheiro do caixa.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">×</button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-10">Calculando movimento do caixa…</p>
        ) : !summary ? (
          <p className="text-center text-rose-400 py-10">Não foi possível carregar.</p>
        ) : (
          <>
            <div className="bg-slate-950/50 rounded-lg p-4 space-y-2 mb-5 font-mono text-sm">
              <Row label="Aberto em" value={dt(summary.openedAt)} />
              <Row label="Fundo de troco" value={brl(summary.openingAmount)} />
              <Row label="+ Vendas em dinheiro" value={brl(summary.cashSales)} />
              <Row label="+ Suprimentos" value={brl(summary.supplies)} />
              <Row label="- Sangrias" value={brl(summary.withdraws)} />
              <div className="border-t border-slate-700 pt-2 mt-2">
                <Row label="Esperado em caixa" value={brl(summary.expectedCash)} bold highlight="blue" />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                💵 Dinheiro contado (R$)
              </label>
              <input type="number" step="0.01" min="0" autoFocus value={counted}
                     onChange={(e) => setCounted(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter' && counted !== '') { e.preventDefault(); submitClose(); } }}
                     className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white text-2xl text-center font-mono focus:border-blue-500 focus:outline-none" />
              {counted !== '' && !isNaN(Number(counted)) && (
                <p className={`text-center text-sm mt-2 font-semibold ${Math.abs(Number(counted) - summary.expectedCash) < 0.005 ? 'text-emerald-400' : (Number(counted) > summary.expectedCash ? 'text-amber-400' : 'text-rose-400')}`}>
                  {Math.abs(Number(counted) - summary.expectedCash) < 0.005
                    ? '✅ Caixa bate.'
                    : (Number(counted) > summary.expectedCash
                       ? `Sobra: ${brl(Number(counted) - summary.expectedCash)}`
                       : `Falta: ${brl(summary.expectedCash - Number(counted))}`)}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Observações (opcional)
              </label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            {error && <div className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3 mb-3">⚠️ {error}</div>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg">Cancelar</button>
              <button onClick={submitClose} disabled={closing}
                      className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg">
                {closing ? 'Fechando…' : '🔒 Fechar Caixa'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold, highlight }) {
  const colorClass = highlight === 'emerald' ? 'text-emerald-400'
                  : highlight === 'rose' ? 'text-rose-400'
                  : highlight === 'blue' ? 'text-blue-400'
                  : 'text-slate-200';
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${colorClass}`}>{value}</span>
    </div>
  );
}
