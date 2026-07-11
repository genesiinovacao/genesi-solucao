import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR');

const targetLabels = { product: '📦 Produto', category: '📁 Categoria', loyalty: '⭐ Fidelidade', total: '🛒 Compra total' };

export default function Promotions() {
  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState('all');
  const [page, setPage] = useState(1);

  const emptyForm = { name: '', discountPercent: 10, targetType: 'category', targetValue: '', startsAt: new Date().toISOString().slice(0, 10), endsAt: '', isActive: true };
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/api/promotions', {
        params: { page, pageSize: 20, state: state === 'all' ? undefined : state },
      });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, state]);

  const openCreate = () => { setEditing('new'); setForm(emptyForm); };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      name: p.name, discountPercent: p.discountPercent,
      targetType: p.targetType, targetValue: p.targetValue || '',
      startsAt: p.startsAt, endsAt: p.endsAt, isActive: p.isActive,
    });
  };
  const close = () => { setEditing(null); setForm(emptyForm); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, discountPercent: Number(form.discountPercent) };
      if (editing === 'new') await api.post('/api/promotions', payload);
      else                    await api.put(`/api/promotions/${editing}`, payload);
      close();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p) => {
    try {
      await api.post(`/api/promotions/${p.id}/toggle`);
      await load();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  const remove = async (p) => {
    if (!confirm(`Excluir promoção "${p.name}"?`)) return;
    try {
      await api.delete(`/api/promotions/${p.id}`);
      await load();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  const isCurrentlyActive = (p) => {
    const today = new Date().toISOString().slice(0, 10);
    return p.isActive && p.startsAt <= today && p.endsAt >= today;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🏷️ Promoções</h1>
          <p className="text-sm text-slate-500 mt-1">Campanhas e descontos por produto, categoria ou fidelidade.</p>
        </div>
        <button onClick={openCreate} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
          ➕ Nova Promoção
        </button>
      </header>

      <div className="flex gap-1 mb-4">
        {[{ k: 'all', l: 'Todas' }, { k: 'active', l: '🟢 Ativas' }, { k: 'expired', l: '⏰ Encerradas' }].map((t) => (
          <button key={t.k} onClick={() => { setPage(1); setState(t.k); }}
                  className={`px-4 py-2 text-sm rounded-lg ${state === t.k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {t.l}
          </button>
        ))}
        <div className="text-sm text-slate-500 ml-auto self-center"><span className="font-semibold text-slate-800">{data.totalCount}</span> promoção(ões)</div>
      </div>

      {error && <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">⚠️ {error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <p className="col-span-3 text-center text-slate-500 py-10">Carregando…</p>}
        {!loading && data.items.length === 0 && <p className="col-span-3 text-center text-slate-500 py-10">Nenhuma promoção.</p>}
        {!loading && data.items.map((p) => {
          const active = isCurrentlyActive(p);
          return (
            <div key={p.id} className={`bg-white rounded-xl shadow-sm border p-5 relative overflow-hidden ${active ? 'border-emerald-200' : 'border-slate-200 opacity-75'}`}>
              {active && <span className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">ATIVA</span>}
              <h3 className="font-bold text-slate-800 text-lg mb-1 pr-16">{p.name}</h3>
              <p className="text-xs text-slate-500 mb-3">
                {targetLabels[p.targetType] || p.targetType}{p.targetValue ? ` · ${p.targetValue}` : ''}
              </p>
              <div className="text-3xl font-extrabold text-blue-600 mb-2">{p.discountPercent}%<span className="text-base font-medium text-slate-500"> OFF</span></div>
              <p className="text-xs text-slate-500 mb-4">
                {fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}
              </p>
              <div className="flex justify-between text-xs text-slate-600 mb-4 border-t pt-3">
                <span>🛒 {p.salesCount} venda(s)</span>
                <span>💸 {brl(p.totalSavings)} economizados</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggle(p)} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${p.isActive ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}>
                  {p.isActive ? '⏸️ Pausar' : '▶️ Ativar'}
                </button>
                <button onClick={() => openEdit(p)} className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200">✏️ Editar</button>
                <button onClick={() => remove(p)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-100 text-red-800 hover:bg-red-200">🗑️</button>
              </div>
            </div>
          );
        })}
      </div>

      {data.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2 text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-1.5 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
          <span className="px-4 py-1.5 text-slate-500">Página {data.page} de {data.totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className="px-4 py-1.5 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40">Próxima →</button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={close}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <form onSubmit={save}>
              <header className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800">{editing === 'new' ? '➕ Nova Promoção' : '✏️ Editar Promoção'}</h2>
              </header>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
                  <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                         placeholder="Ex: Semana do Café"
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Desconto (%) *</label>
                    <input required type="number" min="0" max="100" step="0.5" value={form.discountPercent}
                           onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo *</label>
                    <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="product">Produto</option>
                      <option value="category">Categoria</option>
                      <option value="loyalty">Fidelidade</option>
                      <option value="total">Compra total</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alvo</label>
                  <input type="text" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                         placeholder="Ex: Mercearia, ou nome do produto, ou gold"
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Início *</label>
                    <input required type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fim *</label>
                    <input required type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                {editing !== 'new' && (
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                           className="accent-blue-600" />
                    Promoção ativa
                  </label>
                )}
              </div>
              <footer className="p-4 border-t border-slate-200 flex justify-end gap-2">
                <button type="button" onClick={close} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'Salvando…' : '💾 Salvar'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
