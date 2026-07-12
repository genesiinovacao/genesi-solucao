import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

export const SEGMENTS = [
  { value: 'supermercado', label: '🛒 Supermercado' },
  { value: 'farmacia', label: '💊 Farmácia' },
  { value: 'loja_roupas', label: '👕 Loja de Roupas' },
  { value: 'loja_pecas', label: '🔧 Loja de Peças' },
  { value: 'padaria', label: '🥐 Padaria' },
  { value: 'conveniencia', label: '🏪 Conveniência' },
  { value: 'petshop', label: '🐶 Petshop' },
  { value: 'papelaria', label: '✏️ Papelaria' },
  { value: 'outro', label: '📦 Outro' },
];

export const segmentLabel = (v) => SEGMENTS.find((s) => s.value === v)?.label || v;

const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
const daysLeft = (iso) => Math.ceil((new Date(`${iso}T23:59:59`) - new Date()) / 86400000);

function SubscriptionBadge({ expiresAt }) {
  if (!expiresAt) return <span className="text-slate-400 text-xs">— sem controle</span>;
  const d = daysLeft(expiresAt);
  if (d < 0)
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">⛔ Expirada em {fmtDate(expiresAt)}</span>;
  if (d <= 3)
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 animate-pulse">⚠️ Expira em {d === 0 ? 'hoje' : `${d} dia(s)`} ({fmtDate(expiresAt)})</span>;
  return <span className="text-slate-600 text-xs">{fmtDate(expiresAt)}</span>;
}

