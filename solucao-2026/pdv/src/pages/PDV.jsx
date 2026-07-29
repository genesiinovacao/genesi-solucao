import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth, API_BASE } from '../lib/auth';
import { cashSession } from '../lib/cashSession';
import { printerPrefs } from '../lib/printerPrefs';
import OpenCashModal from '../components/OpenCashModal';
import CloseCashModal from '../components/CloseCashModal';
import CashMovementModal from '../components/CashMovementModal';
import ReturnSaleModal from '../components/ReturnSaleModal';
import PrinterSettingsModal from '../components/PrinterSettingsModal';
import PaymentModal from '../components/PaymentModal';
import OperatorModal from '../components/OperatorModal';
import Receipt from '../components/Receipt';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export default function PDV() {
  const navigate = useNavigate();
  const user = auth.getUser();

  // ===== Catalogue & cart =====
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // ===== System state =====
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState(null);

  // ===== Cash session =====
  const [currentSession, setCurrentSession] = useState(null); // { id, openingAmount, openedAt, ... }
  const [showOpenCash, setShowOpenCash] = useState(false);
  const [showCloseCash, setShowCloseCash] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // ===== Modals =====
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCashMovement, setShowCashMovement] = useState(false);
  const [showReturnSale, setShowReturnSale] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [lastSale, setLastSale] = useState(null); // exibe cupom após venda
  const [operatorModal, setOperatorModal] = useState(null); // {mode, action, value, onDone}
  const [currentUser, setCurrentUser] = useState(user);     // operador do turno
  const [maxDiscount, setMaxDiscount] = useState(100);      // limite sem supervisor
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState(null);
  const [logo, setLogo] = useState(null);             // logo do cliente
  const [globalLogo, setGlobalLogo] = useState(null); // logo global do sistema
  const [storeName, setStoreName] = useState(null);

  const searchRef = useRef(null);

  // ---- Load catalogue from local SQLite ----
  const loadLocal = async () => {
    const [p, c, pending, settings] = await Promise.all([
      window.pdv.getProducts(),
      window.pdv.getCustomers(),
      window.pdv.getPendingSales(),
      window.pdv.getSettings().catch(() => null),
    ]);
    setProducts(p);
    setCustomers(c);
    setPendingCount(pending.length);
    setLogo(settings?.logoBase64 || null);
    setGlobalLogo(settings?.globalLogoBase64 || null);
    setStoreName(settings?.name || null);
    // Limite de desconto definido pela loja (acima disso, pede supervisor)
    if (settings?.maxDiscountPercent != null) setMaxDiscount(Number(settings.maxDiscountPercent));
  };

  // ---- Troca de turno: outro operador assume sem fechar o caixa ----
  const openOperatorSwitch = () => {
    if (cart.length > 0) {
      showToast('Finalize ou cancele a venda antes de trocar de operador.', 'error');
      return;
    }
    setOperatorModal({
      mode: 'switch',
      onDone: (data) => {
        auth.replaceSession({ accessToken: data.accessToken, user: data.user });
        setCurrentUser(data.user);
        setOperatorModal(null);
        showToast(`Caixa assumido por ${data.user.name}.`, 'success');
      },
    });
  };

  /**
   * Desconto acima do limite da loja exige supervisor. O valor só é aplicado
   * depois do aval — e o desconto autorizado é anulado se o operador mexer
   * de novo no percentual.
   */
  const onDiscountChange = (raw) => {
    const pct = Number(raw) || 0;
    setDiscountAuthorizedBy(null);

    if (pct <= maxDiscount) {
      setDiscountPct(raw);
      return;
    }

    setOperatorModal({
      mode: 'authorize',
      action: `desconto de ${pct}% (limite da loja: ${maxDiscount}%)`,
      value: pct,
      onDone: (result) => {
        setDiscountPct(raw);
        setDiscountAuthorizedBy(result.supervisorName);
        setOperatorModal(null);
        showToast(`Desconto de ${pct}% autorizado por ${result.supervisorName}.`, 'success', 4000);
      },
    });
  };

  // ---- Probe backend for current cash session ----
  const probeSession = async () => {
    setCheckingSession(true);
    try {
      const { data } = await api.get('/api/cash-sessions/current');
      if (data && data.id) {
        setCurrentSession(data);
        cashSession.set(data.id);
      } else {
        setCurrentSession(null);
        cashSession.clear();
        setShowOpenCash(true);
      }
    } catch (err) {
      // Fallback: usa o último id conhecido localmente para permitir vendas offline
      const fallback = cashSession.get();
      if (fallback) setCurrentSession({ id: fallback, _offline: true });
      else showToast('Offline: abra o caixa quando voltar online.', 'error', 5000);
    } finally {
      setCheckingSession(false);
    }
  };

  useEffect(() => {
    loadLocal();
    probeSession();
    const onOnline  = () => { setIsOnline(true); probeSession(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line
  }, []);

  // ---- Background sync ----
  const doSync = async () => {
    if (!isOnline) return;
    setSyncStatus('syncing');
    try {
      const r = await window.pdv.syncNow(API_BASE, auth.getAccessToken());
      setSyncStatus(r?.ok ? 'ok' : 'error');
      setSyncError(r?.ok ? null : r?.error || 'Falha na sincronização');
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err?.message || 'Falha na sincronização');
    }
    const pending = await window.pdv.getPendingSales();
    setPendingCount(pending.length);
  };

  useEffect(() => {
    const t = setInterval(doSync, 30000);
    if (isOnline) doSync();
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [isOnline]);

  // ---- Catalogue refresh (produtos/estoque alterados no dashboard) ----
  const [refreshing, setRefreshing] = useState(false);
  const refreshCatalog = async (manual = false) => {
    if (!navigator.onLine) {
      if (manual) showToast('Sem internet — usando o catálogo local.', 'error');
      return;
    }
    setRefreshing(true);
    try {
      // Vendas pendentes primeiro: o estoque do servidor só fica correto
      // depois delas — senão o snapshot sobrescreveria o estoque local
      // com um número que ainda não desconta o que foi vendido aqui.
      const pending = await window.pdv.getPendingSales();
      if (pending.length > 0) {
        const r = await window.pdv.syncNow(API_BASE, auth.getAccessToken());
        if (!r?.ok) {
          if (manual) showToast('Há vendas pendentes que não sincronizaram — catálogo mantido.', 'error');
          return;
        }
      }
      const [p, c, settings] = await Promise.all([
        api.get('/api/products', { params: { pageSize: 500 } }).then((r) => r.data.items),
        api.get('/api/customers', { params: { pageSize: 1000 } }).then((r) => r.data.items),
        api.get('/api/settings').then((r) => r.data).catch(() => null),
      ]);
      await window.pdv.saveSnapshot({ products: p, customers: c, settings });
      await loadLocal();
      if (manual) showToast('Catálogo atualizado.', 'success');
    } catch (err) {
      // Silencioso no automático — o PDV segue com o catálogo local
      if (manual) showToast(`Falha ao atualizar: ${err?.message || err}`, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const t = setInterval(() => refreshCatalog(false), 5 * 60 * 1000);
    if (isOnline) refreshCatalog(false); // já atualiza ao abrir a tela
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [isOnline]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (showOpenCash || showCloseCash || showPayment || showCashMovement || showReturnSale || showPrinterSettings || lastSale) return;
      // Leitor bipando com o foco fora do campo: captura o caractere em vez
      // de só focar, senão o primeiro dígito do código se perde.
      if (!inField && /^[\w\d]$/.test(e.key)) {
        e.preventDefault();
        searchRef.current?.focus();
        setSearch((s) => s + e.key);
      }
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F10' && cart.length > 0) { e.preventDefault(); openPayment(); }
      if (e.key === 'Escape') setCustomerPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [cart, showOpenCash, showCloseCash, showPayment, showCashMovement, showReturnSale, showPrinterSettings, lastSale]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['Todos', ...Array.from(set).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchSearch = !s || p.name.toLowerCase().includes(s) || p.barcode === search.trim() || p.sku === search.trim();
      const matchCat = category === 'Todos' || p.category === category;
      return matchSearch && matchCat && p.is_active;
    });
  }, [products, search, category]);

  /**
   * Bipe do leitor (ou Enter na busca). O termo vem do DOM, não do state:
   * o leitor "digita" o código inteiro em milissegundos e o Enter chega
   * antes do React reprocessar — usar o state perderia os últimos dígitos.
   * Código de barras e SKU são exatos e ignoram o filtro de categoria.
   */
  const handleScan = (rawTerm) => {
    const term = (rawTerm || '').trim();
    if (!term) return;

    const exact = products.find((p) => p.is_active && (p.barcode === term || p.sku === term));
    if (exact) {
      addToCart(exact);
      return;
    }

    const lower = term.toLowerCase();
    const byName = products.filter((p) => p.is_active && p.name.toLowerCase().includes(lower));
    if (byName.length === 1) {
      addToCart(byName[0]);
      return;
    }
    if (byName.length === 0) {
      // Sem isso o operador não sabe se o leitor falhou ou se falta cadastro
      showToast(`Nenhum produto com o código "${term}". Cadastre-o no dashboard.`, 'error', 5000);
      setSearch('');
    }
    // Vários resultados: mantém a lista filtrada para o operador escolher
  };

  const subtotal = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const discountAmount = subtotal * (Number(discountPct) || 0) / 100;
  const total = Math.max(0, subtotal - discountAmount);

  function showToast(text, kind = 'info', ms = 3000) {
    setToast({ text, kind });
    setTimeout(() => setToast(null), ms);
  }

  // ---- Cart ops ----
  const addToCart = (p) => {
    if (p.stock_quantity <= 0) return showToast(`${p.name} está sem estoque.`, 'error');
    setCart((prev) => {
      const found = prev.find((i) => i.productId === p.id);
      if (found) {
        if (found.quantity + 1 > p.stock_quantity) { showToast(`Estoque insuficiente: ${p.name}.`, 'error'); return prev; }
        return prev.map((i) => i.productId === p.id ? { ...i, quantity: i.quantity + 1, totalPrice: (i.quantity + 1) * i.unitPrice } : i);
      }
      return [...prev, {
        productId: p.id, productName: p.name, emoji: p.emoji,
        quantity: 1, unitPrice: p.sale_price, totalPrice: p.sale_price, discountAmount: 0,
        stockAvailable: p.stock_quantity,
      }];
    });
    setSearch('');
    // Deixa o campo pronto para o próximo bipe, mesmo se o item veio do clique
    searchRef.current?.focus();
  };

  const updateQty = (productId, delta) => setCart((prev) =>
    prev.flatMap((i) => {
      if (i.productId !== productId) return [i];
      const q = i.quantity + delta;
      if (q <= 0) return [];
      if (q > i.stockAvailable) { showToast(`Estoque máximo: ${i.stockAvailable}`, 'error'); return [i]; }
      return [{ ...i, quantity: q, totalPrice: q * i.unitPrice }];
    })
  );

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.productId !== id));
  const clearCart = () => { setCart([]); setDiscountPct(0); setSelectedCustomer(null); };

  // ---- Payment flow ----
  const openPayment = () => {
    if (!currentSession) return showToast('Abra o caixa antes de vender.', 'error');
    if (cart.length === 0) return showToast('Carrinho vazio.', 'error');
    setShowPayment(true);
  };

  const finalizeSale = async (paymentInfo) => {
    setShowPayment(false);
    const sale = {
      offlineSyncId: crypto.randomUUID(),
      saleDateIso: new Date().toISOString(),
      customerId: selectedCustomer?.id ?? null,
      customerName: selectedCustomer?.name ?? null,
      cashSessionId: currentSession?.id ?? null,
      subtotal,
      discountAmount,
      totalAmount: total,
      paymentMethod: paymentInfo.paymentMethod,
      amountReceived: paymentInfo.amountReceived,
      changeAmount: paymentInfo.changeAmount,
      items: cart.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: 0,
        totalPrice: i.totalPrice,
      })),
      payments: paymentInfo.payments,
    };

    try {
      await window.pdv.saveSale(sale);
      clearCart();
      await loadLocal();
      setLastSale(sale);
      if (isOnline) doSync();

      // Impressão automática silenciosa — se configurada.
      const prefs = printerPrefs.get();
      if (prefs.silent && prefs.auto) {
        window.pdv.printReceiptSilent({
          sale,
          tenantName: user?.tenantName,
          deviceName: prefs.deviceName || undefined,
          copies: prefs.copies || 1,
        }).then((r) => {
          if (!r.ok) showToast(`Impressora: ${r.error}`, 'error');
        });
      }
    } catch (err) {
      showToast(`Erro ao salvar: ${err?.message || err}`, 'error');
    }
  };

  // ---- Logout / close cash ----
  const handleLogout = async () => {
    if (cart.length > 0 && !confirm('Há itens no carrinho. Sair mesmo assim?')) return;
    auth.clear();
    cashSession.clear();
    navigate('/login');
  };

  const stockBadge = (p) => {
    if (p.stock_quantity <= 0) return 'bg-rose-500 text-white';
    if (p.stock_quantity <= p.min_stock) return 'bg-amber-500 text-white';
    return 'bg-emerald-600/30 text-emerald-300';
  };

  // Sessão é exigida para vender. Mostra modal de abertura se necessário.
  const sessionLocked = !currentSession && !checkingSession;

  return (
    <>
    <div className="bg-slate-950 text-slate-100 no-print"
         style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      {/* ===== LEFT: products. Padding-right reserva espaço pro aside fixed à direita ===== */}
      <div className="grid"
           style={{
             position: 'absolute', top: 0, left: 0, bottom: 0, right: 440,
             gridTemplateRows: 'auto auto minmax(0, 1fr)'
           }}>
        <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            {logo
              ? <img src={logo} alt="logo" className="w-10 h-10 object-contain rounded-lg bg-white/95 p-0.5" />
              : <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center text-xl">🛒</div>}
            <div>
              <h1 className="text-lg font-bold">
                {storeName || user?.tenantName || <>SOLUÇÃO <span className="text-blue-400">2026</span></>}
              </h1>
              <p className="text-xs text-slate-400">{storeName ? 'SOLUÇÃO 2026 · PDV' : user?.tenantName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {currentSession && (
              <>
                <button onClick={() => setShowCashMovement(true)}
                        className="px-3 py-1.5 bg-amber-900/40 text-amber-300 rounded-full text-xs hover:bg-amber-900/60">
                  💵 Sangria/Suprimento
                </button>
                <button onClick={() => setShowReturnSale(true)}
                        className="px-3 py-1.5 bg-rose-900/40 text-rose-300 rounded-full text-xs hover:bg-rose-900/60">
                  ↩️ Devolução
                </button>
                <button onClick={() => setShowCloseCash(true)} className="px-3 py-1.5 bg-emerald-900/40 text-emerald-300 rounded-full text-xs hover:bg-emerald-900/60">
                  💰 Caixa aberto · Fechar
                </button>
              </>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isOnline ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'}`}>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 pulse-online' : 'bg-rose-400'}`} />
              {isOnline ? 'Cloud Online' : 'Modo Offline'}
            </div>
            {pendingCount > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-amber-900/40 text-amber-300 text-xs">
                ⏳ {pendingCount} venda(s) na fila
              </span>
            )}
            {syncStatus === 'syncing' && <span className="text-slate-400 text-xs">Sincronizando…</span>}
            {syncStatus === 'error' && (
              <button onClick={doSync} title={syncError || 'Erro ao sincronizar'}
                      className="px-3 py-1.5 rounded-full bg-rose-900/40 text-rose-300 text-xs hover:bg-rose-900/60">
                ⚠️ Sync falhou · Tentar agora
              </button>
            )}
            <button onClick={() => refreshCatalog(true)} disabled={refreshing}
                    title="Atualizar catálogo agora (produtos e estoque do dashboard)"
                    className={`text-slate-400 hover:text-white text-sm px-2 ${refreshing ? 'animate-spin' : ''}`}>🔄</button>
            <button onClick={() => setShowPrinterSettings(true)} title="Configurar impressora térmica"
                    className="text-slate-400 hover:text-white text-sm px-2">🖨️</button>
            {globalLogo && (
              <img src={globalLogo} alt="SOLUÇÃO" title="SOLUÇÃO 2026"
                   className="h-8 object-contain rounded bg-white/95 p-0.5" />
            )}
            <button onClick={openOperatorSwitch} title="Trocar operador do caixa (troca de turno)"
                    className="text-slate-300 hover:text-white text-sm px-2 py-1 rounded-lg hover:bg-slate-800">
              👤 {currentUser?.name} <span className="text-slate-500 text-xs">⇄</span>
            </button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm">🚪 Sair</button>
          </div>
        </header>

        <div className="p-4 flex gap-3 border-b border-slate-800 bg-slate-900/30">
          <input ref={searchRef} type="text" placeholder="🔍 Buscar / escanear código de barras (F2)…"
                 value={search} onChange={(e) => setSearch(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     e.preventDefault();
                     handleScan(e.currentTarget.value);
                   }
                 }}
                 className="flex-1 bg-slate-800 border border-slate-700 px-4 py-3 rounded-lg text-base focus:border-blue-500 focus:outline-none" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="bg-slate-800 border border-slate-700 px-4 rounded-lg text-base focus:border-blue-500 focus:outline-none">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="min-h-0 overflow-y-auto p-4 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <p className="text-center text-slate-500 py-20">
              {products.length === 0
                ? 'Nenhum produto local. Saia e entre novamente para baixar o catálogo.'
                : 'Nenhum produto encontrado.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredProducts.map((p) => (
                <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock_quantity <= 0}
                        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl p-4 text-left border border-transparent hover:border-blue-500 transition-all">
                  <div className="text-3xl mb-2">{p.emoji}</div>
                  <div className="font-semibold text-sm leading-tight mb-1 line-clamp-2">{p.name}</div>
                  <div className="text-blue-400 font-bold text-lg">{brl(p.sale_price)}</div>
                  <div className={`text-[10px] mt-1.5 inline-block px-2 py-0.5 rounded-full font-medium ${stockBadge(p)}`}>
                    {p.stock_quantity <= 0 ? 'Zerado' : `${p.stock_quantity} ${p.unit}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== RIGHT: cart =====
           position:fixed ancora o painel ao canto direito da tela,
           garantindo que o footer (Total + botão Pagamento) NUNCA
           desça nem desapareça, não importa quantos itens entrem. */}
      <aside className="bg-slate-900 border-l border-slate-800 grid"
             style={{
               position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
               gridTemplateRows: 'auto minmax(0, 1fr) auto',
               overflow: 'hidden'
             }}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-lg">🛒 Carrinho ({cart.length})</h2>
          <button onClick={() => setCustomerPickerOpen(true)} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg">
            {selectedCustomer ? `👤 ${selectedCustomer.name.split(' ')[0]}` : '👤 Cliente'}
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-4 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="text-center text-slate-500 py-20">
              <div className="text-5xl mb-3 opacity-40">🛒</div>
              <p className="text-sm">Carrinho vazio.</p>
              <p className="text-xs mt-1 text-slate-600">Clique em um produto ou escaneie.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((i) => (
                <div key={i.productId} className="bg-slate-950/50 p-3 rounded-lg flex items-center gap-3">
                  <span className="text-2xl">{i.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{i.productName}</div>
                    <div className="text-xs text-slate-400">{brl(i.unitPrice)} cada</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(i.productId, -1)} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 rounded text-sm">−</button>
                    <span className="w-8 text-center font-bold">{i.quantity}</span>
                    <button onClick={() => updateQty(i.productId, +1)} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 rounded text-sm">+</button>
                  </div>
                  <button onClick={() => removeItem(i.productId)} className="text-rose-400 hover:text-rose-300 text-xs ml-1">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/30">
          <div className="flex justify-between text-sm text-slate-400">
            <span>Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">Desconto (%)</label>
            <input type="number" min="0" max="100" step="0.5" value={discountPct}
                   onChange={(e) => onDiscountChange(e.target.value)}
                   className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-right text-emerald-400 font-mono" />
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-xs text-emerald-400">
              <span>Desconto{discountAuthorizedBy && ` · aut. ${discountAuthorizedBy}`}</span>
              <span>- {brl(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-end pt-2 border-t border-slate-800">
            <span className="text-sm font-medium">TOTAL</span>
            <span className="text-3xl font-extrabold text-blue-400">{brl(total)}</span>
          </div>

          <button onClick={openPayment} disabled={cart.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-xl text-lg shadow-lg shadow-emerald-900/30">
            💳 Pagamento · F10
          </button>
          {cart.length > 0 && (
            <button onClick={clearCart} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1">
              Cancelar venda
            </button>
          )}
        </div>
      </aside>

      {/* ===== Modais ===== */}
      {sessionLocked && showOpenCash && <OpenCashModal onOpened={(s) => { setCurrentSession(s); setShowOpenCash(false); }} />}

      {showCloseCash && currentSession && (
        <CloseCashModal
          sessionId={currentSession.id}
          syncBeforeClose={doSync}
          onClose={() => setShowCloseCash(false)}
          onClosed={() => { handleLogout(); }}
        />
      )}

      {showPayment && (
        <PaymentModal total={total} onCancel={() => setShowPayment(false)} onConfirm={finalizeSale} />
      )}

      {showCashMovement && currentSession && (
        <CashMovementModal
          sessionId={currentSession.id}
          onClose={() => setShowCashMovement(false)}
          onDone={({ type, amount }) => {
            setShowCashMovement(false);
            showToast(
              `${type === 'withdraw' ? 'Sangria' : 'Suprimento'} de ${brl(amount)} registrado.`,
              'success'
            );
          }}
        />
      )}

      {showReturnSale && (
        <ReturnSaleModal
          onClose={() => setShowReturnSale(false)}
          onDone={(ret) => {
            setShowReturnSale(false);
            const credit = ret.customerCreditAfter != null
              ? ` · Crédito do cliente: ${brl(ret.customerCreditAfter)}`
              : '';
            showToast(`Devolução ${brl(ret.totalRefund)} registrada${credit}.`, 'success', 5000);
            loadLocal();
          }}
        />
      )}

      {showPrinterSettings && (
        <PrinterSettingsModal onClose={() => setShowPrinterSettings(false)} />
      )}

      {operatorModal && (
        <OperatorModal
          mode={operatorModal.mode}
          action={operatorModal.action}
          value={operatorModal.value}
          onDone={operatorModal.onDone}
          onClose={() => setOperatorModal(null)}
        />
      )}

      {customerPickerOpen && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-6 z-50" onClick={() => setCustomerPickerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
            <header className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold">👤 Selecionar cliente</h3>
              <button onClick={() => { setSelectedCustomer(null); setCustomerPickerOpen(false); }}
                      className="text-xs text-slate-400 hover:text-slate-200">Limpar seleção</button>
            </header>
            <div className="flex-1 overflow-auto p-2 custom-scrollbar">
              {customers.length === 0 && <p className="text-center text-slate-500 py-10 text-sm">Sem clientes locais.</p>}
              {customers.map((c) => (
                <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerPickerOpen(false); }}
                        className="block w-full text-left px-4 py-3 hover:bg-slate-800 rounded">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.tax_id || c.phone || '—'} · {c.loyalty_points} pts</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl border z-50 no-print ${
          toast.kind === 'success' ? 'bg-emerald-900 border-emerald-600 text-emerald-100' :
          toast.kind === 'error'   ? 'bg-rose-900 border-rose-600 text-rose-100' :
                                     'bg-slate-800 border-slate-600 text-slate-100'
        }`}>
          {toast.text}
        </div>
      )}
    </div>

    {/* Renderizado FORA do .no-print para que .receipt-print apareça na impressão */}
    {lastSale && (
      <Receipt sale={lastSale}
               onClose={() => setLastSale(null)}
               onPrint={() => window.print()} />
    )}
    </>
  );
}
