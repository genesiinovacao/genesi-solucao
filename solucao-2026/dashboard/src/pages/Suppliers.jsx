import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { maskCnpj, formatDoc, onlyDigits } from '../lib/masks';

export default function Suppliers() {
  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const emptyForm = { name: '', cnpj: '', contactName: '', phone: '', email: '', address: '', category: '', status: 'active', notes: '' };
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/api/suppliers', {
        params: { page, pageSize: 20, search: search || undefined, status: statusFilter || undefined },
      });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, statusFilter]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); load(); };
  const openCreate = () => { setEditing('new'); setForm(emptyForm); };
  const openEdit = (s) => {
    setEditing(s.id);
    setForm({
      name: s.name || '', cnpj: maskCnpj(s.cnpj || ''), contactName: s.contactName || '',
      phone: s.phone || '', email: s.email || '', address: s.address || '',
      category: s.category || '', status: s.status || 'active', notes: s.notes || '',
    });
  };
  const close = () => { setEditing(null); setForm(emptyForm); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Máscara é apresentação: no banco vai só o número
      const payload = { ...form, cnpj: onlyDigits(form.cnpj) || null };
      if (editing === 'new') await api.post('/api/suppliers', payload);
      else                    await api.put(`/api/suppliers/${editing}`, payload);
      close();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Inativar fornecedor "${s.name}"?`)) return;
    try {
      await api.delete(`/api/suppliers/${s.id}`);
      await load();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🏭 Fornecedores</h1>
          <p className="text-sm text-slate-500 mt-1">Cadastro de parceiros comerciais.</p>
        </div>
        <button onClick={openCreate} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
          ➕ Novo Fornecedor
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center">
          <form onSubmit={onSearch} className="flex-1 min-w-[260px] flex gap-2">
            <input type="text" placeholder="🔍 Buscar por razão social, CNPJ ou contato..."
                   value={search} onChange={(e) => setSearch(e.target.value)}
                   className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Buscar</button>
          </form>
          <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <div className="text-sm text-slate-500 ml-auto"><span className="font-semibold text-slate-800">{data.totalCount}</span> fornecedor(es)</div>
        </div>

        {error && <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">⚠️ {error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Razão Social</th>
                <th className="px-4 py-3">CNPJ</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>}
              {!loading && data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum fornecedor.</td></tr>}
              {!loading && data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{formatDoc(s.cnpj)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{s.contactName || '—'}</div>
                    <div className="text-xs text-slate-400">{s.phone || s.email || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.category || '—'}</td>
                  <td className="px-4 py-3">
                    {s.status === 'active'
                      ? <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Ativo</span>
                      : <span className="text-xs text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.email && <a href={`mailto:${s.email}`} className="text-blue-600 hover:underline text-sm mr-3" onClick={(e) => e.stopPropagation()}>✉️</a>}
                    <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline text-sm mr-3">✏️</button>
                    <button onClick={() => remove(s)} className="text-red-600 hover:underline text-sm">🗑️</button>
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
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-auto">
            <form onSubmit={save}>
              <header className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800">
                  {editing === 'new' ? '➕ Novo Fornecedor' : '✏️ Editar Fornecedor'}
                </h2>
              </header>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Razão Social *</label>
                  <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
                    <input type="text" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00"
                           value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                    <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Ex: Mercearia" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Contato</label>
                    <input type="text" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
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
