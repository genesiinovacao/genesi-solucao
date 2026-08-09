import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { formatDoc } from '../lib/masks';
import PdvShortcutsEditor from '../components/PdvShortcutsEditor';

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
  const [logoError, setLogoError] = useState('');

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
        maxDiscountPercent: Number(data.maxDiscountPercent) || 0,
        taxRegime: data.taxRegime,
        logoEmoji: data.logoEmoji || null,
        logoBase64: data.logoBase64 || null,
        // Objeto vazio é o pedido explícito de voltar ao padrão; nulo mantém
        pdvShortcuts: data.pdvShortcuts ?? {},
        allowSaleWithoutStock: !!data.allowSaleWithoutStock,
        stateRegistration: data.stateRegistration || '',
        approximateTaxPercent: Number(data.approximateTaxPercent) || 0,
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

          {/* Logo da loja: aparece no menu do dashboard e no topo do PDV */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Logo da loja</label>
            <div className="flex items-center gap-4">
              {data.logoBase64 ? (
                <img src={data.logoBase64} alt="Logo da loja"
                     className="w-20 h-20 object-contain rounded-xl border border-slate-200 bg-white p-1" />
              ) : (
                <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-3xl text-slate-300">
                  🏪
                </div>
              )}
              <div className="space-y-1">
                <input type="file" accept="image/*"
                       onChange={(e) => {
                         const file = e.target.files?.[0];
                         if (!file) return;
                         if (file.size > 200 * 1024) {
                           setLogoError('Imagem muito grande — use até 200 KB (PNG pequeno ou SVG).');
                           return;
                         }
                         setLogoError('');
                         const reader = new FileReader();
                         reader.onload = () => setData((d) => ({ ...d, logoBase64: reader.result }));
                         reader.readAsDataURL(file);
                       }}
                       className="text-xs text-slate-500 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium hover:file:bg-blue-100" />
                {data.logoBase64 && (
                  <button type="button" onClick={() => setData({ ...data, logoBase64: null })}
                          className="block text-xs text-red-500 hover:underline">Remover logo</button>
                )}
                <p className="text-[11px] text-slate-400">
                  Aparece no menu do dashboard e no topo do PDV. Ideal: quadrada, fundo transparente, até 200 KB.
                </p>
              </div>
            </div>
            {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ícone (emoji)</label>
              <input type="text" maxLength={4} value={data.logoEmoji || ''} onChange={(e) => setData({ ...data, logoEmoji: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-2xl text-center" />
              <p className="text-[11px] text-slate-400 mt-0.5">Usado quando não há logo</p>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da empresa *</label>
              <input required type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Desconto máximo sem supervisor (%)
              </label>
              <input type="number" min="0" max="100" step="0.5"
                     value={data.maxDiscountPercent ?? 10}
                     onChange={(e) => setData({ ...data, maxDiscountPercent: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <p className="text-xs text-slate-400 mt-1">
                No PDV, desconto acima disso pede código e PIN de um gerente.
                <strong> Zero (recomendado) = o caixa não dá desconto sozinho.</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
              <input type="text" value={formatDoc(data.cnpj)} disabled
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

        <section className="p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">🖥️ Ponto de venda</h2>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={!!data.allowSaleWithoutStock}
                   onChange={(e) => setData({ ...data, allowSaleWithoutStock: e.target.checked })}
                   className="mt-0.5 w-4 h-4 accent-blue-600" />
            <div>
              <div className="text-sm font-medium text-slate-800">
                Permitir vender item sem estoque (com autorização de gerente)
              </div>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                Para quando a mercadoria já está na prateleira e a nota de entrada
                só chega depois. Cada venda pede código e PIN de gerente, e o saldo
                fica <strong>negativo</strong> até você dar entrada na nota.
              </p>
              {data.allowSaleWithoutStock && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2 max-w-xl">
                  Enquanto estiver ligado, o estoque deixa de ser trava e passa a ser
                  indicador. Acompanhe em <strong>Produtos → saldo negativo</strong> para
                  não acumular divergência — e lembre que vender sem entrada registrada
                  também desencontra a escrituração fiscal.
                </p>
              )}
            </div>
          </label>

          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Teclas de atalho
            </h3>
            <PdvShortcutsEditor
              value={data.pdvShortcuts}
              onChange={(next) => setData({ ...data, pdvShortcuts: next })} />
          </div>
        </section>

        <section className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">🧾 Cupom fiscal (NFC-e)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Inscrição Estadual</label>
              <input type="text" value={data.stateRegistration || ''} maxLength={20}
                     onChange={(e) => setData({ ...data, stateRegistration: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
              <p className="text-xs text-slate-400 mt-1">Sai impressa no cupom, ao lado do CNPJ.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tributos aproximados (%)
              </label>
              <input type="number" min="0" max="100" step="0.01"
                     value={data.approximateTaxPercent ?? 0}
                     onChange={(e) => setData({ ...data, approximateTaxPercent: e.target.value })}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <p className="text-xs text-slate-400 mt-1">
                Linha da Lei 12.741/2012 no cupom. Zero não imprime.
              </p>
            </div>
          </div>
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <strong>O sistema ainda não emite NFC-e de verdade.</strong> O provider fiscal
            está em modo simulado: os cupons saem no layout do DANFE, mas carimbados como
            <strong> SEM VALOR FISCAL</strong>, e a chave não é reconhecida pela SEFAZ.
            Para valer, faltam certificado digital A1/A3, credenciamento na SEFAZ do estado
            e o CSC da loja. O percentual acima é uma aproximação declarada, não cálculo
            fiscal — o correto depende do NCM de cada item.
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
