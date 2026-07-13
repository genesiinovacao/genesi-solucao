import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { daysUntil } from '../lib/dates';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

// Sugestões de categoria por tipo de comércio (o campo continua livre)
const SEGMENT_CATEGORIES = {
  supermercado: ['Mercearia', 'Hortifruti', 'Açougue', 'Padaria', 'Frios e Laticínios', 'Bebidas', 'Limpeza', 'Higiene', 'Congelados', 'Pet'],
  farmacia: ['Medicamentos', 'Genéricos', 'Dermocosméticos', 'Higiene Pessoal', 'Vitaminas', 'Infantil', 'Ortopédicos', 'Conveniência'],
  loja_roupas: ['Feminino', 'Masculino', 'Infantil', 'Calçados', 'Acessórios', 'Íntimo', 'Esportivo', 'Cama Mesa e Banho'],
  loja_pecas: ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Filtros', 'Óleos e Fluidos', 'Acessórios', 'Ferramentas'],
  padaria: ['Pães', 'Doces e Bolos', 'Salgados', 'Frios', 'Bebidas', 'Mercearia'],
  conveniencia: ['Bebidas', 'Snacks', 'Cigarros', 'Higiene', 'Congelados', 'Sorvetes'],
  petshop: ['Rações', 'Petiscos', 'Higiene e Banho', 'Medicamentos', 'Brinquedos', 'Acessórios', 'Aquarismo'],
  papelaria: ['Escolar', 'Escritório', 'Informática', 'Artesanato', 'Presentes', 'Impressão'],
  outro: [],
};

const expiryBadge = (p) => {
  if (!p.expiryDate) return null;
  const d = daysUntil(p.expiryDate);
  if (d < 0)   return <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Vencido</span>;
  if (d <= 30) return <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Vence em {d}d</span>;
  return null;
};

const EMPTY_FORM = {
  name: '', category: '', sku: '', barcode: '', unit: 'un', emoji: '📦',
  costPrice: '', salePrice: '', stockQuantity: '', minStock: '', expiryDate: '',
};

function ProductFormModal({ product, segment, onClose, onSaved }) {
  const isEdit = !!product?.id;
  const [form, setForm] = useState(isEdit ? {
    name: product.name || '',
    category: product.category || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    unit: product.unit || 'un',
    emoji: product.emoji || '📦',
    costPrice: product.costPrice,
    salePrice: product.salePrice,
    stockQuantity: product.stockQuantity,
    minStock: product.minStock,
    expiryDate: product.expiryDate || '',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      unit: form.unit,
      emoji: form.emoji || null,
      costPrice: Number(form.costPrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      minStock: Number(form.minStock) || 0,
      expiryDate: form.expiryDate || null,
      supplierId: product?.supplierId || null,
    };
    try {
      if (isEdit) {
        await api.put(`/api/products/${product.id}`, { ...payload, isActive: true });
      } else {
        await api.post('/api/products', { ...payload, stockQuantity: Number(form.stockQuantity) || 0 });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.title || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? '✏️ Editar Produto' : '📦 Novo Produto'}
          </h2>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-[70px_1fr] gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Emoji</label>
              <input type="text" value={form.emoji} onChange={set('emoji')} maxLength={4}
                     className="w-full px-2 py-2 border border-slate-300 rounded-lg text-center text-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
              <input type="text" required value={form.name} onChange={set('name')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                     placeholder="Nome do produto" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
              {(() => {
                const categories = SEGMENT_CATEGORIES[segment] || [];
                // Segmento "outro" não tem lista pré-definida: campo livre
                if (categories.length === 0) {
                  return <input type="text" value={form.category} onChange={set('category')}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                placeholder="Categoria do produto" />;
                }
                // Produto antigo com categoria fora da lista continua selecionável
                const options = form.category && !categories.includes(form.category)
                  ? [form.category, ...categories] : categories;
                return (
                  <select value={form.category} onChange={set('category')}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="">— Sem categoria —</option>
                    {options.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                );
              })()}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unidade</label>
              <select value={form.unit} onChange={set('unit')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="un">Unidade (un)</option>
                <option value="kg">Quilo (kg)</option>
                <option value="g">Grama (g)</option>
                <option value="l">Litro (l)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="cx">Caixa (cx)</option>
                <option value="pct">Pacote (pct)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Código de barras</label>
              <input type="text" value={form.barcode} onChange={set('barcode')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                     placeholder="Somente números" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SKU (código interno)</label>
              <input type="text" value={form.sku} onChange={set('sku')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                     placeholder="Ex.: PROD-001" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preço de custo (R$)</label>
              <input type="number" step="0.01" min="0" value={form.costPrice} onChange={set('costPrice')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preço de venda (R$) *</label>
              <input type="number" step="0.01" min="0.01" required value={form.salePrice} onChange={set('salePrice')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="0,00" />
            </div>
            {!isEdit && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estoque inicial</label>
                <input type="number" step="0.001" min="0" value={form.stockQuantity} onChange={set('stockQuantity')}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="0" />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estoque mínimo (alerta)</label>
              <input type="number" step="0.001" min="0" value={form.minStock} onChange={set('minStock')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Validade (opcional)</label>
              <input type="date" value={form.expiryDate} onChange={set('expiryDate')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <p className="text-[11px] text-slate-400 mt-0.5">Para perecíveis/medicamentos — gera aviso na listagem</p>
            </div>
          </div>

          {isEdit && (
            <p className="text-xs text-slate-400">
              O estoque atual ({product.stockQuantity} {product.unit}) não é editável aqui — ele muda
              pelas vendas do PDV e devoluções, mantendo o histórico de movimentações.
            </p>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
                    className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Salvando…' : (isEdit ? 'Salvar alterações' : 'Cadastrar produto')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Products() {
  const [data, setData] = useState({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | produto
  const [segment, setSegment] = useState('outro');

  useEffect(() => {
    api.get('/api/settings').then(({ data }) => setSegment(data.segment || 'outro')).catch(() => {});
  }, []);

  const deactivate = async (p) => {
    if (!window.confirm(`Desativar "${p.name}"?\n\nEle some da lista e do PDV, mas o histórico de vendas é preservado.`)) return;
    try {
      await api.delete(`/api/products/${p.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

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
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📦 Produtos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre aqui — o PDV baixa o catálogo automaticamente no próximo login/sync.
          </p>
        </div>
        <button onClick={() => setEditing('new')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          ＋ Novo Produto
        </button>
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
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">
                  Nenhum produto ainda.<br/>
                  <button onClick={() => setEditing('new')} className="text-blue-600 hover:underline text-sm mt-1">
                    Cadastrar o primeiro produto
                  </button>
                </td></tr>
              )}
              {!loading && data.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.emoji}</span>
                      <div>
                        <div className="font-medium text-slate-800">{p.name}{expiryBadge(p)}</div>
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
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(p)} className="text-blue-600 hover:underline text-sm mr-3">Editar</button>
                    <button onClick={() => deactivate(p)} className="text-red-500 hover:underline text-sm">Desativar</button>
                  </td>
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

      {editing && (
        <ProductFormModal
          product={editing === 'new' ? null : editing}
          segment={segment}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
