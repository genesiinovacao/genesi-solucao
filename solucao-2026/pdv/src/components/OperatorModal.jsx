import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Teclado de código + PIN. Serve para dois usos:
 *  - mode="switch": troca o operador do caixa (troca de turno)
 *  - mode="authorize": pede o PIN de um supervisor sem trocar o operador
 * Feito para teclado numérico: campos grandes, Enter avança, Esc cancela.
 */
export default function OperatorModal({ mode = 'switch', action, value, onDone, onClose }) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef(null);
  const pinRef = useRef(null);

  const isAuthorize = mode === 'authorize';

  useEffect(() => { codeRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!code.trim() || !pin.trim()) {
      setError('Informe código e PIN.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (isAuthorize) {
        const { data } = await api.post('/api/auth/authorize', {
          operatorCode: code.trim(), pin: pin.trim(), action, value,
        });
        onDone(data);
      } else {
        const { data } = await api.post('/api/auth/switch-operator', {
          operatorCode: code.trim(), pin: pin.trim(),
        });
        onDone(data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível validar.');
      setPin('');
      pinRef.current?.focus();
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-6 z-[70]">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
        <header className="p-5 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">
            {isAuthorize ? '🔑 Autorização do supervisor' : '👤 Trocar operador'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAuthorize
              ? `Necessária para ${action}. Chame o gerente para liberar.`
              : 'Digite seu código e PIN para assumir o caixa.'}
          </p>
        </header>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Código
            </label>
            <input ref={codeRef} type="text" inputMode="text" autoComplete="off"
                   value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pinRef.current?.focus(); } }}
                   maxLength={10}
                   className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white text-2xl text-center font-mono tracking-widest focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              PIN
            </label>
            <input ref={pinRef} type="password" inputMode="numeric" autoComplete="off"
                   value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                   maxLength={8}
                   className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white text-2xl text-center font-mono tracking-[0.4em] focus:border-blue-500 focus:outline-none" />
          </div>

          {error && (
            <div className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm">
              Cancelar (Esc)
            </button>
            <button type="submit" disabled={busy}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold">
              {busy ? 'Validando…' : (isAuthorize ? 'Autorizar' : 'Entrar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
