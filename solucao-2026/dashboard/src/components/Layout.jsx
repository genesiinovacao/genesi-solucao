import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { daysUntil } from '../lib/dates';
import { createStockConnection } from '../lib/stockHub';
import RenewSubscription from './RenewSubscription';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.getUser();
  const [stockAlerts, setStockAlerts] = useState([]);
  const [branding, setBranding] = useState(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [stores, setStores] = useState([]);        // lojas da rede (quando houver)
  const [switching, setSwitching] = useState(false);

  // Rede de lojas: só aparece se o cliente tiver mais de uma unidade
  useEffect(() => {
    if (isSuper) return;
    api.get('/api/auth/stores')
      .then(({ data }) => setStores(data.length > 1 ? data : []))
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchStore = async (tenantId) => {
    setSwitching(true);
    try {
      const { data } = await api.post('/api/auth/switch-store', { tenantId });
      // Troca só o token de acesso: a sessão de suporte (se houver) permanece
      auth.replaceSession({ accessToken: data.accessToken, user: data.user });
      window.location.assign('/dashboard');
    } catch (err) {
      alert(err.response?.data?.error || 'Não foi possível trocar de loja.');
      setSwitching(false);
    }
  };

  // Logos + validade da assinatura (para o lembrete de pagamento)
  useEffect(() => {
    api.get('/api/settings')
      .then(({ data }) => setBranding({
        clientLogo: data.logoBase64,
        globalLogo: data.globalLogoBase64,
        segment: data.segment,
        planType: data.planType,
        subscriptionExpiresAt: data.subscriptionExpiresAt,
        subscriptionBlocked: data.subscriptionBlocked,
        subscriptionIsBonus: data.subscriptionIsBonus,
      }))
      .catch(() => setBranding(null));
  }, []);

  // Dias até expirar a assinatura (null = sem controle / não carregado)
  const subDaysLeft = branding?.subscriptionExpiresAt
    ? daysUntil(branding.subscriptionExpiresAt)
    : null;
  const showSubscriptionWarning = subDaysLeft !== null && subDaysLeft <= 3;

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

  // Superadmin é gestor da plataforma, não uma loja: só vê a Administração.
  const isSuper = user?.role === 'superadmin';
  const impersonating = auth.isImpersonating();

  const exitImpersonation = () => {
    auth.exitImpersonation();
    window.location.assign('/admin');
  };
  const navItems = isSuper
    ? [
        { to: '/admin',   label: 'Administração', icon: '🛠️' },
        // Sem isto o superadmin não teria como trocar a própria senha pela
        // tela: o menu dele não passa por Configurações.
        { to: '/account', label: 'Minha conta',   icon: '🔑' },
      ]
    : [
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
        // Gestão de equipe/PDVs é restrita ao admin da loja
        ...(user?.role === 'admin' ? [{ to: '/team', label: 'Equipe & PDVs', icon: '🧑‍💼' }] : []),
        { to: '/settings',   label: 'Configurações', icon: '⚙️' },
      ];

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          {isSuper ? (
            <div className="flex items-center gap-3">
              {branding?.globalLogo
                ? <img src={branding.globalLogo} alt="logo" className="w-11 h-11 object-contain rounded-lg bg-white/95 p-1" />
                : <div className="w-11 h-11 rounded-lg bg-blue-600 flex items-center justify-center text-xl">🛠️</div>}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">SOLUÇÃO 2026</p>
                <p className="text-[11px] text-slate-400">Painel da Plataforma</p>
              </div>
            </div>
          ) : (
            // Logo da loja à frente da marca; sem logo, só a marca
            <div className="flex items-center gap-3">
              {branding?.clientLogo && (
                <img src={branding.clientLogo} alt={user?.tenantName || 'Logo da loja'}
                     className="w-12 h-12 object-contain rounded-lg bg-white/95 p-1 shrink-0" />
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">
                  SOLUÇÃO <span className="text-blue-400">2026</span>
                </h1>
                <p className="text-xs text-slate-400 truncate">{user?.tenantName}</p>
              </div>
            </div>
          )}
        </div>

        {/* Rede de lojas: alterna a filial ativa sem novo login */}
        {stores.length > 1 && (
          <div className="px-4 pt-4">
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              🏬 Loja ativa
            </label>
            <select
              value={stores.find((s) => s.isCurrent)?.id || ''}
              disabled={switching}
              onChange={(e) => switchStore(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.isActive}>
                  {s.name}{!s.isActive ? ' (bloqueada)' : ''}
                </option>
              ))}
            </select>
            {switching && <p className="text-[11px] text-slate-400 mt-1">Trocando de loja…</p>}
          </div>
        )}

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

        {/* Validade do acesso — cortesia em destaque, para o cliente saber
            até quando vale sem precisar perguntar ao suporte */}
        {!isSuper && branding?.subscriptionExpiresAt && (
          <div className="px-4 pb-3">
            {branding.subscriptionIsBonus ? (
              <div className="rounded-lg bg-purple-500/15 border border-purple-400/30 px-3 py-2">
                <p className="text-[11px] font-bold text-purple-200">🎁 Período de cortesia</p>
                <p className="text-[11px] text-purple-200/75 mt-0.5">
                  Válido até {new Date(`${branding.subscriptionExpiresAt}T12:00:00`).toLocaleDateString('pt-BR')}
                  {subDaysLeft !== null && subDaysLeft >= 0 && (
                    <> · {subDaysLeft === 0 ? 'último dia' : subDaysLeft === 1 ? 'resta 1 dia' : `restam ${subDaysLeft} dias`}</>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 px-1">
                Assinatura até {new Date(`${branding.subscriptionExpiresAt}T12:00:00`).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        )}

        {!isSuper && branding?.globalLogo && (
          <div className="px-4 pb-3 flex items-center justify-center gap-2">
            <img src={branding.globalLogo} alt="SOLUÇÃO" className="h-7 object-contain rounded bg-white/95 p-0.5" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">SOLUÇÃO 2026</span>
          </div>
        )}

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

      <main className="flex-1 overflow-auto flex flex-col">
        {impersonating && (
          <div className="bg-amber-400 text-amber-950 px-4 py-2 text-sm font-medium flex items-center justify-between gap-3 shrink-0">
            <span>👁️ Acesso de suporte: você está vendo o painel de <strong>{user?.tenantName}</strong></span>
            <button onClick={exitImpersonation}
                    className="px-3 py-1 bg-amber-950 text-amber-100 rounded-md text-xs font-semibold hover:bg-amber-900 shrink-0">
              ← Voltar ao painel admin
            </button>
          </div>
        )}
        {!isSuper && showSubscriptionWarning && !branding?.subscriptionBlocked && (
          <div className={`px-4 py-2 text-sm font-medium shrink-0 flex items-center justify-between gap-3 ${
            subDaysLeft < 0 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900 border-b border-amber-300'}`}>
            <span>
              {subDaysLeft < 0 ? (
                <>⛔ Sua assinatura <strong>venceu</strong> em {new Date(`${branding.subscriptionExpiresAt}T12:00:00`).toLocaleDateString('pt-BR')}.
                  Renove agora para não perder o acesso.</>
              ) : (
                <>⚠️ Sua assinatura vence {subDaysLeft === 0 ? 'hoje' : subDaysLeft === 1 ? 'amanhã' : `em ${subDaysLeft} dias`}
                  {' '}({new Date(`${branding.subscriptionExpiresAt}T12:00:00`).toLocaleDateString('pt-BR')}).</>
              )}
            </span>
            {user?.role === 'admin' && (
              <button onClick={() => setRenewOpen(true)}
                      className={`px-3 py-1 rounded-md text-xs font-bold shrink-0 ${
                        subDaysLeft < 0 ? 'bg-white text-red-700 hover:bg-red-50' : 'bg-amber-900 text-amber-50 hover:bg-amber-800'}`}>
                💠 Renovar via PIX
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {!isSuper && branding?.subscriptionBlocked && !impersonating ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-md text-center space-y-4">
                <div className="text-6xl">🔒</div>
                <h2 className="text-xl font-bold text-slate-800">Assinatura vencida</h2>
                <p className="text-sm text-slate-600">
                  Sua assinatura venceu em{' '}
                  <strong>{new Date(`${branding.subscriptionExpiresAt}T12:00:00`).toLocaleDateString('pt-BR')}</strong>{' '}
                  e o período de carência terminou. Renove para voltar a usar o sistema —
                  seus dados estão preservados.
                </p>
                {user?.role === 'admin' ? (
                  <button onClick={() => setRenewOpen(true)}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold">
                    💠 Renovar assinatura via PIX
                  </button>
                ) : (
                  <p className="text-xs text-slate-400">Peça ao administrador da loja para renovar a assinatura.</p>
                )}
                {/* Saída de emergência: nenhuma tela pode prender o usuário */}
                <div className="pt-2">
                  {impersonating ? (
                    <button onClick={exitImpersonation} className="text-xs text-slate-500 hover:text-slate-800 underline">
                      ← Voltar ao painel administrativo
                    </button>
                  ) : (
                    <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-700 underline">
                      Sair da conta
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>

      {renewOpen && (
        <RenewSubscription
          currentPlan={branding?.planType}
          onClose={() => setRenewOpen(false)}
          onRenewed={() => window.location.reload()}
        />
      )}

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