function RenewModal({ tenant, onClose, onSaved }) {
  const base = tenant.subscriptionExpiresAt && daysLeft(tenant.subscriptionExpiresAt) > 0
    ? new Date(`${tenant.subscriptionExpiresAt}T12:00:00`)
    : new Date();
  const suggested = new Date(base);
  suggested.setMonth(suggested.getMonth() + 1);

  const [date, setDate] = useState(suggested.toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addMonths = (n) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + n);
    setDate(d.toISOString().slice(0, 10));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post(`/api/admin/tenants/${tenant.id}/renew`, { expiresAt: date });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">🔄 Renovar assinatura</h2>
          <p className="text-xs text-slate-500 mt-1">{tenant.name}</p>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-sm text-slate-600">
            Validade atual:{' '}
            <strong>{tenant.subscriptionExpiresAt ? fmtDate(tenant.subscriptionExpiresAt) : 'sem controle'}</strong>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nova data de expiração</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                   min={new Date().toISOString().slice(0, 10)}
                   className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => addMonths(1)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg">+1 mês</button>
            <button type="button" onClick={() => addMonths(3)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg">+3 meses</button>
            <button type="button" onClick={() => addMonths(12)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg">+1 ano</button>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Renovando…' : 'Confirmar renovação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ tenant, onClose, onDeleted }) {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const nameMatches = typed.trim() === tenant.name;

  const handleDelete = async () => {
    setError('');
    setDeleting(true);
    try {
      await api.delete(`/api/admin/tenants/${tenant.id}`, { params: { confirm: typed.trim() } });
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-red-700">🗑️ Excluir cliente</h2>
          <p className="text-xs text-slate-500 mt-1">{tenant.name} — {tenant.cnpj}</p>
        </header>
        <div className="p-6 space-y-4">
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <strong>Ação irreversível.</strong> Apaga o cliente e TODOS os dados dele:
            usuários, produtos, vendas, clientes da loja, financeiro e histórico fiscal.
            Se a intenção é só suspender o acesso, use Editar → desmarcar "Cliente ativo".
          </div>
          {tenant.isActive ? (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Este cliente está <strong>ativo</strong>. Por segurança, bloqueie primeiro
              (Editar → desmarcar "Cliente ativo") e depois volte aqui.
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Digite o nome exato do cliente para confirmar
              </label>
              <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
                     placeholder={tenant.name} autoFocus
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
            <button type="button" onClick={handleDelete} disabled={tenant.isActive || !nameMatches || deleting}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
              {deleting ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Converte o arquivo escolhido em data-URL base64, recusando imagens grandes
function readLogoFile(file, cb, onError) {
  if (file.size > 200 * 1024) {
    onError('Imagem muito grande — use até 200 KB (dica: PNG pequeno ou SVG).');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}

function LogoPicker({ value, onChange, label }) {
  const [err, setErr] = useState('');
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {value
          ? <img src={value} alt="logo" className="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white" />
          : <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-300 text-xl">🖼️</div>}
        <div className="space-y-1">
          <input type="file" accept="image/*"
                 onChange={(e) => { setErr(''); const f = e.target.files?.[0]; if (f) readLogoFile(f, onChange, setErr); }}
                 className="text-xs text-slate-500 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium hover:file:bg-blue-100" />
          {value && (
            <button type="button" onClick={() => onChange(null)} className="text-xs text-red-500 hover:underline block">
              Remover logo
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

function TenantFormModal({ tenant, onClose, onSaved }) {
  const isEdit = !!tenant?.id;
  const defaultExpiry = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  const [form, setForm] = useState(isEdit ? {
    name: tenant.name, cnpj: tenant.cnpj, segment: tenant.segment,
    logoBase64: tenant.logoBase64, maxPosTerminals: tenant.maxPosTerminals,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt || '',
    isActive: tenant.isActive, planType: tenant.planType,
    userName: '', email: '', password: '',
  } : {
    name: '', cnpj: '', segment: 'supermercado', logoBase64: null,
    maxPosTerminals: 1, subscriptionExpiresAt: defaultExpiry(),
    isActive: true, planType: 'standard',
    userName: '', email: '', password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: v }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/api/admin/tenants/${tenant.id}`, {
          name: form.name, segment: form.segment, logoBase64: form.logoBase64,
          maxPosTerminals: Number(form.maxPosTerminals),
          subscriptionExpiresAt: form.subscriptionExpiresAt || null,
          isActive: form.isActive, planType: form.planType,
        });
      } else {
        await api.post('/api/admin/tenants', {
          tenantName: form.name, cnpj: form.cnpj, segment: form.segment,
          logoBase64: form.logoBase64, maxPosTerminals: Number(form.maxPosTerminals),
          subscriptionExpiresAt: form.subscriptionExpiresAt || null,
          userName: form.userName, email: form.email, password: form.password,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.title || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? '✏️ Editar Cliente' : '🏪 Novo Cliente'}</h2>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do comércio *</label>
            <input type="text" required minLength={2} value={form.name} onChange={set('name')}
                   className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Farmácia Central" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ *</label>
              <input type="text" required value={form.cnpj} onChange={set('cnpj')} disabled={isEdit}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono disabled:bg-slate-50 disabled:text-slate-400"
                     placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Segmento *</label>
              <select value={form.segment} onChange={set('segment')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantidade de PDVs</label>
              <input type="number" min="0" max="100" required value={form.maxPosTerminals} onChange={set('maxPosTerminals')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <p className="text-[11px] text-slate-400 mt-0.5">Máquinas de caixa que este cliente pode ativar</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Plano</label>
              <select value={form.planType} onChange={set('planType')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assinatura válida até</label>
              <input type="date" value={form.subscriptionExpiresAt} onChange={set('subscriptionExpiresAt')}
                     className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <p className="text-[11px] text-slate-400 mt-0.5">Vazio = sem controle de expiração. Alertas começam 3 dias antes.</p>
            </div>
          </div>

          <LogoPicker label="Logo do cliente (aparece no dashboard e no PDV dele)"
                      value={form.logoBase64} onChange={(v) => setForm((f) => ({ ...f, logoBase64: v }))} />

          {!isEdit && (
            <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
              <legend className="text-xs font-semibold text-slate-500 px-1">Usuário administrador do cliente</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
                  <input type="text" required minLength={2} value={form.userName} onChange={set('userName')}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Maria Souza" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
                  <input type="email" required value={form.email} onChange={set('email')}
                         className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="dono@comercio.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Senha inicial *</label>
                <input type="text" required minLength={6} value={form.password} onChange={set('password')}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" placeholder="mínimo 6 caracteres" />
                <p className="text-[11px] text-slate-400 mt-0.5">Anote e entregue ao cliente — ele usa no dashboard e no PDV</p>
              </div>
            </fieldset>
          )}

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="accent-blue-600" />
              Cliente ativo (desmarcar bloqueia o login de todos os usuários dele)
            </label>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Salvando…' : (isEdit ? 'Salvar alterações' : 'Cadastrar cliente')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Admin() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | tenant
  const [renewing, setRenewing] = useState(null); // tenant sendo renovado
  const [deleting, setDeleting] = useState(null); // tenant sendo excluído
  const [globalLogo, setGlobalLogo] = useState(null);
  const [logoSaving, setLogoSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: list }, { data: logo }] = await Promise.all([
        api.get('/api/admin/tenants'),
        api.get('/api/admin/platform-logo'),
      ]);
      setTenants(list);
      setGlobalLogo(logo.logoBase64);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const impersonate = async (t) => {
    try {
      const { data } = await api.post(`/api/admin/tenants/${t.id}/impersonate`);
      auth.enterImpersonation({ accessToken: data.accessToken, user: data.user });
      // Reload completo: Layout e páginas remontam já no contexto do cliente
      window.location.assign('/dashboard');
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const saveGlobalLogo = async (value) => {
    setLogoSaving(true);
    try {
      const { data } = await api.put('/api/admin/platform-logo', { logoBase64: value });
      setGlobalLogo(data.logoBase64);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally { setLogoSaving(false); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🛠️ Administração da Plataforma</h1>
          <p className="text-sm text-slate-500 mt-1">Clientes, logos e limites — visível apenas para o superadmin.</p>
        </div>
        <button onClick={() => setEditing('new')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          ＋ Novo Cliente
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 flex items-center gap-5 flex-wrap">
        <LogoPicker label="Logo global do sistema (fallback quando o cliente não tem logo própria)"
                    value={globalLogo} onChange={saveGlobalLogo} />
        {logoSaving && <span className="text-xs text-slate-400">Salvando…</span>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">⚠️ {error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Segmento</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3 text-right">PDVs</th>
              <th className="px-4 py-3">Assinatura</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>}
            {!loading && tenants.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-500">Nenhum cliente cadastrado ainda.</td></tr>
            )}
            {!loading && tenants.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {t.logoBase64
                      ? <img src={t.logoBase64} alt="" className="w-9 h-9 object-contain rounded-lg border border-slate-100 bg-white" />
                      : <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">🏪</div>}
                    <span className="font-medium text-slate-800">{t.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.cnpj}</td>
                <td className="px-4 py-3 text-slate-600">{segmentLabel(t.segment)}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{t.planType}</td>
                <td className="px-4 py-3 text-right text-slate-700 font-semibold">{t.maxPosTerminals}</td>
                <td className="px-4 py-3"><SubscriptionBadge expiresAt={t.subscriptionExpiresAt} /></td>
                <td className="px-4 py-3">
                  {t.isActive
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Ativo</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Bloqueado</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {t.isActive && (
                    <button onClick={() => impersonate(t)} title="Entrar no painel deste cliente como suporte"
                            className="text-emerald-600 hover:underline text-sm mr-3">Acessar</button>
                  )}
                  <button onClick={() => setRenewing(t)} title="Renovar assinatura"
                          className="text-indigo-600 hover:underline text-sm mr-3">Renovar</button>
                  <button onClick={() => setEditing(t)} className="text-blue-600 hover:underline text-sm mr-3">Editar</button>
                  <button onClick={() => setDeleting(t)} title="Excluir cliente e todos os dados"
                          className="text-red-500 hover:underline text-sm">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <TenantFormModal
          tenant={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {renewing && (
        <RenewModal
          tenant={renewing}
          onClose={() => setRenewing(null)}
          onSaved={() => { setRenewing(null); load(); }}
        />
      )}

      {deleting && (
        <DeleteModal
          tenant={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); load(); }}
        />
      )}
    </div>
  );
}
