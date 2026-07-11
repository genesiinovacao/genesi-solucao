import { useEffect, useState } from 'react';
import { Card, Title, Text, BarChart, DonutChart, Metric } from '@tremor/react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export default function Financial() {
  const [list, setList] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const emptyForm = { type: 'expense', description: '', amount: 0, transactionDate: new Date().toISOString().slice(0, 10), dueDate: '', category: '', status: 'pending', supplierId: '', paymentMethod: '', notes: '' };
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get('/api/financial', { params: { page, pageSize: 20, type: typeFilter || undefined, status: statusFilter || undefined } }),
        api.get('/api/financial/summary'),
      ]);
      setList(listRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, typeFilter, statusFilter]);

  const openCreate = (type = 'expense') => { setEditing('new'); setForm({ ...emptyForm, type }); };
  const openEdit = (t) => {
    setEditing(t.id);
    setForm({
      type: t.type,
      description: t.description || '',
      amount: t.amount,
      transactionDate: t.transactionDate,
      dueDate: t.dueDate || '',
      category: t.category || '',
      status: t.status,
      supplierId: t.supplierId || '',
      paymentMethod: t.paymentMethod || '',
      notes: t.notes || '',
    });
  };
  const close = () => { setEditing(null); setForm(emptyForm); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount) || 0,
        dueDate: form.dueDate || null,
        supplierId: form.supplierId || null,
      };
      if (editing === 'new') await api.post('/api/financial', payload);
      else                    await api.put(`/api/financial/${editing}`, payload);
      close();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!confirm(`Excluir lançamento "${t.description}"?`)) return;
    try {
      await api.delete(`/api/financial/${t.id}`);
      await load();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  if (loading && !summary) return <main className="p-10 text-slate-500">Carregando…</main>;
  if (error)               return <main className="p-10 text-red-700">⚠️ {error}</main>;

  const cashflowData = summary?.cashflowLast7Days.map((p) => ({
    Dia: new Date(p.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Receitas: p.income,
    Despesas: p.expense,
  })) || [];

  const expensesData = summary?.expensesByCategory.map((c) => ({ name: c.category, value: c.total })) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">💰 Financeiro</h1>
          <p className="text-sm text-slate-500 mt-1">Receitas, despesas e o painel "Meu Lucro".</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openCreate('income')}  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">➕ Receita</button>
          <button onClick={() => openCreate('expense')} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium">➖ Despesa</button>
        </div>
      </header>

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card decoration="top" decorationColor="emerald">
              <Text>📈 Total Receitas</Text>
              <Metric className="mt-1 !text-xl">{brl(summary.totalIncome)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="rose">
              <Text>📉 Total Despesas</Text>
              <Metric className="mt-1 !text-xl">{brl(summary.totalExpense)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="amber">
              <Text>⏳ A Pagar</Text>
              <Metric className="mt-1 !text-xl">{brl(summary.pending)}</Metric>
            </Card>
            <Card decoration="top" decorationColor={summary.netResult >= 0 ? 'blue' : 'rose'}>
              <Text>✅ Resultado Líquido</Text>
              <Metric className={`mt-1 !text-xl ${summary.netResult < 0 ? 'text-rose-600' : ''}`}>{brl(summary.netResult)}</Metric>
            </Card>
          </div>

          <Card className="mb-6 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
            <Title className="text-indigo-900">💎 Meu Lucro</Title>
            <Text className="text-indigo-700">indicadores estratégicos do negócio</Text>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4">
              <div>
                <Text className="text-indigo-700 text-xs uppercase">💰 Lucro Líquido</Text>
                <p className={`text-2xl font-bold ${summary.netResult >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}>{brl(summary.netResult)}</p>
              </div>
              <div>
                <Text className="text-indigo-700 text-xs uppercase">📊 Margem Média</Text>
                <p className="text-2xl font-bold text-indigo-900">{summary.averageMargin.toFixed(2)}%</p>
              </div>
              <div>
                <Text className="text-indigo-700 text-xs uppercase">📦 Valor em Estoque (venda)</Text>
                <p className="text-2xl font-bold text-indigo-900">{brl(summary.stockSaleValue)}</p>
              </div>
              <div>
                <Text className="text-indigo-700 text-xs uppercase">🎯 ROI</Text>
                <p className={`text-2xl font-bold ${summary.roi >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}>{summary.roi.toFixed(2)}%</p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
            <Card className="lg:col-span-2">
              <Title>Fluxo de Caixa — últimos 7 dias</Title>
              <BarChart className="h-72 mt-4" data={cashflowData} index="Dia"
                        categories={["Receitas", "Despesas"]}
                        colors={["emerald", "rose"]}
                        valueFormatter={brl} yAxisWidth={70} />
            </Card>
            <Card>
              <Title>Despesas por categoria</Title>
              {expensesData.length === 0
                ? <p className="text-sm text-slate-500 mt-10 text-center">Sem despesas no período.</p>
                : <DonutChart className="h-64 mt-4" data={expensesData} category="value" index="name" valueFormatter={brl} />}
            </Card>
          </div>
        </>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center">
          <select value={typeFilter} onChange={(e) => { setPage(1); setTypeFilter(e.target.value); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">Todos os tipos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">Todos os status</option>
            <option value="paid">Pagos</option>
            <option value="pending">Pendentes</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <div className="text-sm text-slate-500 ml-auto"><span className="font-semibold text-slate-800">{list.totalCount}</span> lançamento(s)</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum lançamento.</td></tr>}
              {list.items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{new Date(t.transactionDate).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{t.description}</td>
                  <td className="px-4 py-3 text-slate-600">{t.category || '—'}</td>
                  <td className={`px-4 py-3 text-right font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t.type === 'income' ? '+' : '-'} {brl(t.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {t.status === 'paid'      && <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Pago</span>}
                    {t.status === 'pending'   && <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Pendente</span>}
                    {t.status === 'cancelled' && <span className="text-xs text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">Cancelado</span>}
                    {t.status === 'overdue'   && <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Atrasado</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(t)} className="text-blue-600 hover:underline text-sm mr-3">✏️</button>
                    <button onClick={() => remove(t)}    className="text-red-600 hover:underline text-sm">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {list.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm">
            <span className="text-slate-500">Página {list.page} de {list.totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
              <button onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))} disabled={page >= list.totalPages} className="px-4 py-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40">Próxima →</button>
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
                  {editing === 'new'
                    ? (form.type === 'income' ? '➕ Nova Receita' : '➖ Nova Despesa')
                    : '✏️ Editar lançamento'}
                </h2>
              </header>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição *</label>
                  <input required type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Valor *</label>
                    <input required type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Data *</label>
                    <input required type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vencimento</label>
                    <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                    <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                           placeholder="Vendas, Aluguel, Utilidades…"
                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
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
