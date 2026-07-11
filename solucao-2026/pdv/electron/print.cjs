// Impressão térmica silenciosa via webContents.print({silent:true}).
// Renderiza o cupom em uma BrowserWindow oculta usando HTML estático
// gerado neste módulo (sem depender do React do renderer) e dispara a
// impressão direto na impressora preferida — sem caixa de diálogo.
const { BrowserWindow, ipcMain } = require('electron');

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  .format(Number(n) || 0);
const dt = (iso) => new Date(iso).toLocaleString('pt-BR',
  { dateStyle: 'short', timeStyle: 'short' });

const methodLabels = {
  cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito',
  debit: 'Débito', crediario: 'Crediário', mixed: 'Misto',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildReceiptHtml({ sale, tenantName }) {
  const safeName = escapeHtml(tenantName || 'SOLUÇÃO 2026');
  const itemsHtml = sale.items.map((i) => `
    <tr>
      <td>${escapeHtml(i.productName)}</td>
      <td class="r">${i.quantity}</td>
      <td class="r">${Number(i.unitPrice).toFixed(2)}</td>
      <td class="r">${Number(i.totalPrice).toFixed(2)}</td>
    </tr>
  `).join('');

  const payments = (sale.payments && sale.payments.length > 0)
    ? sale.payments
    : [{ method: sale.paymentMethod, amount: sale.totalAmount }];
  const paymentsHtml = payments.map((p) => `
    <div class="row"><span>&nbsp;&nbsp;${escapeHtml(methodLabels[p.method] || p.method)}</span><span>${brl(p.amount)}</span></div>
  `).join('');

  // CSS limitado a 80mm (302px). page-break: avoid; @page sem margens.
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-monospace, "Courier New", monospace; font-size: 12px; color: #000; background: #fff; }
  .receipt { width: 76mm; padding: 4mm 2mm; }
  .center { text-align: center; }
  .b { font-weight: 700; }
  .big { font-size: 14px; }
  .small { font-size: 10px; color: #444; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { border-bottom: 1px solid #000; text-align: left; }
  td.r, th.r { text-align: right; }
  .row { display: flex; justify-content: space-between; }
  .total { font-size: 13px; font-weight: 700; }
</style>
</head><body>
  <div class="receipt">
    <div class="center b big">${safeName}</div>
    <div class="center small">Cupom Não Fiscal</div>
    <div class="center small">${dt(sale.saleDateIso)}</div>
    <div class="hr"></div>
    <div class="small">Cupom: ${escapeHtml((sale.offlineSyncId || '').slice(0, 8).toUpperCase())}</div>
    ${sale.customerName ? `<div class="small">Cliente: ${escapeHtml(sale.customerName)}</div>` : ''}
    <div class="hr"></div>

    <table>
      <thead><tr><th>ITEM</th><th class="r">QT</th><th class="r">VL</th><th class="r">TOTAL</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="hr"></div>
    <div class="row"><span>Subtotal</span><span>${brl(sale.subtotal)}</span></div>
    ${sale.discountAmount > 0 ? `<div class="row"><span>Desconto</span><span>- ${brl(sale.discountAmount)}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${brl(sale.totalAmount)}</span></div>

    <div class="hr"></div>
    <div class="b small">Pagamento:</div>
    ${paymentsHtml}
    ${sale.changeAmount > 0 ? `<div class="row"><span>&nbsp;&nbsp;Troco</span><span>${brl(sale.changeAmount)}</span></div>` : ''}

    <div class="hr"></div>
    <div class="center small">Obrigado pela preferência!</div>
    <div class="center" style="font-size:10px; color:#888;">SOLUÇÃO 2026 · PDV</div>
  </div>
</body></html>`;
}

// Cria janela oculta, carrega o HTML, imprime silenciosamente e fecha.
function printSilent({ sale, tenantName, deviceName, copies = 1 }) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 320, height: 600,
      webPreferences: { offscreen: false, sandbox: true },
    });
    const html = buildReceiptHtml({ sale, tenantName });

    win.webContents.once('did-finish-load', () => {
      const opts = {
        silent: true,
        printBackground: false,
        copies,
        margins: { marginType: 'none' },
      };
      if (deviceName) opts.deviceName = deviceName;

      win.webContents.print(opts, (success, failureReason) => {
        win.destroy();
        if (success) resolve({ ok: true });
        else reject(new Error(failureReason || 'Falha ao imprimir.'));
      });
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      .catch((err) => { win.destroy(); reject(err); });
  });
}

function registerPrintIpc() {
  ipcMain.handle('print:list-printers', async (e) => {
    try {
      const printers = await e.sender.getPrintersAsync();
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: !!p.isDefault,
        status: p.status,
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('print:receipt-silent', async (_e, payload) => {
    try {
      await printSilent(payload);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerPrintIpc };
