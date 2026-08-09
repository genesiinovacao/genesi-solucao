import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * Redefinição de senha de um usuário do cliente, pelo suporte.
 *
 * Sem pedir a senha atual de propósito: quem redefine não a conhece — o caso
 * de uso é o cliente ter perdido o acesso e ligar. O que autoriza é ser
 * superadmin, e o ato fica registrado no audit_log.
 */
const MIN = 6;

const roleLabel = { admin: 'Administrador', manager: 'Gerente', cashier: 'Caixa' };

export default function TenantPasswordReset({ tenantId, tenantName }) {
  const [users, setUsers] = useState(null);
  const [userId, setUserId] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/tenants/${tenantId}/users`);
        setUsers(data);
        // Pré-seleciona o administrador: é quem costuma perder o acesso
        setUserId(data.find((u) => u.role === 'admin')?.userId || data[0]?.userId || '');
      } catch (err) {
        setError(err.response?.data?.error || 'Não foi possível carregar os usuários.');
        setUsers([]);
      }
    })();
  }, [tenantId]);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = userId && next.length >= MIN && next === confirm && !busy;
  const chosen = users?.find((u) => u.userId === userId);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(''); setOk('');
    try {
      const { data } = await api.post(`/api/admin/tenants/${tenantId}/reset-password`, {
        userId, newPassword: next,
      });
      setNext(''); setConfirm('');
      setOk(`Senha de ${data.email} redefinida. As sessões abertas foram encerradas.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível redefinir a senha.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm';

  return (
    <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">🔑 Redefinir senha de acesso</h3>
        <p className="text-xs text-slate-500 mt-1">
          Para quando o cliente perde o acesso. Não pede a senha antiga, e a ação
          fica registrada com o seu usuário.
        </p>
      </div>

      {users === null && <p className="text-xs text-slate-500">Carregando usuários…</p>}

      {users?.length === 0 && !error && (
        <p className="text-xs text-amber-700">Este cliente não tem usuários cadastrados.</p>
      )}

      {users?.length > 0 && (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Usuário</label>
            <select value={userId} onChange={(e) => { setUserId(e.target.value); setOk(''); }}
                    className={`${field} bg-white`}>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name} — {u.email} ({roleLabel[u.role] || u.role})
                  {u.isActive ? '' : ' · inativo'}
                </option>
              ))}
            </select>
            {chosen && !chosen.isActive && (
              <p className="text-xs text-amber-700 mt-1">
                Usuário inativo — redefinir a senha também o reativa.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nova senha</label>
              <input type={show ? 'text' : 'password'} value={next} autoComplete="new-password"
                     onChange={(e) => { setNext(e.target.value); setOk(''); }} className={field} />
              <p className="text-xs text-slate-400 mt-1">Mínimo de {MIN} caracteres.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Repita a senha</label>
              <input type={show ? 'text' : 'password'} value={confirm} autoComplete="new-password"
                     onChange={(e) => setConfirm(e.target.value)}
                     className={`${field} ${mismatch ? 'border-red-400' : ''}`} />
              {mismatch && <p className="text-xs text-red-600 mt-1">As senhas não são iguais.</p>}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer w-max">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)}
                   className="accent-blue-600" />
            Mostrar as senhas
          </label>

          {/* type="button": este bloco vive dentro do modal de edição, e um
              submit aqui dispararia o salvamento do cadastro do cliente. */}
          <button type="button" onClick={submit} disabled={!canSubmit}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
            {busy ? 'Redefinindo…' : `Redefinir senha em ${tenantName}`}
          </button>
        </>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>
      )}
      {ok && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          ✓ {ok} <strong>Anote e repasse ao cliente agora</strong> — ela não pode ser consultada depois.
        </div>
      )}
    </div>
  );
}
