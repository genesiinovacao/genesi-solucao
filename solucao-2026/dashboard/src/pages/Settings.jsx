import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const regimes = [
  { v: 'simples_nacional', l: 'Simples Nacional' },
  { v: 'lucro_presumido',  l: 'Lucro Presumido' },
  { v: 'lucro_real',       l: 'Lucro Real' },
  { v: 'mei',              l: 'MEI' },
];

export default function Settings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: res } = await api.get('/api/settings');
        setData(res);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        dailySalesTarget: Number(data.dailySalesTarget) || 0,
        taxRegime: data.taxRegime,
        logoEmoji: data.logoEmoji || null,
      };
      const { data: res } = await api.put('/api/settings', payload);
      setData(res);
      setSavedAt(new Date());

      // Atualiza tenantName no localStorage para a sidebar refletir
      const user = auth.getUser();
      if (user) {
        auth.save({
          accessToken: auth.getAccessToken(),
          refreshToken: auth.getRefreshToken(),
          user: { ...user, tenantName: res.name },
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  if (loading) return <main className="p-10 text-slate-500">Carregando configurações…</main>;
  if (error)   return <main className="p-10 text-red-700">⚠️ {error}</main>;
  if (!data)   return null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Configurações da Empresa</h1>
        <p className="text-sm text-slate-500 mt-1">Esses dados aparecem em todo o sistema e nos relatórios.</p>
      </header>

      <form onSubmit={save} className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
        <section className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">🏢 Dados da empresa</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Logo (emoji)</label>
              <input type="text" maxLength={4} value={data.logoEmoji || ''} onChange={(e) => setData({ ...data, logoEmoji: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-2xl text-center" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da empresa *</label>
              <input required type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
              <input type="text" value={data.cnpj} disabled
                     className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 font-mono" />
              <p className="text-xs text-slate-400 mt-1">Imutável.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Plano</label>
              <input type="text" value={data.planType} disabled
                     className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 capitalize" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
              <input type="text" value={data.phone || ''} onChange={(e) => setData({ ...data, phone: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
              <input type="email" value={data.email || ''} onChange={(e) => setData({ ...data, email: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço</label>
            <input type="text" value={data.address || ''} onChange={(e) => setData({ ...data, address: e.target.value })}
                   className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </section>

        <section className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">💰 Configurações financeiras</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Meta de vendas/dia (R$)</label>
              <input type="number" step="0.01" min="0" value={data.dailySalesTarget}
                     onChange={(e) => setData({ ...data, dailySalesTarget: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <p className="text-xs text-slate-400 mt-1">Usada no Dashboard para a barra de progresso.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Regime tributário</label>
              <select value={data.taxRegime} onChange={(e) => setData({ ...data, taxRegime: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                {regimes.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </div>
          </div>
        </section>

        <footer className="p-6 flex justify-between items-center">
          <div className="text-sm text-emerald-600">
            {savedAt && <>✅ Salvo às {savedAt.toLocaleTimeString('pt-BR')}</>}
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Salvando…' : '💾 Salvar alterações'}
          </button>
        </footer>
      </form>
    </div>
  );
}
