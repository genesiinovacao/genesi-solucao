import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const dt = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const paymentLabel = {
  cash: '💵 Dinheiro',
  pix: '⚡ Pix',
  credit: '💳 Crédito',
  debit: '💳 Débito',
  mixed: '🔀 Misto',
  crediario: '📝 Crediário',
  transfer: '🏦 Transferência',
  store_credit: '🎟️ Vale crédito',
};

const statusBadge = (s) => {
  if (s === 'completed') return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Concluída</span>;
  if (s === 'cancelled') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelada</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{s}</span>;
};

export default function Sales() {
  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fiscalDoc, setFiscalDoc] = useState(null);
  const [fiscalBusy, setFiscalBusy] = useState(false);

  const loadFiscal = async (saleId) => {
    try {
      const { data: d } = await api.get(`/api/fiscal/sales/${saleId}`);
      setFiscalDoc(d);
    } catch { setFiscalDoc(null); }
  };

  const emitFiscal = async (saleId) => {
    setFiscalBusy(true);
    try {
      const { data: d } = await api.post(`/api/fiscal/sales/${saleId}/emit`, { documentType: 'nfce' });
      setFiscalDoc(d);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally { setFiscalBusy(false); }
  };

  const downloadXml = async () => {
    try {
      const { data: xml } = await api.get(`/api/fiscal/documents/${fiscalDoc.id}/xml`, { responseType: 'text' });
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const cancelFiscal = async () => {
    const reason = prompt('Justificativa do cancelamento (mínimo 15 caracteres):');
    if (!reason) return;
    setFiscalBusy(true);
    try {
      const { data: d } = await api.post(`/api/fiscal/documents/${fiscalDoc.id}/cancel`, { reason });
      setFiscalDoc(d);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally { setFiscalBusy(false); }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/api/sales', {
        params: {
          page, pageSize: 20,
          from: from || undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        },
      });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page]);

  const applyFilter = (e) => { e.preventDefault(); setPage(1); load(); };

  const openDetail = async (id) => {
    setDetailLoading(true);
    setSelected({ id });
    setFiscalDoc(null);
    try {
      const { data: d } = await api.get(`/api/sales/${id}`);
      setSelected(d);
      loadFiscal(id);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🧾 Vendas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Histórico de vendas registradas (PDV envia via sincronização — Fase 3).
        </p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={applyFilter} className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                   className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                   className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            Filtrar
          </button>
          <button type="button" onClick={() => { setFrom(''); setTo(''); setPage(1); load(); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Limpar</button>
          <div className="text-sm text-slate-500 ml-auto">
            <span className="font-semibold text-slate-800">{data.totalCount}</span> venda(s)
          </div>
        </form>

        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">⚠️ {error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Data/Hora</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Itens</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                  Nenhuma venda registrada ainda.<br/>
                  <span className="text-xs">As vendas serão criadas pelo PDV na Fase 3.</span>
                </td></tr>
              )}
              {!loading && data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(s.id)}>
                  <td className="px-4 py-3 text-slate-700">{dt(s.saleDate)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.sellerName || <span className="text-slate-400 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.customerName || <span className="text-slate-400 italic">Sem cliente</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.itemCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{brl(s.totalAmount)}</td>
                  <td className="px-4 py-3 text-slate-600">{paymentLabel[s.paymentMethod] || s.paymentMethod}</td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); openDetail(s.id); }} className="text-blue-600 hover:underline text-sm">Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm">
            <span className="text-slate-500">Página {data.page} de {data.totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                      className="px-4 py-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages}
                      className="px-4 py-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40">Próxima →</button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <header className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">🧾 Detalhes da Venda</h2>
              {selected.saleDate && <p className="text-xs text-slate-500 mt-1">{dt(selected.saleDate)}</p>}
            </header>
            <div className="p-6">
              {detailLoading || !selected.items ? (
                <p className="text-center text-slate-500 py-10">Carregando…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Cliente</p>
                      <p className="font-medium text-slate-800">{selected.customerName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Pagamento</p>
                      <p className="font-medium text-slate-800">{paymentLabel[selected.paymentMethod] || selected.paymentMethod}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Vendedor</p>
                      <p className="font-medium text-slate-800">{selected.sellerName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Terminal</p>
                      <p className="font-medium text-slate-800">{selected.posTerminalId || '—'}</p>
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-700 mb-2 text-sm">Itens</h3>
                  <table className="w-full text-sm mb-6">
                    <thead className="text-xs text-slate-500 border-b">
                      <tr><th className="text-left py-2">Produto</th><th className="text-right">Qtd</th><th className="text-right">Unit.</th><th className="text-right">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.items.map((i) => (
                        <tr key={i.id}>
                          <td className="py-2 text-slate-700">{i.productName}</td>
                          <td className="text-right text-slate-600">{i.quantity}</td>
                          <td className="text-right text-slate-600">{brl(i.unitPrice)}</td>
                          <td className="text-right font-semibold text-slate-800">{brl(i.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{brl(selected.subtotal)}</span></div>
                    {selected.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600"><span>Desconto</span><span>- {brl(selected.discountAmount)}</span></div>
                    )}
                    {selected.surchargeAmount > 0 && (
                      <div className="flex justify-between text-orange-600"><span>Acréscimo</span><span>+ {brl(selected.surchargeAmount)}</span></div>
                    )}
                    <div className="flex justify-between text-lg font-bold text-slate-800 pt-2 border-t mt-2">
                      <span>Total</span><span>{brl(selected.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <h3 className="font-semibold text-slate-700 text-sm mb-2">📄 Documento Fiscal (NFC-e)</h3>
                    {!fiscalDoc ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-500">Nenhum documento emitido para esta venda.</p>
                        {selected.status !== 'cancelled' && (
                          <button onClick={() => emitFiscal(selected.id)} disabled={fiscalBusy}
                                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 shrink-0">
                            {fiscalBusy ? 'Emitindo…' : 'Emitir NFC-e'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span>
                            {fiscalDoc.status === 'authorized' && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Autorizada</span>}
                            {fiscalDoc.status === 'cancelled' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelada</span>}
                            {fiscalDoc.status === 'rejected' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Rejeitada</span>}
                            <span className="ml-2 text-slate-600">nº {fiscalDoc.number} · série {fiscalDoc.series}</span>
                            {fiscalDoc.environment === 'homologation' && (
                              <span className="ml-2 text-xs text-amber-600" title="Documento simulado — sem valor fiscal">🧪 homologação</span>
                            )}
                          </span>
                          <span className="flex gap-2 shrink-0">
                            <button onClick={downloadXml} className="text-blue-600 hover:underline text-xs">Ver XML</button>
                            {fiscalDoc.status === 'authorized' && (
                              <button onClick={cancelFiscal} disabled={fiscalBusy}
                                      className="text-red-600 hover:underline text-xs disabled:opacity-50">Cancelar</button>
                            )}
                            {fiscalDoc.status === 'rejected' && (
                              <button onClick={() => emitFiscal(selected.id)} disabled={fiscalBusy}
                                      className="text-indigo-600 hover:underline text-xs disabled:opacity-50">Reemitir</button>
                            )}
                          </span>
                        </div>
                        {fiscalDoc.accessKey && (
                          <p className="text-xs text-slate-400 font-mono break-all">Chave: {fiscalDoc.accessKey}</p>
                        )}
                        {fiscalDoc.rejectionReason && (
                          <p className="text-xs text-slate-500">Motivo: {fiscalDoc.rejectionReason}</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <footer className="p-4 border-t border-slate-200 flex justify-end">
              <button onClick={() => setSelected(null)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Fechar</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
