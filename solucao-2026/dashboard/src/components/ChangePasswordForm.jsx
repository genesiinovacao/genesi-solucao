import { useState } from 'react';
import { api } from '../lib/api';

// Troca da própria senha.
// Fica fora do <form> das configurações da empresa de propósito: são coisas
// diferentes, e trocar senha sem querer ao salvar o telefone da loja seria
// péssimo. Por isso os campos são controlados aqui e o envio é próprio.
const MIN = 6;

export default function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const tooShort = next.length > 0 && next.length < MIN;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && next === current;
  const canSubmit = current && next.length >= MIN && next === confirm && !sameAsCurrent && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      const { data } = await api.post('/api/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      setCurrent(''); setNext(''); setConfirm('');
      setOk(data?.sessionsRevoked > 0
        ? `Senha alterada. ${data.sessionsRevoked} sessão(ões) em outros dispositivos foram encerradas.`
        : 'Senha alterada.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível alterar a senha.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm';

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500 max-w-lg">
        Vale para a sua conta, seja qual for o papel. Ao confirmar, as sessões
        abertas em outros dispositivos são encerradas — a desta janela continua.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Senha atual *</label>
          <input type={show ? 'text' : 'password'} value={current} autoComplete="current-password"
                 onChange={(e) => setCurrent(e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Nova senha *</label>
          <input type={show ? 'text' : 'password'} value={next} autoComplete="new-password"
                 onChange={(e) => setNext(e.target.value)}
                 className={`${field} ${tooShort || sameAsCurrent ? 'border-red-400' : ''}`} />
          <p className={`text-xs mt-1 ${tooShort ? 'text-red-600' : 'text-slate-400'}`}>
            Mínimo de {MIN} caracteres.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Repita a nova senha *</label>
          <input type={show ? 'text' : 'password'} value={confirm} autoComplete="new-password"
                 onChange={(e) => setConfirm(e.target.value)}
                 className={`${field} ${mismatch ? 'border-red-400' : ''}`} />
          {mismatch && <p className="text-xs text-red-600 mt-1">As senhas não são iguais.</p>}
        </div>
      </div>

      {sameAsCurrent && (
        <p className="text-xs text-red-600">A nova senha é igual à atual.</p>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer w-max">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)}
               className="accent-blue-600" />
        Mostrar as senhas
      </label>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>
      )}
      {ok && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">✓ {ok}</div>
      )}

      <button type="submit" disabled={!canSubmit}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
        {busy ? 'Alterando…' : 'Alterar minha senha'}
      </button>
    </form>
  );
}
