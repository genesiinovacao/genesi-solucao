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
import ShortcutsModal from '../components/ShortcutsModal';
import QuoteModal from '../components/QuoteModal';
import Receipt from '../components/Receipt';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

/**
 * Separa o multiplicador do termo: "12*7891234" → { times: 12, term: '7891234' }.
 * Usado tanto pelo lançamento quanto pela grade de produtos — sem tirar o
 * prefixo do filtro, a tela dizia "nenhum produto encontrado" enquanto o
 * operador digitava "2*Suco", mesmo com o Enter funcionando.
 *
 * Só o asterisco multiplica. Aceitar "x" também parecia gentileza, mas
 * "2x4" é nome de parafuso, de madeira e de mangueira: o PDV lançaria duas
 * unidades onde o operador quis uma. Quantidade errada em venda é dinheiro
 * errado, e o "*" é o que o caixa já tem no teclado numérico.
 */
function parseQuantityPrefix(raw) {
  const text = (raw || '').trim();
  const m = text.match(/^(\d+)\s*\*\s*(.+)$/);
  if (!m) return { times: 1, term: text };
  return { times: Math.min(999, Number(m[1]) || 1), term: m[2].trim() };
}

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
  const [surcharge, setSurcharge] = useState('');   // acréscimo em R$ (entrega, taxa)
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
  const [promotions, setPromotions] = useState([]);         // vigentes, do dashboard
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState(null);
  const [logo, setLogo] = useState(null);             // logo do cliente
  const [globalLogo, setGlobalLogo] = useState(null); // logo global do sistema
  const [storeName, setStoreName] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  // Orçamento reaberto no carrinho: viaja junto da venda para o servidor
  // marcar o papel do cliente como fechado.
  const [activeQuote, setActiveQuote] = useState(null);
  // Item destacado no carrinho — é nele que ↑/↓, +/- e Delete agem.
  // Guardado por produto, não por posição: assim o destaque não pula quando
  // um item é removido ou quando o bipe repetido funde duas linhas.
  const [selectedId, setSelectedId] = useState(null);

  const searchRef = useRef(null);
  const discountRef = useRef(null);
  const surchargeRef = useRef(null);
  const cartRef = useRef(null);

  // Posição do destaque. Item removido → cai no primeiro, nunca em índice morto.
  const selectedIndex = Math.max(0, cart.findIndex((i) => i.productId === selectedId));

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
    setPromotions(settings?.promotions || []);
  };

  // ---- Promoções cadastradas no dashboard ----

  const tierOf = (points) => (points >= 1000 ? 'gold' : points >= 500 ? 'silver' : 'bronze');

  /** Promoção vigente que mais desconta para este produto (e cliente, se houver). */
  const promoFor = (product, customer) => {
    const today = new Date().toISOString().slice(0, 10);
    const category = (product.category || '').trim().toLowerCase();

    const applicable = promotions.filter((p) => {
      if (!p.isActive) return false;
      if (p.startsAt > today || p.endsAt < today) return false;
      const target = (p.targetValue || '').trim().toLowerCase();
      switch (p.targetType) {
        case 'product':  return p.targetValue === product.id;
        case 'category': return !!category && target === category;
        case 'loyalty':  return !!customer && target === tierOf(customer.loyalty_points || 0);
        default:         return false;   // 'total' entra no desconto do carrinho
      }
    });

    return applicable.sort((a, b) => b.discountPercent - a.discountPercent)[0] || null;
  };

  /** Promoção do tipo 'total' vigente — desconto automático no carrinho. */
  const totalPromo = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return promotions
      .filter((p) => p.isActive && p.targetType === 'total' && p.startsAt <= today && p.endsAt >= today)
      .sort((a, b) => b.discountPercent - a.discountPercent)[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotions]);

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
      action: maxDiscount === 0
        ? `desconto de ${pct}% (o caixa não tem alçada para desconto)`
        : `desconto de ${pct}% (limite da loja: ${maxDiscount}%)`,
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
      const [p, c, settings, promos] = await Promise.all([
        api.get('/api/products', { params: { pageSize: 500 } }).then((r) => r.data.items),
        api.get('/api/customers', { params: { pageSize: 1000 } }).then((r) => r.data.items),
        api.get('/api/settings').then((r) => r.data).catch(() => null),
        api.get('/api/promotions', { params: { state: 'active', pageSize: 200 } })
          .then((r) => r.data.items).catch(() => []),
      ]);
      await window.pdv.saveSnapshot({
        products: p, customers: c, settings: { ...(settings || {}), promotions: promos },
      });
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
  // Caixa de supermercado opera sem mouse: tudo que dá para clicar precisa
  // ter tecla. As de função agem na tela de venda; ↑/↓/+/-/Delete agem no
  // item destacado do carrinho, mas só com a busca vazia — senão atrapalham
  // quem está digitando o nome do produto.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const anyModal = showOpenCash || showCloseCash || showPayment || showCashMovement
        || showReturnSale || showPrinterSettings || lastSale || operatorModal
        || customerPickerOpen || showShortcuts || showQuote;

      // Esc sempre fecha o que está por cima: sem mouse, ficar preso num
      // modal é o pior que pode acontecer no meio de uma fila.
      if (e.key === 'Escape') {
        if (showShortcuts)          setShowShortcuts(false);
        else if (showQuote)          setShowQuote(false);
        else if (customerPickerOpen) setCustomerPickerOpen(false);
        else if (lastSale)           setLastSale(null);
        else if (showPayment)        setShowPayment(false);
        else if (showCashMovement)   setShowCashMovement(false);
        else if (showReturnSale)     setShowReturnSale(false);
        else if (showPrinterSettings) setShowPrinterSettings(false);
        else if (operatorModal)      setOperatorModal(null);
        return;
      }

      // Com modal aberto, quem manda são os atalhos dele
      if (anyModal) return;

      switch (e.key) {
        case 'F1':  e.preventDefault(); setShowShortcuts(true); return;
        case 'F2':  e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return;
        case 'F3':  e.preventDefault(); setCustomerPickerOpen(true); return;
        case 'F4':  e.preventDefault(); discountRef.current?.focus(); discountRef.current?.select(); return;
        case 'F5':  e.preventDefault(); refreshCatalog(true); return;
        case 'F6':  e.preventDefault(); if (currentSession) setShowCashMovement(true); return;
        case 'F7':  e.preventDefault(); if (currentSession) setShowReturnSale(true); return;
        case 'F8':  e.preventDefault(); surchargeRef.current?.focus(); surchargeRef.current?.select(); return;
        case 'F9':  e.preventDefault(); requestCancelSale(); return;
        case 'F10': e.preventDefault(); openPayment(); return;
        case 'F11': e.preventDefault(); setShowQuote(true); return;
        case 'F12': e.preventDefault(); if (currentSession) setShowCloseCash(true); return;
        default: break;
      }

      // Navegação do carrinho funciona mesmo com o foco na busca: o campo é
      // de uma linha só, as setas não fazem falta nele.
      if (cart.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.min(cart.length - 1, Math.max(0, selectedIndex + delta));
        setSelectedId(cart[next].productId);
        return;
      }

      // Busca vazia = o operador não está digitando, então as teclas de
      // edição podem agir no item destacado sem roubar o que ele escreve.
      const searchEmpty = !(searchRef.current?.value || '').trim();
      const item = cart[selectedIndex];
      if (searchEmpty && item) {
        if (e.key === '+') { e.preventDefault(); updateQty(item.productId, +1); return; }
        if (e.key === '-') { e.preventDefault(); updateQty(item.productId, -1); return; }
        if (e.key === 'Delete') { e.preventDefault(); removeItem(item.productId); return; }
      }

      // Leitor bipando com o foco fora do campo: captura o caractere em vez
      // de só focar, senão o primeiro dígito do código se perde.
      if (!inField && /^[\w\d]$/.test(e.key)) {
        e.preventDefault();
        searchRef.current?.focus();
        setSearch((s) => s + e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [cart, selectedIndex, currentSession, showOpenCash, showCloseCash, showPayment,
      showCashMovement, showReturnSale, showPrinterSettings, lastSale, operatorModal,
      customerPickerOpen, showShortcuts, showQuote]);

  // Mantém o item destacado visível quando a lista passa da altura do painel
  useEffect(() => {
    cartRef.current?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, cart.length]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['Todos', ...Array.from(set).sort()];
  }, [products]);

  // A grade responde às duas leituras do que está digitado: "2*Suco" filtra
  // por "Suco", mas "2x4" continua achando o parafuso 2x4 pelo texto cru.
  const filteredProducts = useMemo(() => {
    const raw = search.trim().toLowerCase();
    const stripped = parseQuantityPrefix(search).term.toLowerCase();
    return products.filter((p) => {
      // SKU é cadastrado em maiúsculas e digitado como der: comparar sem
      // normalizar os dois lados faria o código interno não achar nada.
      const name = p.name.toLowerCase();
      const code = (p.barcode || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const matchSearch = !raw
        || name.includes(raw) || name.includes(stripped)
        || code === raw || code === stripped
        || sku === raw || sku === stripped;
      const matchCat = category === 'Todos' || p.category === category;
      return matchSearch && matchCat && p.is_active;
    });
  }, [products, search, category]);

  /**
   * Bipe do leitor (ou Enter na busca). O termo vem do DOM, não do state:
   * o leitor "digita" o código inteiro em milissegundos e o Enter chega
   * antes do React reprocessar — usar o state perderia os últimos dígitos.
   * Código de barras e SKU são exatos e ignoram o filtro de categoria.
   *
   * O texto cru é tentado antes do multiplicador: um SKU que por acaso
   * comece com "2x" tem de vencer a leitura de "2 unidades de x".
   */
  const handleScan = (rawTerm) => {
    const raw = (rawTerm || '').trim();
    if (!raw) return;

    // Leitor manda o código como está; o operador digita o SKU como quer.
    // A comparação normaliza os dois lados para não depender disso.
    const codeOf = (p) => (p.barcode || '').toLowerCase();
    const skuOf = (p) => (p.sku || '').toLowerCase();
    const matchesCode = (p, v) => codeOf(p) === v || skuOf(p) === v;

    const rawLower = raw.toLowerCase();
    const exactRaw = products.find((p) => p.is_active && matchesCode(p, rawLower));
    if (exactRaw) { addToCart(exactRaw, 1); return; }

    const { times, term } = parseQuantityPrefix(raw);

    const exact = products.find((p) => p.is_active && matchesCode(p, term.toLowerCase()));
    if (exact) { addToCart(exact, times); return; }

    const byName = (needle) => {
      const lower = needle.toLowerCase();
      return products.filter((p) => p.is_active && p.name.toLowerCase().includes(lower));
    };

    const byStripped = byName(term);
    if (byStripped.length === 1) { addToCart(byStripped[0], times); return; }

    // "2x4" achando o parafuso pelo nome inteiro: uma unidade, não duas
    if (times > 1) {
      const byRaw = byName(raw);
      if (byRaw.length === 1) { addToCart(byRaw[0], 1); return; }
    }

    if (byStripped.length === 0) {
      // Sem isso o operador não sabe se o leitor falhou ou se falta cadastro
      showToast(`Nenhum produto com o código "${term}". Cadastre-o no dashboard.`, 'error', 5000);
      setSearch('');
    }
    // Vários resultados: mantém a lista filtrada para o operador escolher
  };

  // Subtotal é sempre o bruto; promoções e desconto manual somam no abatimento
  const subtotal = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const promoDiscount = cart.reduce((sum, i) => sum + (i.discountAmount || 0), 0);
  const afterPromo = subtotal - promoDiscount;
  // Promoção "sobre o total" e desconto manual não se acumulam: vale o maior
  const effectivePct = Math.max(Number(discountPct) || 0, totalPromo?.discountPercent || 0);
  const manualDiscount = afterPromo * effectivePct / 100;
  const discountAmount = promoDiscount + manualDiscount;
  // Acréscimo (entrega, taxa repassada) entra depois do desconto e nunca é
  // abatido por ele — é cobrança extra, não parte da mercadoria.
  const surchargeAmount = Math.max(0, Number(surcharge) || 0);
  const total = Math.max(0, subtotal - discountAmount) + surchargeAmount;

  function showToast(text, kind = 'info', ms = 3000) {
    setToast({ text, kind });
    setTimeout(() => setToast(null), ms);
  }

  // ---- Cart ops ----

  /** Recalcula o item mantendo o percentual da promoção aplicada. */
  const withQuantity = (item, quantity) => {
    const gross = quantity * item.unitPrice;
    const discount = gross * ((item.promoPercent || 0) / 100);
    return { ...item, quantity, discountAmount: discount, totalPrice: gross - discount };
  };

  const addToCart = (p, qty = 1) => {
    if (p.stock_quantity <= 0) return showToast(`${p.name} está sem estoque.`, 'error');
    setCart((prev) => {
      const found = prev.find((i) => i.productId === p.id);
      if (found) {
        if (found.quantity + qty > p.stock_quantity) { showToast(`Estoque insuficiente: ${p.name}.`, 'error'); return prev; }
        return prev.map((i) => i.productId === p.id ? withQuantity(i, i.quantity + qty) : i);
      }
      if (qty > p.stock_quantity) { showToast(`Estoque insuficiente: ${p.name}.`, 'error'); return prev; }
      const promo = promoFor(p, selectedCustomer);
      const pct = promo?.discountPercent || 0;
      const gross = p.sale_price * qty;
      return [...prev, {
        productId: p.id, productName: p.name, emoji: p.emoji,
        quantity: qty, unitPrice: p.sale_price,
        totalPrice: gross * (1 - pct / 100),
        discountAmount: gross * (pct / 100),
        promoName: promo?.name || null,
        promoPercent: pct,
        stockAvailable: p.stock_quantity,
      }];
    });
    setSearch('');
    // Destaca o que acabou de entrar: +/- e Delete agem nele sem navegar
    setSelectedId(p.id);
    // Deixa o campo pronto para o próximo bipe, mesmo se o item veio do clique
    searchRef.current?.focus();
  };

  const updateQty = (productId, delta) => setCart((prev) =>
    prev.flatMap((i) => {
      if (i.productId !== productId) return [i];
      const q = i.quantity + delta;
      if (q <= 0) return [];
      if (q > i.stockAvailable) { showToast(`Estoque máximo: ${i.stockAvailable}`, 'error'); return [i]; }
      return [withQuantity(i, q)];
    })
  );

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.productId !== id));
  const clearCart = () => {
    setCart([]); setDiscountPct(0); setSurcharge(''); setSelectedCustomer(null);
    setActiveQuote(null);
  };

  /**
   * Cliente voltou com o papel: devolve o orçamento ao carrinho. Mantém os
   * preços que foram prometidos, mas avisa quais mudaram desde então — em
   * autopeças o preço da peça sobe entre o orçamento e a volta do cliente.
   */
  const loadQuoteIntoCart = (quote) => {
    const changed = [];
    const missing = [];

    const items = quote.items.map((qi) => {
      const p = products.find((x) => x.id === qi.productId);
      if (!p) missing.push(qi.productName);
      else if (Math.abs(Number(p.sale_price) - Number(qi.unitPrice)) > 0.005) changed.push(p.name);

      const gross = qi.quantity * qi.unitPrice;
      return {
        productId: qi.productId,
        productName: qi.productName,
        emoji: p?.emoji || '📦',
        quantity: qi.quantity,
        unitPrice: qi.unitPrice,
        discountAmount: qi.discountAmount || 0,
        totalPrice: qi.totalPrice,
        promoName: null,
        promoPercent: gross > 0 ? (qi.discountAmount || 0) / gross * 100 : 0,
        stockAvailable: p?.stock_quantity ?? qi.quantity,
      };
    });

    setCart(items);
    setSurcharge(quote.surchargeAmount ? String(quote.surchargeAmount) : '');

    // Desconto manual que sobrou depois das promoções já embutidas nos itens.
    // Restaurado direto, sem pedir supervisor: o aval foi dado quando o
    // orçamento foi montado.
    const promo = items.reduce((s, i) => s + (i.discountAmount || 0), 0);
    const afterPromo = quote.subtotal - promo;
    const manual = Math.max(0, quote.discountAmount - promo);
    setDiscountPct(afterPromo > 0 ? Number((manual / afterPromo * 100).toFixed(4)) : 0);

    if (quote.customerId) {
      const c = customers.find((x) => x.id === quote.customerId);
      if (c) setSelectedCustomer(c);
    }

    setActiveQuote({ id: quote.id, number: quote.number });
    setShowQuote(false);
    searchRef.current?.focus();

    const avisos = [];
    if (changed.length) avisos.push(`preço mudou: ${changed.join(', ')}`);
    if (missing.length) avisos.push(`fora do catálogo: ${missing.join(', ')}`);
    showToast(
      avisos.length
        ? `Orçamento nº ${quote.number} carregado — ${avisos.join(' · ')}.`
        : `Orçamento nº ${quote.number} carregado.`,
      avisos.length ? 'error' : 'success',
      avisos.length ? 8000 : 3000
    );
  };

  /**
   * Cancelar a venda exige dois toques. F9 fica colado no F10 (pagamento):
   * um dedo escorregando apagaria o carrinho inteiro no meio da fila.
   */
  const cancelArmRef = useRef(0);
  const requestCancelSale = () => {
    if (cart.length === 0) return;
    if (Date.now() - cancelArmRef.current < 4000) {
      cancelArmRef.current = 0;
      clearCart();
      showToast('Venda cancelada.', 'success');
      return;
    }
    cancelArmRef.current = Date.now();
    showToast('Pressione F9 de novo para cancelar a venda.', 'error', 4000);
  };

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
      surchargeAmount,
      totalAmount: total,
      quoteId: activeQuote?.id ?? null,
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
          tenantName: storeName || user?.tenantName,
          deviceName: prefs.deviceName || undefined,
          copies: prefs.copies || 1,
          paperWidth: prefs.paperWidth || 80,
          printMode: prefs.printMode || 1,
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
              ? <img src={logo} alt={storeName || 'Logo da loja'}
                     className="w-12 h-12 object-contain rounded-lg bg-white/95 p-1" />
              : <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center text-2xl">🛒</div>}
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
                  💵 Sangria/Suprimento <kbd className="opacity-60">F6</kbd>
                </button>
                <button onClick={() => setShowReturnSale(true)}
                        className="px-3 py-1.5 bg-rose-900/40 text-rose-300 rounded-full text-xs hover:bg-rose-900/60">
                  ↩️ Devolução <kbd className="opacity-60">F7</kbd>
                </button>
                <button onClick={() => setShowCloseCash(true)} className="px-3 py-1.5 bg-emerald-900/40 text-emerald-300 rounded-full text-xs hover:bg-emerald-900/60">
                  💰 Caixa aberto · Fechar <kbd className="opacity-60">F12</kbd>
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
                    title="Atualizar catálogo agora — F5 (produtos e estoque do dashboard)"
                    className={`text-slate-400 hover:text-white text-sm px-2 ${refreshing ? 'animate-spin' : ''}`}>🔄</button>
            <button onClick={() => setShowPrinterSettings(true)} title="Configurar impressora térmica"
                    className="text-slate-400 hover:text-white text-sm px-2">🖨️</button>
            <button onClick={() => setShowShortcuts(true)} title="Atalhos do teclado — F1"
                    className="text-slate-400 hover:text-white text-sm px-2">⌨️</button>
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
          <input ref={searchRef} type="text" placeholder="🔍 Escaneie ou digite (F2) · 12*código para quantidade"
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
                  <div className="flex items-start justify-between">
                    <div className="text-3xl mb-2">{p.emoji}</div>
                    {promoFor(p, selectedCustomer) && (
                      <span className="text-[10px] font-bold bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded">
                        -{promoFor(p, selectedCustomer).discountPercent}%
                      </span>
                    )}
                  </div>
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
          <h2 className="font-bold text-lg">
            🛒 Carrinho ({cart.length})
            {activeQuote && (
              <span className="ml-2 text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800"
                    title="Fechar esta venda dá baixa no orçamento">
                📄 orçamento nº {activeQuote.number}
              </span>
            )}
          </h2>
          <button onClick={() => setCustomerPickerOpen(true)} className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg">
            {selectedCustomer ? `👤 ${selectedCustomer.name.split(' ')[0]}` : '👤 Cliente'}
            <kbd className="ml-1.5 opacity-60">F3</kbd>
          </button>
        </div>

        <div ref={cartRef} className="min-h-0 overflow-y-auto p-4 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="text-center text-slate-500 py-20">
              <div className="text-5xl mb-3 opacity-40">🛒</div>
              <p className="text-sm">Carrinho vazio.</p>
              <p className="text-xs mt-1 text-slate-600">Escaneie o produto ou digite o nome.</p>
              <p className="text-[11px] mt-3 text-slate-600">F1 mostra todos os atalhos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((i, idx) => (
                <div key={i.productId}
                     data-selected={idx === selectedIndex}
                     onClick={() => setSelectedId(i.productId)}
                     className={`p-3 rounded-lg flex items-center gap-3 border ${
                       idx === selectedIndex
                         ? 'bg-blue-950/40 border-blue-600'
                         : 'bg-slate-950/50 border-transparent'
                     }`}>
                  <span className="text-2xl">{i.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{i.productName}</div>
                    <div className="text-xs text-slate-400">
                      {brl(i.unitPrice)} cada
                      {i.promoPercent > 0 && (
                        <span className="text-amber-400"> · {i.promoName} -{i.promoPercent}%</span>
                      )}
                    </div>
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
          {promoDiscount > 0 && (
            <div className="flex justify-between text-xs text-amber-400">
              <span>🏷️ Promoções</span>
              <span>- {brl(promoDiscount)}</span>
            </div>
          )}
          {totalPromo && effectivePct === totalPromo.discountPercent && (
            <div className="flex justify-between text-xs text-amber-400">
              <span>🏷️ {totalPromo.name}</span>
              <span>-{totalPromo.discountPercent}% no total</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">
              Desconto (%) <kbd className="opacity-50 text-xs">F4</kbd>
              {maxDiscount === 0 && <span className="text-amber-500 text-xs ml-1" title="Todo desconto exige gerente">🔒</span>}
            </label>
            <input ref={discountRef} type="number" min="0" max="100" step="0.5" value={discountPct}
                   onChange={(e) => onDiscountChange(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') searchRef.current?.focus(); }}
                   className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-right text-emerald-400 font-mono" />
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-xs text-emerald-400">
              <span>Desconto{discountAuthorizedBy && ` · aut. ${discountAuthorizedBy}`}</span>
              <span>- {brl(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400" title="Entrega, taxa de serviço ou juros repassados">
              Acréscimo (R$) <kbd className="opacity-50 text-xs">F8</kbd>
            </label>
            <input ref={surchargeRef} type="number" min="0" step="0.5" value={surcharge}
                   onChange={(e) => setSurcharge(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') searchRef.current?.focus(); }}
                   placeholder="0,00"
                   className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-right text-orange-300 font-mono" />
          </div>
          {surchargeAmount > 0 && (
            <div className="flex justify-between text-xs text-orange-300">
              <span>Acréscimo</span>
              <span>+ {brl(surchargeAmount)}</span>
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
          <button onClick={() => setShowQuote(true)}
                  title="Gerar orçamento para o cliente levar, ou reabrir um orçamento salvo"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 rounded-lg text-sm">
            📄 Orçamento · F11
          </button>
          {cart.length > 0 && (
            <button onClick={requestCancelSale} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1">
              Cancelar venda · F9
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
        <PaymentModal total={total}
                      creditBalance={Number(selectedCustomer?.credit_balance) || 0}
                      onCancel={() => setShowPayment(false)}
                      onConfirm={finalizeSale} />
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

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {showQuote && (
        <QuoteModal
          cart={cart}
          subtotal={subtotal}
          discountAmount={discountAmount}
          surchargeAmount={surchargeAmount}
          total={total}
          selectedCustomer={selectedCustomer}
          tenantName={storeName || user?.tenantName}
          sellerName={currentUser?.name}
          onClose={() => { setShowQuote(false); searchRef.current?.focus(); }}
          onLoadQuote={loadQuoteIntoCart}
          onSaved={(_quote, message) => {
            // Orçamento entregue: o balcão libera para o próximo cliente
            setShowQuote(false);
            clearCart();
            showToast(message, 'success', 6000);
            searchRef.current?.focus();
          }}
        />
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
        <CustomerPicker
          customers={customers}
          onPick={(c) => { setSelectedCustomer(c); setCustomerPickerOpen(false); searchRef.current?.focus(); }}
          onClear={() => { setSelectedCustomer(null); setCustomerPickerOpen(false); searchRef.current?.focus(); }}
          onClose={() => { setCustomerPickerOpen(false); searchRef.current?.focus(); }}
        />
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

/**
 * Seleção de cliente por teclado: digita para filtrar (nome, CPF ou telefone),
 * ↑/↓ escolhe, Enter confirma. O operador nunca precisa soltar o teclado no
 * meio da fila para pegar o mouse.
 */
function CustomerPicker({ customers, onPick, onClear, onClose }) {
  const [term, setTerm] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return customers;
    const digits = s.replace(/\D/g, '');
    return customers.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      (digits && (c.tax_id || '').replace(/\D/g, '').includes(digits)) ||
      (digits && (c.phone || '').replace(/\D/g, '').includes(digits))
    );
  }, [term, customers]);

  // Filtro novo encurtou a lista: o destaque não pode ficar fora dela
  const safeIdx = Math.min(idx, Math.max(0, filtered.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [safeIdx, filtered.length]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(filtered.length - 1, safeIdx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(0, safeIdx - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[safeIdx]) onPick(filtered[safeIdx]); }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-bold">👤 Selecionar cliente</h3>
          <button onClick={onClear} className="text-xs text-slate-400 hover:text-slate-200">Limpar seleção</button>
        </header>

        <div className="p-4 border-b border-slate-800">
          <input autoFocus type="text" value={term} onKeyDown={onKey}
                 onChange={(e) => { setTerm(e.target.value); setIdx(0); }}
                 placeholder="🔍 Nome, CPF ou telefone…"
                 className="w-full bg-slate-950 border border-slate-700 px-4 py-3 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
          <p className="text-[11px] text-slate-500 mt-2">↑ ↓ escolhe · Enter confirma · Esc fecha</p>
        </div>

        <div ref={listRef} className="flex-1 overflow-auto p-2 custom-scrollbar">
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 py-10 text-sm">
              {customers.length === 0 ? 'Sem clientes locais.' : 'Nenhum cliente encontrado.'}
            </p>
          )}
          {filtered.map((c, i) => (
            <button key={c.id} data-on={i === safeIdx} onClick={() => onPick(c)}
                    onMouseEnter={() => setIdx(i)}
                    className={`block w-full text-left px-4 py-3 rounded border ${
                      i === safeIdx ? 'bg-blue-950/40 border-blue-600' : 'border-transparent hover:bg-slate-800'
                    }`}>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-slate-400">
                {c.tax_id || c.phone || '—'} · {c.loyalty_points} pts
                {Number(c.credit_balance) > 0 && (
                  <span className="text-amber-400"> · 🎟️ {brl(c.credit_balance)} em vale</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
