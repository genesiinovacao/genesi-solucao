import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const columns = [
  { key: 'pending',          title: '⏳ Pendentes',     next: 'preparing',        nextLabel: 'Iniciar preparo',  color: 'amber'   },
  { key: 'preparing',        title: '👨‍🍳 Preparando',    next: 'out_for_delivery', nextLabel: 'Enviar p/ entrega', color: 'blue'    },
  { key: 'outForDelivery',   title: '🚴 Em Rota',       next: 'delivered',        nextLabel: 'Confirmar entrega', color: 'indigo'  },
  { key: 'delivered',        title: '✅ Entregues',     next: null,               nextLabel: null,                color: 'emerald' },
];

const headerColor = {
  amber:   'bg-amber-100 text-amber-800 border-amber-300',
  blue:    'bg-blue-100 text-blue-800 border-blue-300',
  indigo:  'bg-indigo-100 text-indigo-800 border-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export default function Delivery() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const empty = { customerName: '', customerPhone: '', deliveryAddress: '', itemsSummary: '', totalAmount: 0, deliveryFee: 0, paymentMethod: 'pix', notes: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    try {
      const { data } = await api.get('/api/delivery/board');
      setBoard(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);  // auto-refresh kanban a cada 15s
    return () => clearInterval(t);
  }, []);

  const move = async (id, status) => {
    try {
      await api.post(`/api/delivery/${id}/status`, { status });
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const cancel = async (id) => {
    if (!confirm('Cancelar este pedido?')) return;
    try {
      await api.post(`/api/delivery/${id}/status`, { status: 'cancelled' });
      load();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, totalAmount: Number(form.totalAmount) || 0, deliveryFee: Number(form.deliveryFee) || 0 };
      await api.post('/api/delivery', payload);
      setShowNew(false); setForm(empty); load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  const notifyWhatsApp = (order) => {
    if (!order.customerPhone) return alert('Cliente sem telefone cadastrado.');
    const phone = order.customerPhone.replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Olá ${order.customerName}! Seu pedido ${order.orderNumber} está ${
        order.status === 'out_for_delivery' ? 'A CAMINHO 🚴' : `em status: ${order.status}`
      }. Total: ${brl(order.totalAmount)}.`
    );
    window.open(`https://wa.me/55${phone}?text=${msg}`, '_blank');
  };

  if (loading) return <main className="p-10 text-slate-500">Carregando kanban…</main>;
  if (error)   return <main className="p-10 text-red-700">⚠️ {error}</main>;
  if (!board)  return null;

  const dataByKey = {
    pending: board.pending,
    preparing: board.preparing,
    outForDelivery: board.outForDelivery,
    delivered: board.delivered,
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🚴 Delivery</h1>
          <p className="text-sm text-slate-500 mt-1">Kanban de pedidos · atualiza sozinho a cada 15s</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
          ➕ Novo Pedido
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
        {columns.map((col) => {
          const items = dataByKey[col.key] || [];
          return (
            <div key={col.key} className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
              <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b ${headerColor[col.color]}`}>
                <span className="font-bold text-sm">{col.title}</span>
                <span className="bg-white/70 text-xs font-bold px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {items.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Vazio</p>}
                {items.map((o) => (
                  <div key={o.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-slate-800">{o.orderNumber}</span>
                      <span className="text-xs text-slate-500">{fmtTime(o.requestedAt)}</span>
                    </div>
                    <div className="font-medium text-slate-700 text-sm">{o.customerName}</div>
                    {o.customerPhone && <div className="text-xs text-slate-500">{o.customerPhone}</div>}
                    <div className="text-xs text-slate-600 mt-1 line-clamp-2">📍 {o.deliveryAddress}</div>
                    {o.itemsSummary && <div className="text-xs text-slate-500 mt-1 italic line-clamp-2">{o.itemsSummary}</div>}
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
                      <span className="font-bold text-blue-600">{brl(o.totalAmount + (o.deliveryFee || 0))}</span>
                      <span className="text-xs text-slate-500">{o.paymentMethod}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {col.next && (
                        <button onClick={() => move(o.id, col.next)}
                                className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold">
                          ➡️ {col.nextLabel}
                        </button>
                      )}
                      {o.customerPhone && (
                        <button onClick={() => notifyWhatsApp(o)} title="Notificar via WhatsApp"
                                className="px-2 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs">
                          📱
                        </button>
                      )}
                      {col.key !== 'delivered' && (
                        <button onClick={() => cancel(o.id)} title="Cancelar"
                                className="px-2 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-xs">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={() => setShowNew(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create}
                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <header className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">🚴 Novo pedido de Delivery</h2>
            </header>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cliente *</label>
                  <input required type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
                  <input type="text" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço *</label>
                <input required type="text" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Itens (texto livre)</label>
                <textarea rows={2} value={form.itemsSummary} onChange={(e) => setForm({ ...form, itemsSummary: e.target.value })}
                          placeholder="Ex: 2x Pão de Queijo, 1x Café"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total R$</label>
                  <input required type="number" step="0.01" min="0" value={form.totalAmount}
                         onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Frete R$</label>
                  <input type="number" step="0.01" min="0" value={form.deliveryFee}
                         onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pagamento</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="pix">Pix</option>
                    <option value="cash">Dinheiro</option>
                    <option value="debit">Débito</option>
                    <option value="credit">Crédito</option>
                  </select>
                </div>
              </div>
            </div>
            <footer className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Criando…' : '🚴 Criar Pedido'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
