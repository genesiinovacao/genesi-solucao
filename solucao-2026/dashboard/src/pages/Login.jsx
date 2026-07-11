import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@mercadojoao.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (auth.isAuthenticated()) {
    navigate('/products', { replace: true });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      auth.save({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      navigate('/products', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Falha ao entrar. Verifique o backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-2xl text-3xl mb-4">
            💡
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800">
            SOLUÇÃO <span className="text-blue-600">2026</span>
          </h1>
          <p className="text-sm text-slate-500 mt-2">Dashboard de Gestão de Varejo</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Entrando…' : '🚀 Entrar'}
          </button>
        </form>

        <p className="text-sm text-slate-500 text-center mt-6">
          Ainda não tem conta?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">Cadastre seu mercado</Link>
        </p>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center mb-3 font-semibold">
            Contas demo (senha: 123456)
          </p>
          <div className="space-y-1.5 text-xs">
            <button
              onClick={() => { setEmail('admin@mercadojoao.com'); setPassword('123456'); }}
              className="block w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-md font-mono text-slate-700"
            >
              admin@mercadojoao.com → Mercado do João
            </button>
            <button
              onClick={() => { setEmail('admin@padariaana.com'); setPassword('123456'); }}
              className="block w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-md font-mono text-slate-700"
            >
              admin@padariaana.com → Padaria da Ana
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
