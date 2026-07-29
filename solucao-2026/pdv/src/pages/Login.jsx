import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth, API_BASE } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('idle');
  const [version, setVersion] = useState('');
  const [checkMsg, setCheckMsg] = useState('');

  useEffect(() => {
    window.pdv?.getAppVersion?.().then(setVersion).catch(() => {});
  }, []);

  const checkUpdates = async () => {
    setCheckMsg('Verificando…');
    const r = await window.pdv?.checkUpdates?.();
    if (r?.status === 'dev') setCheckMsg('Modo desenvolvimento — sem atualização.');
    else if (r?.ok) setCheckMsg('Se houver versão nova, o download começa sozinho.');
    else setCheckMsg('Não foi possível verificar (sem internet?). O PDV segue normal.');
    setTimeout(() => setCheckMsg(''), 6000);
  };

  const bootstrap = async () => {
    setStep('bootstrap');
    // Pull the freshest catalogue from the backend so the PDV can sell offline
    const [products, customers, settings, promotions] = await Promise.all([
      api.get('/api/products', { params: { pageSize: 500 } }).then(r => r.data.items),
      api.get('/api/customers', { params: { pageSize: 1000 } }).then(r => r.data.items),
      api.get('/api/settings').then(r => r.data).catch(() => null),
      // Promoções vigentes viajam junto: o PDV aplica o desconto offline
      api.get('/api/promotions', { params: { state: 'active', pageSize: 200 } })
        .then(r => r.data.items).catch(() => []),
    ]);
    await window.pdv.saveSnapshot({
      products, customers, settings: { ...(settings || {}), promotions },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setStep('login');
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      auth.save({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });

      // Registra esta máquina no limite de PDVs do cliente. 403 = limite cheio.
      try {
        const info = await window.pdv.getTerminalInfo();
        await api.post('/api/pos-terminals/register', {
          terminalKey: info.terminalKey,
          name: info.hostname,
        });
      } catch (err) {
        if (err.response?.status === 403) {
          auth.clear();
          throw new Error(err.response?.data?.error || 'Limite de PDVs atingido para esta loja.');
        }
        // Sem internet/endpoint indisponível: segue — o terminal já pode ter
        // sido registrado antes e o PDV é offline-first.
      }

      await bootstrap();

      // Drain any sales queued offline before this login
      try { await window.pdv.syncNow(API_BASE, auth.getAccessToken()); } catch (_) {}

      navigate('/pdv', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Falha ao entrar.');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
      <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-2xl text-3xl mb-4 shadow-lg shadow-blue-500/30">
            🛒
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            SOLUÇÃO <span className="text-blue-400">2026</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2">Ponto de Venda · Modo Offline-First</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">E-mail</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Senha</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                   className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none" />
          </div>

          {error && (
            <div className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3">⚠️ {error}</div>
          )}

          <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-lg transition-colors shadow-lg shadow-blue-900/30">
            {loading
              ? (step === 'bootstrap' ? '📥 Baixando catálogo…' : '🔐 Autenticando…')
              : '🚀 Entrar no Caixa'}
          </button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-8">
          Use o login fornecido pela equipe SOLUÇÃO.
        </p>
        <p className="text-[11px] text-slate-600 text-center mt-3">
          {version && <>v{version} · </>}
          <button type="button" onClick={checkUpdates} className="underline hover:text-slate-400">
            Verificar atualizações
          </button>
          {checkMsg && <span className="block mt-1 text-slate-500">{checkMsg}</span>}
        </p>
      </div>
    </div>
  );
}
