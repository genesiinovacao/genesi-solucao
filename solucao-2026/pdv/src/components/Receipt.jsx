// Cupom não-fiscal para impressora térmica 80mm (302px).
// Dois modos:
//  - Padrão: modal de visualização + window.print() (CSS em index.css esconde
//    todo o resto e estiliza só o .receipt durante a impressão).
//  - Silencioso (printerPrefs.silent): chama window.pdv.printReceiptSilent
//    que renderiza o cupom em BrowserWindow oculta e dispara webContents.print
//    direto na impressora escolhida, sem caixa de diálogo.
import { useState } from 'react';
import { auth } from '../lib/auth';
import { printerPrefs } from '../lib/printerPrefs';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const dt  = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const methodLabels = {
  cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito', debit: 'Débito', crediario: 'Crediário', mixed: 'Misto',
};

export default function Receipt({ sale, onClose, onPrint }) {
  const user = auth.getUser();
  const [silentStatus, setSilentStatus] = useState('');

  const printSilent = async () => {
    const prefs = printerPrefs.get();
    setSilentStatus('Imprimindo...');
    const r = await window.pdv.printReceiptSilent({
      sale,
      tenantName: user?.tenantName,
      deviceName: prefs.deviceName || undefined,
      copies: prefs.copies || 1,
    });
    if (r.ok) {
      setSilentStatus('✓ Cupom enviado.');
      setTimeout(() => onClose?.(), 800);
    } else {
      setSilentStatus(`⚠️ ${r.error}`);
    }
  };

  return (
    <>
      {/* Tela: modal de visualização sobre o PDV */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 no-print">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">✅ Venda concluída</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
          </div>
          <div className="bg-white text-black rounded-lg p-1 max-h-[60vh] overflow-auto">
            <ReceiptBody sale={sale} tenantName={user?.tenantName} />
          </div>
          {silentStatus && (
            <div className={`mt-3 text-sm rounded-lg p-2.5 ${
              silentStatus.startsWith('⚠️') ? 'bg-rose-950/40 border border-rose-800 text-rose-300'
                                            : 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
            }`}>{silentStatus}</div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg">Fechar</button>
            <button onClick={printSilent} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg" title="Impressão direto na impressora térmica configurada">
              ⚡ Térmica
            </button>
            <button onClick={onPrint} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg" title="Abre o diálogo de impressão do sistema">
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Impressão: só este elemento aparece quando window.print() é chamado */}
      <div className="receipt-print">
        <ReceiptBody sale={sale} tenantName={user?.tenantName} />
      </div>
    </>
  );
}

function ReceiptBody({ sale, tenantName }) {
  return (
    <div className="receipt font-mono text-[12px] leading-tight px-2 py-3 text-black bg-white">
      <div className="text-center mb-2">
        <div className="font-extrabold text-[14px] uppercase">{tenantName || 'SOLUÇÃO 2026'}</div>
        <div className="text-[11px]">Cupom Não Fiscal</div>
        <div className="text-[11px]">{dt(sale.saleDateIso)}</div>
      </div>
      <div className="border-t border-dashed border-black my-2" />

      <div className="text-[11px] mb-1">
        <div>Cupom: {sale.offlineSyncId.slice(0, 8).toUpperCase()}</div>
        {sale.customerName && <div>Cliente: {sale.customerName}</div>}
      </div>
      <div className="border-t border-dashed border-black my-2" />

      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left">ITEM</th>
            <th className="text-right">QT</th>
            <th className="text-right">VL</th>
            <th className="text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i, idx) => (
            <tr key={idx} className="align-top">
              <td className="pr-1">{i.productName}</td>
              <td className="text-right">{i.quantity}</td>
              <td className="text-right">{i.unitPrice.toFixed(2)}</td>
              <td className="text-right">{i.totalPrice.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black my-2" />
      <Line label="Subtotal" value={brl(sale.subtotal)} />
      {sale.discountAmount > 0 && <Line label="Desconto" value={'- ' + brl(sale.discountAmount)} />}
      <Line label="TOTAL" value={brl(sale.totalAmount)} bold />

      <div className="border-t border-dashed border-black my-2" />
      <div className="text-[11px] font-semibold mb-1">Pagamento:</div>
      {(sale.payments && sale.payments.length > 0 ? sale.payments : [{ method: sale.paymentMethod, amount: sale.totalAmount }]).map((p, idx) => (
        <Line key={idx} label={'  ' + (methodLabels[p.method] || p.method)} value={brl(p.amount)} />
      ))}
      {sale.changeAmount > 0 && <Line label="  Troco" value={brl(sale.changeAmount)} />}

      <div className="border-t border-dashed border-black my-2" />
      <div className="text-center text-[11px] mt-3">
        Obrigado pela preferência!
      </div>
      <div className="text-center text-[10px] mt-1 text-gray-500">SOLUÇÃO 2026 · PDV</div>
    </div>
  );
}

function Line({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-[13px]' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
