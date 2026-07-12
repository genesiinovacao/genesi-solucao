import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const ROLES = [
  { value: 'admin',   label: '👑 Admin',   hint: 'Acesso total, gerencia a equipe' },
  { value: 'manager', label: '📋 Gerente', hint: 'Operação da loja no dashboard' },
  { value: 'cashier', label: '💵 Caixa',   hint: 'Usa apenas o PDV' },
];

const roleLabel = (v) => ROLES.find((r) => r.value === v)?.label || v;
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

function UserFormModal({ user, onClose, onSaved }) {
  const isEdit = !!user;
  const [form, setForm] = useState(isEdit
    ? { name: user.name, role: user.role, isActive: user.isActive, email: user.email, password: '' }
    : { name: '', email: '', password: '', role: 'cashier', isActive: true });
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
        await api.put(`/api/users/${user.id}`, { name: form.name, role: form.role, isActive: form.isActive });
      } else {
        await api.post('/api/users', {
          name: form.name, email: form.email, password: form.password, role: form.role,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.title || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? '✏️ Editar usuário' : '👤 Novo usuário'}</h2>
          {isEdit && <p className="text-xs text-slate-500 mt-1">{user.email}</p>}
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
            <input type="text" required minLength={2} value={form.name} onChange={set('name')}
                   className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="João da Silva" />
          </div>
          {!isEdit && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
                <input type="email" required value={form.email} onChange={set('email')}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="caixa1@sualoja.com" />
                <p className="text-[11px] text-slate-400 mt-0.5">Será o login no dashboard e no PDV</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Senha inicial *</label>
                <input type="text" required minLength={6} value={form.password} onChange={set('password')}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" placeholder="mínimo 6 caracteres" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Papel *</label>
            <select value={form.role} onChange={set('role')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-0.5">{ROLES.find((r) => r.value === form.role)?.hint}</p>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="accent-blue-600" />
              Usuário ativo (desmarcar bloqueia o acesso e derruba as sessões)
            </label>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Salvando…' : (isEdit ? 'Salvar' : 'Criar usuário')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const generate = () => {
    // Senha legível para ditar por telefone: 3 pares consoante+vogal + 2 dígitos
    const c = 'bcdfgjklmnprstvz', v = 'aeiou';
    const rnd = (s) => s[Math.floor(Math.random() * s.length)];
    setPassword(rnd(c) + rnd(v) + rnd(c) + rnd(v) + rnd(c) + rnd(v) + Math.floor(10 + Math.random() * 90));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post(`/api/users/${user.id}/reset-password`, { newPassword: password });
      onSaved(password);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">🔑 Redefinir senha</h2>
          <p className="text-xs text-slate-500 mt-1">{user.name} — {user.email}</p>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nova senha *</label>
            <div className="flex gap-2">
              <input type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                     className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" placeholder="mínimo 6 caracteres" />
              <button type="button" onClick={generate}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs whitespace-nowrap">🎲 Gerar</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Anote e repasse ao usuário. As sessões antigas dele são desconectadas.
            </p>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Salvando…' : 'Redefinir senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Team() {
  const me = auth.getUser();
  const [users, setUsers] = useState([]);
  const [terminals, setTerminals] = useState(null); // {items, used, max}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined | null (novo) | user
  const [resetting, setResetting] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: u }, { data: t }] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/pos-terminals'),
      ]);
      setUsers(u);
      setTerminals(t);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const removeTerminal = async (t) => {
    if (!window.confirm(`Remover o PDV "${t.name || t.terminalKey}"?\n\nA vaga da licença é liberada. Se essa máquina logar de novo, ela volta a ocupar uma vaga.`)) return;
    try {
      await api.delete(`/api/pos-terminals/${t.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🧑‍💼 Equipe & PDVs</h1>
          <p className="text-sm text-slate-500 mt-1">Usuários da loja e máquinas de caixa registradas.</p>
        </div>
        <button onClick={() => setEditing(null)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          ＋ Novo usuário
        </button>
      </header>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">⚠️ {error}</div>}
      {notice && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-800">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Carregando…</td></tr>}
            {!loading && users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{u.name}{u.id === me?.id && <span className="text-xs text-slate-400"> (você)</span>}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{roleLabel(u.role)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                <td className="px-4 py-3">
                  {u.isActive
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Ativo</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Bloqueado</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setResetting(u)} className="text-indigo-600 hover:underline text-sm mr-3">Redefinir senha</button>
                  <button onClick={() => setEditing(u)} className="text-blue-600 hover:underline text-sm">Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-slate-800 text-sm">🖥️ Terminais PDV registrados</h2>
          {terminals && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              terminals.used >= terminals.max ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
              {terminals.used} de {terminals.max} licença(s) em uso
            </span>
          )}
        </header>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {terminals?.items.length === 0 && (
              <tr><td className="px-4 py-8 text-center text-slate-500 text-sm">
                Nenhum PDV registrado — o registro acontece no primeiro login do aplicativo de caixa.
              </td></tr>
            )}
            {terminals?.items.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{t.name || 'PDV sem nome'}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{t.terminalKey.slice(0, 13)}…</p>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  Visto por último: {fmtDateTime(t.lastSeenAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => removeTerminal(t)}
                          title="Libera a vaga da licença (troca de máquina, computador com defeito)"
                          className="text-red-500 hover:underline text-sm">Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[11px] text-slate-400 border-t border-slate-100">
          Precisa de mais licenças de PDV? Fale com o suporte SOLUÇÃO — o limite é definido no seu plano.
        </p>
      </div>

      {editing !== undefined && (
        <UserFormModal
          user={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={(pwd) => {
            setNotice(`✅ Senha de ${resetting.name} redefinida para: ${pwd} — anote antes de fechar este aviso.`);
            setResetting(null);
          }}
        />
      )}
    </div>
  );
}
