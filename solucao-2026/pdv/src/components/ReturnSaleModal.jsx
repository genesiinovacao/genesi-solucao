import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

// Devolução de venda (parcial ou total).
// Fluxo: escolhe venda recente → marca quantidade por item → escolhe método
// de reembolso → POST /api/sales/{id}/returns. O backend ajusta estoque,
// status da venda e (se for 'customer_credit') o saldo do cliente.
const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const dtShort = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function ReturnSaleModal({ onClose, onDone }) {
  const [step, setStep] = useState('pick');      // 'pick' | 'edit'
  const [sales, setSales] = useState([]);        // últimas vendas
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState('');

  const [sale, setSale] = useState(null);        // venda escolhida (com items/payments)
  const [qtyByItem, setQtyByItem] = useState({}); // { saleItemId: number }
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Devolução feita pelo caixa precisa de aval do gerente (validado no servidor)
  const [supCode, setSupCode] = useState('');
  const [supPin, setSupPin] = useState('');
  const [needsSupervisor, setNeedsSupervisor] = useState(false);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    setLoadingList(true);
    try {
      const { data } = await api.get('/api/sales', { params: { pageSize: 30 } });
      setSales(data.items || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoadingList(false);
    }
  };

  const pickSale = async (s) => {
    setError('');
    try {
      const { data } = await api.get(`/api/sales/${s.id}`);
      setSale(data);
      const initial = {};
      (data.items || []).forEach((it) => { initial[it.id] = 0; });
      setQtyByItem(initial);
      if (data.customerId) setRefundMethod('customer_credit');
      else setRefundMethod('cash');
      setStep('edit');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const totalRefund = useMemo(() => {
    if (!sale) return 0;
    return sale.items.reduce((sum, it) => sum + (Number(qtyByItem[it.id] || 0) * it.unitPrice), 0);
  }, [qtyByItem, sale]);

  const anySelected = totalRefund > 0;

  const submit = async () => {
    if (!sale || !anySelected) return;
    setSubmitting(true);
    setError('');
    try {
      const items = Object.entries(qtyByItem)
        .filter(([, q]) => Number(q) > 0)
        .map(([saleItemId, q]) => ({ saleItemId, quantity: Number(q) }));
      const { data } = await api.post(`/api/sales/${sale.id}/returns`, {
        items, refundMethod, reason: reason.trim() || null,
        supervisorCode: supCode.trim() || null,
        supervisorPin: supPin.trim() || null,
      });
      onDone?.(data);
    } catch (err) {
      // 403 com requiresSupervisor: mostra os campos e deixa o gerente liberar
      if (err.response?.data?.requiresSupervisor) setNeedsSupervisor(true);
      setError(err.response?.data?.error || err.message);
      setSupPin('');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSales = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return sales;
    return sales.filter((x) =>
      x.id.toLowerCase().startsWith(s) ||
      (x.customerName || '').toLowerCase().includes(s) ||
      (x.sellerName || '').toLowerCase().includes(s)
    );
  }, [search, sales]);

  // Escolha da venda por teclado: ↑/↓ percorre, Enter abre. Sem isto o
  // operador precisaria do mouse justo na tela que ele mais evita.
  const [pickIdx, setPickIdx] = useState(0);
  const listRef = useRef(null);
  const safeIdx = Math.min(pickIdx, Math.max(0, filteredSales.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [safeIdx, filteredSales.length]);

  const onPickKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPickIdx(Math.min(filteredSales.length - 1, safeIdx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPickIdx(Math.max(0, safeIdx - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const s = filteredSales[safeIdx];
      if (s && s.status !== 'returned' && s.status !== 'cancelled') pickSale(s);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">↩️ Devolução de Venda</h2>
            <p className="text-xs text-slate-400 mt-1">
              {step === 'pick' ? 'Escolha a venda a ser devolvida.' : `Venda ${sale?.id.slice(0, 8).toUpperCase()} · ${dtShort(sale?.saleDate)}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </header>

        {error && (
          <div className="mx-5 mt-4 text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3">⚠️ {error}</div>
        )}

        {/* ===== Step 1: pick sale ===== */}
        {step === 'pick' && (
          <>
            <div className="p-5 border-b border-slate-800">
              <input type="text" autoFocus value={search} onKeyDown={onPickKey}
                     onChange={(e) => { setSearch(e.target.value); setPickIdx(0); }}
                     placeholder="🔍 Filtrar por ID da venda, cliente ou vendedor..."
                     className="w-full bg-slate-950 border border-slate-700 px-4 py-3 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
              <p className="text-[11px] text-slate-500 mt-2">↑ ↓ escolhe · Enter abre · Esc fecha</p>
            </div>
            <div ref={listRef} className="flex-1 overflow-auto custom-scrollbar">
              {loadingList && <p className="text-center text-slate-500 py-10">Carregando vendas...</p>}
              {!loadingList && filteredSales.length === 0 && (
                <p className="text-center text-slate-500 py-10 text-sm">Nenhuma venda encontrada.</p>
              )}
              {!loadingList && filteredSales.map((s, i) => {
                const isReturnable = s.status !== 'returned' && s.status !== 'cancelled';
                return (
                  <button key={s.id} data-on={i === safeIdx}
                          onClick={() => isReturnable && pickSale(s)} disabled={!isReturnable}
                          onMouseEnter={() => setPickIdx(i)}
                          className={`w-full text-left px-5 py-3 border-b border-slate-800/50 flex items-center justify-between transition ${
                            i === safeIdx ? 'bg-blue-950/40' : ''
                          } ${isReturnable ? 'hover:bg-slate-800/50 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-blue-400">#{s.id.slice(0, 8).toUpperCase()}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {dtShort(s.saleDate)} · {s.itemCount} item(s) · {s.customerName || 'Sem cliente'}
                        {s.sellerName && ` · 👤 ${s.sellerName}`}
                      </div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <div className="font-bold text-white">{brl(s.totalAmount)}</div>
                      <div className={`text-[10px] mt-0.5 inline-block px-2 py-0.5 rounded-full ${
                        s.status === 'completed' ? 'bg-emerald-900/40 text-emerald-300' :
                        s.status === 'partial_returned' ? 'bg-amber-900/40 text-amber-300' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {s.status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ===== Step 2: pick items + method ===== */}
        {step === 'edit' && sale && (
          <>
            <div className="flex-1 overflow-auto custom-scrollbar p-5 space-y-4">
              <div className="bg-slate-950/50 rounded-lg p-3 text-xs text-slate-300 grid grid-cols-3 gap-3">
                <div><div className="text-slate-500">Total da venda</div><div className="text-white font-bold text-base">{brl(sale.totalAmount)}</div></div>
                <div><div className="text-slate-500">Pagamento</div><div className="text-white font-bold text-base">{sale.paymentMethod}</div></div>
                <div><div className="text-slate-500">Cliente</div><div className="text-white font-bold text-base truncate">{sale.customerName || '—'}</div></div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Itens da venda</h3>
                <div className="border border-slate-800 rounded-lg divide-y divide-slate-800">
                  {sale.items.map((it) => {
                    const q = qtyByItem[it.id] || 0;
                    return (
                      <div key={it.id} className="p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-white truncate">{it.productName}</div>
                          <div className="text-xs text-slate-400">{brl(it.unitPrice)} × {it.quantity}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-400">Devolver:</label>
                          <input type="number" min="0" max={it.quantity} step="any" value={q}
                                 onChange={(e) => setQtyByItem({ ...qtyByItem, [it.id]: Math.min(it.quantity, Math.max(0, Number(e.target.value) || 0)) })}
                                 className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-right text-white text-sm" />
                          <button onClick={() => setQtyByItem({ ...qtyByItem, [it.id]: it.quantity })}
                                  className="text-xs text-blue-400 hover:text-blue-300">tudo</button>
                        </div>
                        <div className="w-24 text-right text-sm font-mono text-emerald-400">
                          {brl(q * it.unitPrice)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">Reembolso</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 'cash', l: '💵 Dinheiro' },
                      { v: 'pix', l: '📱 Pix' },
                      { v: 'credit', l: '💳 Estorno cartão' },
                      { v: 'customer_credit', l: '⭐ Crédito do cliente' },
                    ].map((opt) => {
                      const disabled = opt.v === 'customer_credit' && !sale.customerId;
                      return (
                        <button key={opt.v} type="button" onClick={() => !disabled && setRefundMethod(opt.v)} disabled={disabled}
                                className={`px-3 py-2.5 rounded-lg text-xs font-medium transition border ${
                                  refundMethod === opt.v
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
                                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                          {opt.l}
                        </button>
                      );
                    })}
                  </div>
                  {refundMethod === 'customer_credit' && !sale.customerId && (
                    <p className="text-xs text-amber-400 mt-1.5">Venda sem cliente — escolha outro método.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">Motivo (opcional)</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={500}
                            placeholder="Ex: Defeito de fábrica, cliente arrependido..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none" />
                </div>
              </div>

              {needsSupervisor && (
                <div className="border border-amber-700 bg-amber-950/30 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-amber-300 font-semibold">🔑 Autorização do gerente</p>
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    <input type="text" value={supCode} onChange={(e) => setSupCode(e.target.value.toUpperCase())}
                           placeholder="Código" maxLength={10} autoFocus
                           className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-center font-mono focus:border-amber-500 focus:outline-none" />
                    <input type="password" inputMode="numeric" value={supPin} maxLength={8}
                           onChange={(e) => setSupPin(e.target.value.replace(/\D/g, ''))}
                           onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                           placeholder="PIN"
                           className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-center font-mono tracking-widest focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
              )}
            </div>

            <footer className="p-5 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Reembolso total</div>
                <div className="text-2xl font-extrabold text-emerald-400">{brl(totalRefund)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setStep('pick'); setSale(null); setError(''); }}
                        className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm">
                  ← Outra venda
                </button>
                <button onClick={submit} disabled={!anySelected || submitting}
                        className="px-6 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold rounded-lg text-sm">
                  {submitting ? 'Processando...' : '↩️ Confirmar devolução'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
