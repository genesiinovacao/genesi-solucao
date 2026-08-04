// Impressão térmica silenciosa via webContents.print({silent:true}).
// Renderiza o cupom em uma BrowserWindow oculta usando HTML estático
// gerado neste módulo (sem depender do React do renderer) e dispara a
// impressão direto na impressora preferida — sem caixa de diálogo.
const { BrowserWindow, ipcMain, app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function buildReceiptHtml({ sale, tenantName, paperWidth = 80 }) {
  const safeName = escapeHtml(tenantName || 'SOLUÇÃO 2026');

  // A largura escolhida define só a densidade do texto. O cupom em si é
  // fluido (100% da página): assim ele preenche o papel que a impressora
  // realmente tem, mesmo se a configuração estiver errada — antes, um
  // cupom de 80mm numa bobina de 58mm perdia tudo do lado direito.
  const narrow = Number(paperWidth) === 58;
  const baseFont = narrow ? 10 : 12;

  // Duas linhas por item em qualquer largura: nome longo quebra dentro da
  // própria linha em vez de alargar a página e empurrar os valores para fora
  // do papel — que era o que acontecia com a tabela de 4 colunas.
  const itemsHtml = sale.items.map((i) => `
    <div class="item">
      <div class="name">${escapeHtml(i.productName)}</div>
      <div class="row">
        <span>${i.quantity} x ${Number(i.unitPrice).toFixed(2)}</span>
        <span class="b">${Number(i.totalPrice).toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  const payments = (sale.payments && sale.payments.length > 0)
    ? sale.payments
    : [{ method: sale.paymentMethod, amount: sale.totalAmount }];
  const paymentsHtml = payments.map((p) => `
    <div class="row"><span>&nbsp;&nbsp;${escapeHtml(methodLabels[p.method] || p.method)}</span><span>${brl(p.amount)}</span></div>
  `).join('');

  // Largura do papel manda no layout: @page sem margens para a térmica
  // não reservar borda, e conteúdo limitado à área realmente impressa.
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  /* Térmica não tem meio-tom: cinza e bordas suavizadas viram falhas.
     Tudo em preto puro, sem antialias e com traço mais firme. */
  @page { size: auto; margin: 0; }
  html, body { margin: 0; padding: 0; width: 100%; }
  body {
    font-family: "Courier New", ui-monospace, monospace;
    font-size: ${baseFont}px;
    color: #000; background: #fff;
    -webkit-font-smoothing: none;
    font-smooth: never;
    text-rendering: geometricPrecision;
  }
  * { color: #000 !important; }
  /* Fluido: ocupa o papel real, seja 58mm ou 80mm */
  .receipt { width: 100%; max-width: 100%; padding: ${narrow ? '1mm' : '2mm'};
             overflow: hidden; box-sizing: border-box; }
  .receipt * { max-width: 100%; overflow-wrap: anywhere; }
  .center { text-align: center; }
  .b { font-weight: 700; }
  .big { font-size: ${baseFont + 2}px; font-weight: 700; }
  .small { font-size: ${baseFont - 1}px; }
  .hr { border-top: 1px solid #000; margin: ${narrow ? '4px' : '6px'} 0; }
  table { width: 100%; border-collapse: collapse; font-size: ${baseFont - 1}px; }
  th { border-bottom: 1px solid #000; text-align: left; }
  td.r, th.r { text-align: right; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .total { font-size: ${baseFont + 2}px; font-weight: 700; }
  .item { margin-bottom: 3px; }
  .item .name { word-break: break-word; }
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

    ${itemsHtml}

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
function printSilent({ sale, tenantName, deviceName, copies = 1, paperWidth = 80, silent = true, printMode = 1 }) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 400, height: 800,
      webPreferences: { offscreen: false, sandbox: true },
    });
    const html = buildReceiptHtml({ sale, tenantName, paperWidth });

    // Espera a renderização assentar: em janela oculta o layout pode não
    // estar pronto no did-finish-load, e o driver receberia página vazia.
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        // Cada driver térmico reage de um jeito a tamanho de página e margem.
        // Em vez de impor um único caminho, o modo é escolhido na tela:
        //   1 = margens zeradas, papel do driver  (o que funcionou fora do PDV)
        //   2 = margens zeradas + página no tamanho exato do conteúdo
        //   3 = nada sobreposto: exatamente como o driver está configurado
        const narrow = Number(paperWidth) === 58;
        const opts = { silent, printBackground: false, copies };

        if (printMode === 1 || printMode === 2) {
          opts.margins = { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 };
        }

        if (printMode === 2) {
          let heightPx = 600;
          try {
            heightPx = await win.webContents.executeJavaScript(
              'Math.ceil(document.querySelector(".receipt").getBoundingClientRect().height)'
            );
          } catch { /* mantém o padrão */ }
          opts.pageSize = {
            width: narrow ? 58000 : 80000,                     // microns
            height: Math.ceil((heightPx + 24) * (25400 / 96)),
          };
        }

        if (deviceName) opts.deviceName = deviceName;

        win.webContents.print(opts, (success, failureReason) => {
          win.destroy();
          if (success) resolve({ ok: true });
          else reject(new Error(failureReason || 'Falha ao imprimir.'));
        });
      }, 400);
    });

    // Diagnóstico: guarda o último cupom gerado (HTML + parâmetros) para
    // comparar o que sai no teste com o que sai na venda real.
    try {
      const tag = String(sale.offlineSyncId || '').startsWith('TEST') ? 'teste' : 'venda';
      const dbg = path.join(os.tmpdir(), `solucao-ultimo-cupom-${tag}.html`);
      fs.writeFileSync(dbg, html, 'utf8');
      fs.writeFileSync(
        path.join(os.tmpdir(), `solucao-ultimo-cupom-${tag}.json`),
        JSON.stringify({ paperWidth, printMode, copies, deviceName, silent, sale }, null, 2),
        'utf8'
      );
    } catch { /* diagnóstico nunca impede a impressão */ }

    // Arquivo temporário em vez de data: URL — alguns drivers recebem página
    // vazia quando o documento vem de data URL.
    const tmp = path.join(os.tmpdir(), `solucao-cupom-${Date.now()}.html`);
    try {
      fs.writeFileSync(tmp, html, 'utf8');
      win.loadFile(tmp).catch((err) => { win.destroy(); reject(err); });
      win.once('closed', () => { try { fs.unlinkSync(tmp); } catch { /* ok */ } });
    } catch (err) {
      win.destroy();
      reject(err);
    }
  });
}

/**
 * Diagnóstico: gera o cupom em PDF na área de trabalho. Se o PDF sai certo,
 * a renderização está boa e o problema é do driver/envio.
 */
function saveReceiptPdf({ sale, tenantName, paperWidth = 80 }) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false, width: 400, height: 800,
      webPreferences: { offscreen: false, sandbox: true },
    });
    const html = buildReceiptHtml({ sale, tenantName, paperWidth });
    const tmp = path.join(os.tmpdir(), `solucao-cupom-${Date.now()}.html`);
    const out = path.join(app.getPath('desktop'), `cupom-teste-${paperWidth}mm.pdf`);

    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const pdf = await win.webContents.printToPDF({
            printBackground: false,
            margins: { marginType: 'none' },
          });
          fs.writeFileSync(out, pdf);
          win.destroy();
          resolve({ ok: true, path: out });
        } catch (err) {
          win.destroy();
          reject(err);
        }
      }, 400);
    });

    try {
      fs.writeFileSync(tmp, html, 'utf8');
      win.loadFile(tmp).catch((err) => { win.destroy(); reject(err); });
      win.once('closed', () => { try { fs.unlinkSync(tmp); } catch { /* ok */ } });
    } catch (err) {
      win.destroy();
      reject(err);
    }
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

  // Diagnóstico: imprime abrindo a caixa de diálogo do Windows
  ipcMain.handle('print:receipt-dialog', async (_e, payload) => {
    try {
      await printSilent({ ...payload, silent: false });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Diagnóstico: salva o cupom em PDF na área de trabalho
  ipcMain.handle('print:receipt-pdf', async (_e, payload) => {
    try {
      const r = await saveReceiptPdf(payload);
      return { ok: true, path: r.path };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerPrintIpc };
