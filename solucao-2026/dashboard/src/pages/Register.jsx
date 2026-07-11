import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const maskCnpj = (v) => v
  .replace(/\D/g, '').slice(0, 14)
  .replace(/(\d{2})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1/$2')
  .replace(/(\d{4})(\d)/, '$1-$2');

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ tenantName: '', cnpj: '', userName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: field === 'cnpj' ? maskCnpj(e.target.value) : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/register', form);
      auth.save({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      navigate('/products', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Falha no cadastro. Verifique o backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-2xl text-3xl mb-4">
            🏪
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800">
            Criar conta
          </h1>
          <p className="text-sm text-slate-500 mt-2">Cadastre seu mercado no SOLUÇÃO 2026</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome do mercado</label>
            <input type="text" required minLength={2} value={form.tenantName} onChange={set('tenantName')}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   placeholder="Mercado da Esquina" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ</label>
            <input type="text" required value={form.cnpj} onChange={set('cnpj')}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                   placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Seu nome</label>
            <input type="text" required minLength={2} value={form.userName} onChange={set('userName')}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   placeholder="Maria Souza" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input type="email" required value={form.email} onChange={set('email')}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   placeholder="seu@email.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input type="password" required minLength={6} value={form.password} onChange={set('password')}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   placeholder="mínimo 6 caracteres" />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
            {loading ? 'Criando conta…' : '🏪 Criar meu mercado'}
          </button>
        </form>

        <p className="text-sm text-slate-500 text-center mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
