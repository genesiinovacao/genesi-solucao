import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { createStockConnection } from '../lib/stockHub';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.getUser();
  const [stockAlerts, setStockAlerts] = useState([]);
  const [branding, setBranding] = useState(null);

  // Logo do cliente (ou a global da plataforma como fallback)
  useEffect(() => {
    api.get('/api/settings')
      .then(({ data }) => setBranding({ logo: data.logoBase64 || data.globalLogoBase64, segment: data.segment }))
      .catch(() => setBranding(null));
  }, []);

  // Alertas de estoque em tempo real (SignalR)
  useEffect(() => {
    const conn = createStockConnection();
    conn.on('LowStock', (alerts) => {
      const stamped = alerts.map((a) => ({ ...a, _key: `${a.productId}-${Date.now()}` }));
      setStockAlerts((prev) => [...prev, ...stamped].slice(-5));
      stamped.forEach((a) =>
        setTimeout(() => setStockAlerts((prev) => prev.filter((x) => x._key !== a._key)), 12000));
    });
    conn.start().catch(() => { /* backend offline — reconexão automática cuida */ });
    return () => { conn.stop(); };
  }, []);

  const handleLogout = () => {
    auth.clear();
    navigate('/login');
  };

  const navItems = [
    ...(user?.role === 'superadmin' ? [{ to: '/admin', label: 'Administração', icon: '🛠️' }] : []),
    { to: '/dashboard',  label: 'Dashboard',     icon: '📊' },
    { to: '/products',   label: 'Produtos',      icon: '📦' },
    { to: '/customers',  label: 'Clientes',      icon: '👥' },
    { to: '/sales',      label: 'Vendas',        icon: '🧾' },
    { to: '/suppliers',  label: 'Fornecedores',  icon: '🏭' },
    { to: '/financial',  label: 'Financeiro',    icon: '💰' },
    { to: '/promotions', label: 'Promoções',     icon: '🏷️' },
    { to: '/delivery',   label: 'Delivery',      icon: '🚴' },
    { to: '/reports',    label: 'Relatórios',    icon: '📈' },
    { to: '/ai',         label: 'SOLUÇÃO IA',    icon: '🤖' },
    { to: '/settings',   label: 'Configurações', icon: '⚙️' },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          {branding?.logo ? (
            <div className="flex items-center gap-3">
              <img src={branding.logo} alt="logo"
                   className="w-11 h-11 object-contain rounded-lg bg-white/95 p-1" />
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{user?.tenantName}</p>
                <p className="text-[11px] text-slate-400">SOLUÇÃO 2026</p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold">
                SOLUÇÃO <span className="text-blue-400">2026</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">{user?.tenantName}</p>
            </>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
              {user?.name?.slice(0, 2).toUpperCase() || '??'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-slate-400 hover:text-white px-2 py-1.5 rounded transition-colors"
          >
            🚪 Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {stockAlerts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
          {stockAlerts.map((a) => (
            <div key={a._key}
                 className="bg-amber-50 border border-amber-300 rounded-xl shadow-lg p-4 text-sm flex gap-3 items-start">
              <span className="text-xl">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-900">Estoque crítico: {a.name}</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Restam {a.stockQuantity} (mínimo {a.minStock})
                  {a.daysRemaining != null && ` · ruptura em ~${a.daysRemaining} dia(s)`}
                </p>
              </div>
              <button onClick={() => setStockAlerts((prev) => prev.filter((x) => x._key !== a._key))}
                      className="text-amber-400 hover:text-amber-700">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
