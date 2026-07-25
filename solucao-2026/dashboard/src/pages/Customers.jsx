import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const tierBadge = (tier) => {
  const map = {
    gold:   { label: '🥇 Gold',   cls: 'bg-yellow-100 text-yellow-800' },
    silver: { label: '🥈 Silver', cls: 'bg-slate-200 text-slate-700' },
    bronze: { label: '🥉 Bronze', cls: 'bg-orange-100 text-orange-800' },
  };
  const m = map[tier] || map.bronze;
  return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${m.cls}`}>{m.label}</span>;
};

const initialsOf = (name) =>
  name?.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export default function Customers() {
  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [page, setPage] = useState(1);

  // Modal de cadastro/edição
  const [editing, setEditing] = useState(null);
  const emptyForm = { name: '', taxId: '', email: '', phone: '', address: '', loyaltyPoints: 0, status: 'active', birthDate: '', notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/api/customers', {
        params: { page, pageSize: 20, search: search || undefined, tier: tier || undefined },
      });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, tier]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); load(); };

  const openCreate = () => { setEditing('new'); setForm(emptyForm); };
  const openEdit = (c) => {
    setEditing(c.id);
    setForm({
      name: c.name || '',
      taxId: c.taxId || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      loyaltyPoints: c.loyaltyPoints || 0,
      status: c.status || 'active',
      birthDate: c.birthDate || '',
      notes: '',
    });
  };
  const close = () => { setEditing(null); setForm(emptyForm); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        loyaltyPoints: Number(form.loyaltyPoints) || 0,
        birthDate: form.birthDate || null,
      };
      if (editing === 'new') {
        await api.post('/api/customers', payload);
      } else {
        await api.put(`/api/customers/${editing}`, payload);
      }
      close();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!confirm(`Inativar cliente "${c.name}"?`)) return;
    try {
      await api.delete(`/api/customers/${c.id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // LGPD art. 18: o titular pode pedir cópia dos seus dados…
  const exportData = async (c) => {
    try {
      const { data } = await api.get(`/api/customers/${c.id}/personal-data`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dados-pessoais-${c.name.replace(/[^\w]+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // …e a eliminação. As compras ficam (guarda fiscal), sem dono identificável.
  const anonymize = async (c) => {
    const ok = confirm(
      `Eliminar os dados pessoais de "${c.name}"?\n\n` +
      'Nome, CPF, e-mail, telefone, endereço e data de nascimento são apagados de forma irreversível.\n' +
      'As compras são mantidas (obrigação fiscal), mas deixam de identificar a pessoa.\n\n' +
      'Use quando o titular solicitar formalmente a exclusão dos dados (LGPD art. 18, VI).'
    );
    if (!ok) return;
    try {
      await api.post(`/api/customers/${c.id}/anonymize`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">👥 Clientes</h1>
          <p className="text-sm text-slate-500 mt-1">Programa de fidelidade — pontos sobem 1 a cada R$ 10 em compras.</p>
        </div>
        <button onClick={openCreate} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
          ➕ Novo Cliente
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center">
          <form onSubmit={onSearch} className="flex-1 min-w-[260px] flex gap-2">
            <input
              type="text"
              placeholder="🔍 Buscar por nome, CPF, e-mail ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Buscar</button>
          </form>

          <select
            value={tier}
            onChange={(e) => { setPage(1); setTier(e.target.value); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todos os níveis</option>
            <option value="vip">⭐ VIP (Silver + Gold)</option>
            <option value="gold">🥇 Gold (1000+)</option>
            <option value="silver">🥈 Silver (500–999)</option>
            <option value="bronze">🥉 Bronze (&lt; 500)</option>
          </select>

          <div className="text-sm text-slate-500 ml-auto">
            <span className="font-semibold text-slate-800">{data.totalCount}</span> cliente(s)
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">⚠️ {error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3 text-right">Pontos</th>
                <th className="px-4 py-3 text-right">Total Gasto</th>
                <th className="px-4 py-3">Nível</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Nenhum cliente encontrado.</td></tr>
              )}
              {!loading && data.items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {initialsOf(c.name)}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{c.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{c.taxId || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{c.phone || '—'}</div>
                    <div className="text-xs text-slate-400">{c.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-blue-600">{c.loyaltyPoints}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{brl(c.totalSpent)}</td>
                  <td className="px-4 py-3">{tierBadge(c.tier)}</td>
                  <td className="px-4 py-3">
                    {c.status === 'active'
                      ? <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Ativo</span>
                      : c.status === 'anonymized'
                      ? <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full"
                              title="Dados pessoais eliminados a pedido do titular (LGPD)">🔒 Anonimizado</span>
                      : <span className="text-xs text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.status !== 'anonymized' && (
                      <>
                        <button onClick={() => openEdit(c)} title="Editar"
                                className="text-blue-600 hover:underline text-sm mr-3">✏️</button>
                        <button onClick={() => exportData(c)} title="Exportar dados pessoais (pedido do titular — LGPD)"
                                className="text-slate-500 hover:underline text-sm mr-3">📄</button>
                        <button onClick={() => anonymize(c)} title="Eliminar dados pessoais a pedido do titular (LGPD)"
                                className="text-purple-600 hover:underline text-sm mr-3">🔒</button>
                        <button onClick={() => remove(c)} title="Inativar" className="text-red-600 hover:underline text-sm">🗑️</button>
                      </>
                    )}
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

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={close}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <form onSubmit={save}>
              <header className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800">
                  {editing === 'new' ? '➕ Novo Cliente' : '✏️ Editar Cliente'}
                </h2>
              </header>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
                  <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">CPF</label>
                    <input type="text" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
                    <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço</label>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Pontos</label>
                    <input type="number" min="0" value={form.loyaltyPoints} onChange={(e) => setForm({ ...form, loyaltyPoints: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Aniversário</label>
                    <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  {editing !== 'new' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </div>
                  )}
                </div>
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
