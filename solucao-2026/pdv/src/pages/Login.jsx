import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth, API_BASE } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@mercadojoao.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('idle');

  const bootstrap = async () => {
    setStep('bootstrap');
    // Pull the freshest catalogue from the backend so the PDV can sell offline
    const [products, customers, settings] = await Promise.all([
      api.get('/api/products', { params: { pageSize: 500 } }).then(r => r.data.items),
      api.get('/api/customers', { params: { pageSize: 1000 } }).then(r => r.data.items),
      api.get('/api/settings').then(r => r.data).catch(() => null),
    ]);
    await window.pdv.saveSnapshot({ products, customers, settings });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setStep('login');
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      auth.save({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });

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

        <div className="mt-8 pt-5 border-t border-slate-700">
          <p className="text-xs text-slate-400 text-center mb-2 font-semibold">Demo (senha: 123456)</p>
          <div className="space-y-1 text-xs">
            <button onClick={() => { setEmail('admin@mercadojoao.com'); setPassword('123456'); }}
                    className="block w-full text-left px-3 py-2 bg-slate-900/50 hover:bg-slate-900 rounded font-mono text-slate-300">
              admin@mercadojoao.com → Mercado do João
            </button>
            <button onClick={() => { setEmail('admin@padariaana.com'); setPassword('123456'); }}
                    className="block w-full text-left px-3 py-2 bg-slate-900/50 hover:bg-slate-900 rounded font-mono text-slate-300">
              admin@padariaana.com → Padaria da Ana
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
