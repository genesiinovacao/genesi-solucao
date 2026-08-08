import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { printerPrefs } from '../lib/printerPrefs';

/**
 * Orçamentos do balcão.
 *  - Aba "Novo": salva o carrinho atual como orçamento e imprime para o
 *    cliente levar. Não baixa estoque nem mexe no caixa.
 *  - Aba "Salvos": o cliente volta com o papel; o atendente acha pelo número
 *    e devolve tudo ao carrinho para fechar a venda.
 */
const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const dtShort = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dateBr = (ymd) => String(ymd || '').split('-').reverse().join('/');

export default function QuoteModal({
  cart, subtotal, discountAmount, surchargeAmount, total,
  selectedCustomer, tenantName, sellerName, onClose, onLoadQuote, onSaved,
}) {
  const hasCart = cart.length > 0;
  const [tab, setTab] = useState(hasCart ? 'new' : 'saved');

  // ---- Aba "Novo" ----
  const [name, setName] = useState(selectedCustomer?.name || '');
  const [phone, setPhone] = useState(selectedCustomer?.phone || '');
  // 0 = sem prazo de validade
  const [validDays, setValidDays] = useState(7);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const searchRef = useRef(null);

  // ---- Aba "Salvos" ----
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);

  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const loadList = async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/quotes', {
        params: { status: 'open', pageSize: 50, search: search || undefined },
      });
      setList(data.items || []);
      setIdx(0);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Busca enquanto digita (com folga para não disparar a cada tecla). Enter
  // fica livre para abrir o orçamento destacado, que é o gesto principal.
  useEffect(() => {
    if (tab !== 'saved') return;
    const t = setTimeout(() => loadList(term), term ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [tab, term]);

  const safeIdx = Math.min(idx, Math.max(0, list.length - 1));
  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [safeIdx, list.length]);

  const printQuote = async (quote) => {
    const prefs = printerPrefs.get();
    return window.pdv.printQuoteSilent({
      quote: {
        number: quote.number,
        createdAtIso: quote.createdAt,
        validUntil: quote.validUntil,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        // Quem atendeu tem de sair no papel; o operador logado é a garantia
        // caso o servidor não consiga resolver o nome do usuário.
        sellerName: quote.sellerName || sellerName || null,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        surchargeAmount: quote.surchargeAmount,
        totalAmount: quote.totalAmount,
        notes: quote.notes,
        items: quote.items,
      },
      tenantName,
      deviceName: prefs.deviceName || undefined,
      copies: prefs.copies || 1,
      paperWidth: prefs.paperWidth || 80,
      printMode: prefs.printMode || 1,
    });
  };

  const save = async () => {
    if (!hasCart) return;
    setSaving(true);
    setError('');
    setStatus('Salvando…');
    try {
      const { data } = await api.post('/api/quotes', {
        items: cart.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount || 0,
          totalPrice: i.totalPrice,
        })),
        customerId: selectedCustomer?.id ?? null,
        customerName: name.trim() || selectedCustomer?.name || null,
        customerPhone: phone.trim() || null,
        subtotal, discountAmount, surchargeAmount, totalAmount: total,
        notes: notes.trim() || null,
        validDays: Number(validDays) || 7,
        noExpiry: Number(validDays) === 0,
      });

      setStatus(`Orçamento nº ${data.number} salvo. Imprimindo…`);
      const r = await printQuote(data);
      onSaved?.(data, r?.ok
        ? `Orçamento nº ${data.number} salvo e impresso.`
        : `Orçamento nº ${data.number} salvo. Impressora: ${r?.error || 'falhou'}`);
    } catch (err) {
      // Orçamento vive no servidor: sem rede não dá para numerar nem guardar
      setError(err.response?.data?.error
        || (err.message?.includes('Network') ? 'Sem conexão — o orçamento precisa do servidor para receber número.' : err.message));
      setStatus('');
      setSaving(false);
    }
  };

  const openQuote = async (row) => {
    setError('');
    try {
      const { data } = await api.get(`/api/quotes/${row.id}`);
      onLoadQuote(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const reprint = async (row) => {
    setStatus('Imprimindo…');
    try {
      const { data } = await api.get(`/api/quotes/${row.id}`);
      const r = await printQuote(data);
      setStatus(r?.ok ? `Orçamento nº ${data.number} reimpresso.` : `⚠️ ${r?.error}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setStatus('');
    }
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(list.length - 1, safeIdx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(0, safeIdx - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (list[safeIdx]) openQuote(list[safeIdx]);
    }
  };

  const validUntilPreview = useMemo(() => {
    if (Number(validDays) === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + Number(validDays));
    return d.toLocaleDateString('pt-BR');
  }, [validDays]);

  /**
   * Atalhos da tela. O balcão trabalha sem mouse igual ao caixa: trocar de
   * aba, salvar e reimprimir precisam de tecla. Esc é tratado pelo PDV.
   */
  useEffect(() => {
    const onKey = (e) => {
      switch (e.key) {
        case 'F2':
          if (!hasCart) return;
          e.preventDefault();
          setTab('new');
          setTimeout(() => nameRef.current?.focus(), 0);
          return;
        case 'F3':
          e.preventDefault();
          setTab('saved');
          setTimeout(() => searchRef.current?.focus(), 0);
          return;
        case 'F4':
          // Reimprime o destacado sem sair da lista
          if (tab === 'saved' && list[safeIdx]) { e.preventDefault(); reprint(list[safeIdx]); }
          return;
        case 'F10':
          if (tab === 'new' && hasCart && !saving) { e.preventDefault(); save(); }
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-800 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white">📄 Orçamento</h2>
            <p className="text-xs text-slate-400 mt-1">
              Não baixa estoque nem entra no caixa — só vira venda quando o cliente fechar.
            </p>
            {sellerName && (
              <p className="text-xs text-slate-300 mt-1">
                Vendedor: <span className="font-medium text-white">{sellerName}</span>
                <span className="text-slate-500"> · sai impresso no orçamento</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none">×</button>
        </header>

        <div className="flex gap-1 p-2 bg-slate-950/50 border-b border-slate-800">
          <button onClick={() => setTab('new')} disabled={!hasCart}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                    tab === 'new' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  } ${!hasCart ? 'opacity-40 cursor-not-allowed' : ''}`}>
            Novo {hasCart ? `(${cart.length} itens · ${brl(total)})` : '(carrinho vazio)'}
            <kbd className="ml-1.5 opacity-60">F2</kbd>
          </button>
          <button onClick={() => setTab('saved')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                    tab === 'saved' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}>
            Salvos <kbd className="ml-1.5 opacity-60">F3</kbd>
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 text-sm text-rose-300 bg-rose-950/50 border border-rose-800 rounded-lg p-3">⚠️ {error}</div>
        )}
        {status && !error && (
          <div className="mx-5 mt-4 text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-800 rounded-lg p-3">{status}</div>
        )}

        {/* ===== Novo orçamento ===== */}
        {tab === 'new' && (
          <>
            <div className="flex-1 overflow-auto custom-scrollbar p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Cliente
                  </label>
                  <input ref={nameRef} autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
                         maxLength={255} placeholder="Nome de quem leva o papel"
                         className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Telefone
                  </label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                         maxLength={30} placeholder="(00) 00000-0000"
                         className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Validade
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[3, 7, 15, 30].map((d) => (
                    <button key={d} type="button" onClick={() => setValidDays(d)}
                            className={`px-4 py-2 rounded-lg text-sm border-2 transition ${
                              Number(validDays) === d
                                ? 'border-blue-500 bg-blue-500/15 text-white font-semibold'
                                : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>
                      {d} dias
                    </button>
                  ))}
                  <button type="button" onClick={() => setValidDays(0)}
                          className={`px-4 py-2 rounded-lg text-sm border-2 transition ${
                            Number(validDays) === 0
                              ? 'border-amber-500 bg-amber-500/15 text-white font-semibold'
                              : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>
                    Sem validade
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {validUntilPreview ? (
                    <>Vale até <span className="text-slate-200 font-medium">{validUntilPreview}</span> —
                    depois disso o preço da peça pode ter mudado.</>
                  ) : (
                    <>Sai impresso como <span className="text-amber-300 font-medium">sem prazo</span> — o
                    preço fica valendo até a loja avisar o contrário.</>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Observações (sai impresso)
                </label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500}
                          placeholder="Ex: peça sob encomenda, prazo de 3 dias úteis"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none" />
              </div>

              <div className="border border-slate-800 rounded-lg divide-y divide-slate-800">
                {cart.map((i) => (
                  <div key={i.productId} className="p-3 flex items-center gap-3 text-sm">
                    <span className="text-xl">{i.emoji}</span>
                    <span className="flex-1 min-w-0 truncate text-white">{i.productName}</span>
                    <span className="text-slate-400 text-xs">{i.quantity} × {brl(i.unitPrice)}</span>
                    <span className="w-24 text-right font-mono text-emerald-400">{brl(i.totalPrice)}</span>
                  </div>
                ))}
              </div>
            </div>

            <footer className="p-5 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Total do orçamento</div>
                <div className="text-2xl font-extrabold text-blue-400">{brl(total)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose}
                        className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm">
                  Cancelar · Esc
                </button>
                <button onClick={save} disabled={saving || !hasCart}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg text-sm">
                  {saving ? 'Salvando…' : '📄 Salvar e imprimir · F10'}
                </button>
              </div>
            </footer>
          </>
        )}

        {/* ===== Orçamentos salvos ===== */}
        {tab === 'saved' && (
          <>
            <div className="p-5 border-b border-slate-800">
              <input ref={searchRef} autoFocus type="text" value={term} onKeyDown={onListKey}
                     onChange={(e) => setTerm(e.target.value)}
                     placeholder="🔍 Número do orçamento ou nome do cliente…"
                     className="w-full bg-slate-950 border border-slate-700 px-4 py-3 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
              <p className="text-[11px] text-slate-500 mt-2">
                ↑ ↓ escolhe · Enter devolve os itens ao carrinho · F4 reimprime · Esc fecha
              </p>
            </div>

            <div ref={listRef} className="flex-1 overflow-auto custom-scrollbar">
              {loading && <p className="text-center text-slate-500 py-10 text-sm">Carregando…</p>}
              {!loading && list.length === 0 && (
                <p className="text-center text-slate-500 py-10 text-sm">Nenhum orçamento aberto.</p>
              )}
              {!loading && list.map((q, i) => (
                <div key={q.id} data-on={i === safeIdx}
                     onMouseEnter={() => setIdx(i)}
                     className={`px-5 py-3 border-b border-slate-800/50 flex items-center justify-between gap-3 ${
                       i === safeIdx ? 'bg-blue-950/40' : ''
                     }`}>
                  <button onClick={() => openQuote(q)} className="flex-1 min-w-0 text-left">
                    <div className="font-mono text-sm text-blue-400">
                      Nº {q.number}
                      {q.isExpired ? (
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300">
                          vencido em {dateBr(q.validUntil)}
                        </span>
                      ) : !q.validUntil && (
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          sem validade
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {dtShort(q.createdAt)} · {q.itemCount} item(s) · {q.customerName || 'Sem cliente'}
                      {q.sellerName && ` · 👤 ${q.sellerName}`}
                    </div>
                  </button>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-white">{brl(q.totalAmount)}</div>
                    <div className="text-[11px] mt-0.5">
                      <button onClick={() => reprint(q)} className="text-slate-400 hover:text-slate-200">
                        🖨️ reimprimir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
