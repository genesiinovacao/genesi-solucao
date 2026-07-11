import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export default function Products() {
  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/api/products', {
        params: {
          page,
          pageSize: 20,
          search: search || undefined,
          lowStockOnly: lowStockOnly || undefined,
        },
      });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, lowStockOnly]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const stockBadge = (p) => {
    if (p.stockQuantity <= 0) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Zerado</span>;
    if (p.stockQuantity <= p.minStock) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Crítico</span>;
    if (p.stockQuantity <= p.minStock * 2) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Baixo</span>;
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">OK</span>;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">📦 Produtos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Os dados abaixo vêm da API real (RLS isola por tenant automaticamente).
        </p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center">
          <form onSubmit={onSearch} className="flex-1 min-w-[260px] flex gap-2">
            <input
              type="text"
              placeholder="🔍 Buscar por nome, SKU ou código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
            >
              Buscar
            </button>
          </form>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => { setPage(1); setLowStockOnly(e.target.checked); }}
              className="accent-blue-600"
            />
            Só estoque baixo
          </label>
          <div className="text-sm text-slate-500 ml-auto">
            <span className="font-semibold text-slate-800">{data.totalCount}</span> produto(s)
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Preço Custo</th>
                <th className="px-4 py-3 text-right">Preço Venda</th>
                <th className="px-4 py-3 text-right">Estoque</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum produto encontrado.</td></tr>
              )}
              {!loading && data.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.emoji}</span>
                      <div>
                        <div className="font-medium text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{p.sku || p.barcode || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{brl(p.costPrice)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{brl(p.salePrice)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {p.stockQuantity} <span className="text-xs text-slate-400">{p.unit}</span>
                  </td>
                  <td className="px-4 py-3">{stockBadge(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm">
            <span className="text-slate-500">
              Página {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="px-4 py-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
