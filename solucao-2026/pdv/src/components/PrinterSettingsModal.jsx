import { useEffect, useState } from 'react';
import { printerPrefs } from '../lib/printerPrefs';

// Modal de configuração da impressora térmica.
// - Lista impressoras instaladas (via Electron getPrintersAsync)
// - Permite ativar modo silencioso e impressão automática após cada venda
// - Botão "imprimir teste" usa a mesma rota silent do cupom real
export default function PrinterSettingsModal({ onClose }) {
  const [prefs, setPrefs] = useState(printerPrefs.get());
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testStatus, setTestStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = await window.pdv.listPrinters();
        setPrinters(list || []);
        // Se nenhum device escolhido ainda e há um default do sistema, pré-seleciona.
        if (!prefs.deviceName) {
          const def = (list || []).find((p) => p.isDefault);
          if (def) setPrefs((p) => ({ ...p, deviceName: def.name }));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  // Persiste a cada mudança: assim o cupom da venda usa exatamente o que
  // está na tela, sem depender de lembrar de clicar em Salvar.
  useEffect(() => {
    if (!loading) printerPrefs.set(prefs);
  }, [prefs, loading]);

  const save = () => {
    printerPrefs.set(prefs);
    onClose?.();
  };

  const buildFakeSale = () => ({
    offlineSyncId: 'TEST' + Date.now(),
    saleDateIso: new Date().toISOString(),
    customerName: 'TESTE DE IMPRESSORA',
    subtotal: 10, discountAmount: 0, totalAmount: 10, changeAmount: 0,
    paymentMethod: 'cash',
    // Nome longo de propósito: é o caso que quebrava o cupom das vendas reais
    items: [
      { productName: 'Sardinha Coqueiro Tomate 125g', quantity: 2, unitPrice: 8, totalPrice: 16 },
      { productName: 'Suco de Uva', quantity: 1, unitPrice: 10, totalPrice: 10 },
    ],
    payments: [{ method: 'cash', amount: 10 }],
  });

  // Os testes de diagnóstico (imprimir pela janela do Windows e gerar PDF do
  // cupom) saíram da tela. Os canais continuam no processo principal
  // (print:receipt-dialog e print:receipt-pdf) para reativar rapidamente se
  // alguma impressora de cliente voltar a dar trabalho.

  const testPrint = async () => {
    // Salva antes de testar: a venda real lê do disco, e testar com uma
    // configuração não salva imprimia diferente do cupom de verdade.
    printerPrefs.set(prefs);
    setTestStatus('Imprimindo...');
    // Mesmo cupom dos demais testes: dois itens e nome longo, como numa
    // venda real. Um exemplo curto escondia os defeitos de largura.
    const r = await window.pdv.printReceiptSilent({
      sale: buildFakeSale(),
      tenantName: 'SOLUÇÃO 2026 — TESTE',
      deviceName: prefs.deviceName || undefined,
      copies: prefs.copies,
      paperWidth: prefs.paperWidth,
      printMode: prefs.printMode,
    });
    setTestStatus(r.ok ? '✓ Enviado para impressora.' : `⚠️ ${r.error}`);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-xl font-bold text-white">🖨️ Impressora Térmica</h2>
            <p className="text-xs text-slate-400 mt-1">Configure impressão silenciosa do cupom.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Impressora
            </label>
            <select value={prefs.deviceName}
                    onChange={(e) => setPrefs({ ...prefs, deviceName: e.target.value })}
                    disabled={loading}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none">
              <option value="">{loading ? 'Carregando…' : '— Padrão do sistema —'}</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}{p.isDefault ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
            {!loading && printers.length === 0 && (
              <p className="text-xs text-amber-400 mt-1.5">Nenhuma impressora detectada pelo sistema.</p>
            )}
          </div>

          <div className="space-y-2.5 bg-slate-950/60 border border-slate-800 rounded-lg p-3.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={prefs.silent}
                     onChange={(e) => setPrefs({ ...prefs, silent: e.target.checked, auto: e.target.checked ? prefs.auto : false })}
                     className="mt-0.5 w-4 h-4 accent-blue-500" />
              <div>
                <div className="text-sm font-medium text-white">Modo silencioso</div>
                <div className="text-xs text-slate-400">Imprime direto, sem mostrar a caixa de diálogo.</div>
              </div>
            </label>
            <label className={`flex items-start gap-3 cursor-pointer ${!prefs.silent ? 'opacity-40' : ''}`}>
              <input type="checkbox" checked={prefs.auto} disabled={!prefs.silent}
                     onChange={(e) => setPrefs({ ...prefs, auto: e.target.checked })}
                     className="mt-0.5 w-4 h-4 accent-blue-500" />
              <div>
                <div className="text-sm font-medium text-white">Imprimir automaticamente após cada venda</div>
                <div className="text-xs text-slate-400">Dispara assim que a venda for confirmada.</div>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Largura da bobina
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[58, 80].map((w) => (
                <button key={w} type="button"
                        onClick={() => setPrefs({ ...prefs, paperWidth: w })}
                        className={`py-2.5 rounded-lg text-sm border-2 transition-colors ${
                          Number(prefs.paperWidth) === w
                            ? 'border-blue-500 bg-blue-500/15 text-white font-semibold'
                            : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>
                  {w} mm
                  <span className="block text-[10px] text-slate-400">
                    {w === 58 ? '384 dots/linha' : '576 dots/linha'}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              O autoteste da impressora (ligar segurando o avanço de papel) mostra esse número.
            </p>
            {Number(prefs.paperWidth) === 80 && (
              <p className="text-[11px] text-amber-400 mt-1">
                ⚠️ Em bobina de 58mm, esta opção corta os valores do lado direito.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Cópias
            </label>
            <input type="number" min="1" max="5" value={prefs.copies}
                   onChange={(e) => setPrefs({ ...prefs, copies: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
                   className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none" />
          </div>

          {testStatus && (
            <div className={`text-sm rounded-lg p-3 ${
              testStatus.startsWith('⚠️') ? 'text-rose-300 bg-rose-950/40 border border-rose-800'
                                          : 'text-emerald-300 bg-emerald-950/40 border border-emerald-800'
            }`}>{testStatus}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={testPrint}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-lg text-sm">
              🖨️ Imprimir teste
            </button>
            <button onClick={save}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-sm">
              Salvar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
