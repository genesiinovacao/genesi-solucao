import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      // Conta de caixa opera só no aplicativo PDV — o dashboard é gerencial
      if (data.user?.role === 'cashier') {
        setError('Esta é uma conta de caixa. Use o aplicativo PDV instalado no computador da loja.');
        return;
      }
      auth.save({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      navigate(data.user?.role === 'superadmin' ? '/admin' : '/products', { replace: true });
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

        <p className="text-xs text-slate-400 text-center mt-8">
          Acesso fornecido pela equipe SOLUÇÃO.
        </p>
      </div>
    </div>
  );
}
