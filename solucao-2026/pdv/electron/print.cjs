// Impressão térmica silenciosa via webContents.print({silent:true}).
// Renderiza o cupom em uma BrowserWindow oculta usando HTML estático
// gerado neste módulo (sem depender do React do renderer) e dispara a
// impressão direto na impressora preferida — sem caixa de diálogo.
const { BrowserWindow, ipcMain, app } = require('electron');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const path = require('path');

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  .format(Number(n) || 0);
const dt = (iso) => new Date(iso).toLocaleString('pt-BR',
  { dateStyle: 'short', timeStyle: 'short' });

const methodLabels = {
  cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito',
  debit: 'Débito', crediario: 'Crediário', mixed: 'Misto',
  transfer: 'Transferência', store_credit: 'Vale crédito',
};

/** Chave de acesso em grupos de 4, como sai no cupom da SEFAZ. */
function groupKey(key) {
  return String(key || '').replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** CNPJ 12345678000199 → 12.345.678/0001-99 */
function formatCnpj(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14) return v || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Largura real da bobina. O nome da impressora é a fonte mais confiável:
 * "POS-58", "58mm" etc. dizem o formato do equipamento, enquanto a opção da
 * tela pode estar errada — e um cupom mais largo que o papel perde tudo do
 * lado direito (valores, totais e forma de pagamento).
 */
function resolvePaperWidth(deviceName, configured) {
  const n = String(deviceName || '').toLowerCase();
  if (/\b58\b|58mm|pos-?58/.test(n)) return 58;
  if (/\b80\b|80mm|pos-?80/.test(n)) return 80;
  return Number(configured) === 58 ? 58 : 80;
}

function buildReceiptHtml({ sale, tenantName, paperWidth = 80, fiscal = null, qrDataUrl = null, bold = false }) {
  const safeName = escapeHtml(tenantName || 'SOLUÇÃO 2026');

  // A largura escolhida define só a densidade do texto. O cupom em si é
  // fluido (100% da página): assim ele preenche o papel que a impressora
  // realmente tem, mesmo se a configuração estiver errada — antes, um
  // cupom de 80mm numa bobina de 58mm perdia tudo do lado direito.
  const narrow = Number(paperWidth) === 58;
  const baseFont = narrow ? 10 : 12;
  // Área realmente impressa: 58mm imprime 48mm; 80mm imprime 72mm.
  // 2mm de folga para a borda não ser cortada.
  const printableWidth = narrow ? '46mm' : '70mm';

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
  @page { size: ${narrow ? '58mm' : '80mm'} auto; margin: 0; }
  /* Sem largura fixa aqui: ela impedia a renderização na impressão */
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Courier New", ui-monospace, monospace;
    font-size: ${baseFont}px;
    color: #000; background: #fff;
    -webkit-font-smoothing: none;
    font-smooth: never;
    text-rendering: geometricPrecision;
    ${bold ? 'font-weight: 700;' : ''}
  }
  /* Reforço: mais dots por caractere. Não substitui a densidade do driver,
     mas ajuda em bobina fraca ou cabeça já gasta. */
  ${bold ? '* { font-weight: 700 !important; }' : ''}
  * { color: #000 !important; }
  /* Limitado à área imprimível: nada pode ultrapassar a borda do papel */
  .receipt { width: ${printableWidth}; max-width: ${printableWidth};
             padding: ${narrow ? '2mm 1mm' : '4mm 2mm'};
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
  .warn { border: 2px solid #000; padding: 4px; margin: 5px 0;
          text-align: center; font-weight: 700; font-size: ${baseFont}px; }
  .key { font-family: monospace; font-size: ${baseFont - 1}px;
         word-break: break-all; text-align: center; line-height: 1.35; }
  .qr { text-align: center; margin: 5px 0; }
  .qr img { width: ${narrow ? '30mm' : '38mm'}; height: auto; image-rendering: pixelated; }
</style>
</head><body>
  <div class="receipt">
    <div class="center b big">${safeName}</div>
    ${fiscalHeaderHtml(fiscal)}
    ${fiscal
      ? '<div class="center small b">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>'
      : '<div class="center small">Cupom Não Fiscal</div>'}
    <div class="center small">${dt(sale.saleDateIso)}</div>
    ${fiscal && fiscal.warningLabel
      ? `<div class="warn">${escapeHtml(fiscal.warningLabel)}</div>` : ''}
    <div class="hr"></div>
    <div class="small">Cupom: ${escapeHtml((sale.offlineSyncId || '').slice(0, 8).toUpperCase())}</div>
    ${sale.customerName ? `<div class="small">Cliente: ${escapeHtml(sale.customerName)}</div>` : ''}
    <div class="hr"></div>

    ${itemsHtml}

    <div class="hr"></div>
    <div class="row"><span>Qtde total de itens</span><span>${sale.items.length}</span></div>
    <div class="row"><span>Subtotal</span><span>${brl(sale.subtotal)}</span></div>
    ${sale.discountAmount > 0 ? `<div class="row"><span>Desconto</span><span>- ${brl(sale.discountAmount)}</span></div>` : ''}
    ${sale.surchargeAmount > 0 ? `<div class="row"><span>Acréscimo</span><span>+ ${brl(sale.surchargeAmount)}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${brl(sale.totalAmount)}</span></div>

    <div class="hr"></div>
    <div class="b small">Forma de Pagamento:</div>
    ${paymentsHtml}
    ${sale.changeAmount > 0 ? `<div class="row"><span>&nbsp;&nbsp;Troco</span><span>${brl(sale.changeAmount)}</span></div>` : ''}

    ${fiscalFooterHtml(fiscal, qrDataUrl)}

    <div class="hr"></div>
    <div class="center small">Obrigado pela preferência!</div>
    <div class="center" style="font-size:10px; color:#888;">SOLUÇÃO 2026 · PDV</div>
  </div>
</body></html>`;
}

/** Identificação do emitente — só existe em cupom com documento fiscal. */
function fiscalHeaderHtml(fiscal) {
  if (!fiscal) return '';
  const linhas = [
    `CNPJ ${formatCnpj(fiscal.emitCnpj)}`,
    fiscal.emitStateRegistration ? `IE ${escapeHtml(fiscal.emitStateRegistration)}` : null,
  ].filter(Boolean).join('&nbsp;&nbsp;');

  return `
    <div class="center small">${linhas}</div>
    ${fiscal.emitAddress ? `<div class="center small">${escapeHtml(fiscal.emitAddress)}</div>` : ''}
    ${fiscal.emitPhone ? `<div class="center small">Telefone: ${escapeHtml(fiscal.emitPhone)}</div>` : ''}`;
}

/**
 * Bloco fiscal: tributos, número/série, chave, QR e protocolo. É a parte que
 * o consumidor usa para conferir a nota no site da SEFAZ.
 */
function fiscalFooterHtml(fiscal, qrDataUrl) {
  if (!fiscal) return '';

  const emissao = fiscal.issuedAt ? dt(fiscal.issuedAt) : '';
  return `
    <div class="hr"></div>
    ${fiscal.approximateTaxAmount > 0 ? `
      <div class="small">Informação dos Tributos Totais Incidentes</div>
      <div class="row small"><span>(Lei Federal 12.741/2012)</span><span>${brl(fiscal.approximateTaxAmount)}</span></div>
    ` : ''}

    <div class="hr"></div>
    <div class="center small b">Via Consumidor</div>
    <div class="row small"><span>Número</span><span>${fiscal.number}</span></div>
    <div class="row small"><span>Série</span><span>${fiscal.series}</span></div>
    ${emissao ? `<div class="row small"><span>Emissão</span><span>${emissao}</span></div>` : ''}

    ${fiscal.accessKey ? `
      ${fiscal.consultaUrl ? `
        <div class="center small" style="margin-top:4px">Consulte pela Chave de Acesso em</div>
        <div class="center small">${escapeHtml(fiscal.consultaUrl)}</div>` : ''}
      <div class="center b small" style="margin-top:4px">CHAVE DE ACESSO</div>
      <div class="key">${groupKey(fiscal.accessKey)}</div>` : ''}

    <div class="hr"></div>
    <div class="center small b">${fiscal.customerTaxId
      ? `CONSUMIDOR CPF/CNPJ: ${escapeHtml(fiscal.customerTaxId)}`
      : 'CONSUMIDOR NÃO IDENTIFICADO'}</div>

    ${qrDataUrl ? `
      <div class="center small" style="margin-top:4px">Consulta via leitor de QR Code</div>
      <div class="qr"><img src="${qrDataUrl}" alt=""></div>` : ''}

    ${fiscal.protocolNumber ? `
      <div class="center small">Protocolo de Autorização ${escapeHtml(fiscal.protocolNumber)}</div>` : ''}
    ${fiscal.warningLabel ? `<div class="warn">${escapeHtml(fiscal.warningLabel)}</div>` : ''}`;
}

/**
 * Orçamento. Mesma folha e mesmo CSS do cupom — o que muda é o miolo:
 * sem pagamento, sem troco, e com número e validade em destaque, que é o
 * que o cliente confere quando volta com o papel dias depois.
 */
function buildQuoteHtml({ quote, tenantName, paperWidth = 80, bold = false }) {
  const safeName = escapeHtml(tenantName || 'SOLUÇÃO 2026');
  const narrow = Number(paperWidth) === 58;
  const baseFont = narrow ? 10 : 12;
  const printableWidth = narrow ? '46mm' : '70mm';

  const itemsHtml = (quote.items || []).map((i) => `
    <div class="item">
      <div class="name">${escapeHtml(i.productName)}</div>
      <div class="row">
        <span>${i.quantity} x ${Number(i.unitPrice).toFixed(2)}</span>
        <span class="b">${Number(i.totalPrice).toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  // Sem validade é decisão da loja, não falha de preenchimento: o papel diz
  // isso com todas as letras para o cliente não achar que faltou a data.
  const validLabel = quote.validUntil
    ? `Válido até ${String(quote.validUntil).split('-').reverse().join('/')}`
    : 'Sem prazo de validade';

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  @page { size: ${narrow ? '58mm' : '80mm'} auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Courier New", ui-monospace, monospace;
    font-size: ${baseFont}px;
    color: #000; background: #fff;
    -webkit-font-smoothing: none;
    font-smooth: never;
    text-rendering: geometricPrecision;
    ${bold ? 'font-weight: 700;' : ''}
  }
  /* Reforço: mais dots por caractere. Não substitui a densidade do driver,
     mas ajuda em bobina fraca ou cabeça já gasta. */
  ${bold ? '* { font-weight: 700 !important; }' : ''}
  * { color: #000 !important; }
  .receipt { width: ${printableWidth}; max-width: ${printableWidth};
             padding: ${narrow ? '2mm 1mm' : '4mm 2mm'};
             overflow: hidden; box-sizing: border-box; }
  .receipt * { max-width: 100%; overflow-wrap: anywhere; }
  .center { text-align: center; }
  .b { font-weight: 700; }
  .big { font-size: ${baseFont + 2}px; font-weight: 700; }
  .small { font-size: ${baseFont - 1}px; }
  .hr { border-top: 1px solid #000; margin: ${narrow ? '4px' : '6px'} 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .total { font-size: ${baseFont + 2}px; font-weight: 700; }
  .item { margin-bottom: 3px; }
  .item .name { word-break: break-word; }
  .box { border: 1px solid #000; padding: 3px; margin: 4px 0; text-align: center; }
</style>
</head><body>
  <div class="receipt">
    <div class="center b big">${safeName}</div>
    <div class="center b small">ORÇAMENTO</div>
    <div class="center small">${dt(quote.createdAtIso)}</div>
    <div class="box b">Nº ${escapeHtml(String(quote.number ?? '—'))}</div>
    ${quote.customerName ? `<div class="small">Cliente: ${escapeHtml(quote.customerName)}</div>` : ''}
    ${quote.customerPhone ? `<div class="small">Fone: ${escapeHtml(quote.customerPhone)}</div>` : ''}
    <div class="small">Vendedor: ${escapeHtml(quote.sellerName || 'não identificado')}</div>
    <div class="hr"></div>

    ${itemsHtml}

    <div class="hr"></div>
    <div class="row"><span>Subtotal</span><span>${brl(quote.subtotal)}</span></div>
    ${quote.discountAmount > 0 ? `<div class="row"><span>Desconto</span><span>- ${brl(quote.discountAmount)}</span></div>` : ''}
    ${quote.surchargeAmount > 0 ? `<div class="row"><span>Acréscimo</span><span>+ ${brl(quote.surchargeAmount)}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${brl(quote.totalAmount)}</span></div>

    <div class="box b">${escapeHtml(validLabel)}</div>
    ${quote.notes ? `<div class="small">Obs: ${escapeHtml(quote.notes)}</div>` : ''}

    <div class="hr"></div>
    <div class="center small">Este documento não é cupom fiscal</div>
    <div class="center small">e não garante reserva de estoque.</div>
    <div class="center" style="font-size:10px; color:#888;">SOLUÇÃO 2026 · PDV</div>
  </div>
</body></html>`;
}

// Cria janela oculta, carrega o HTML, imprime silenciosamente e fecha.
// Com `quote` no payload imprime orçamento; com `sale`, o cupom da venda.
async function printSilent({
  sale, quote, fiscal = null, tenantName, deviceName,
  copies = 1, paperWidth = 80, silent = true, printMode = 1, bold = false,
}) {
  // QR do DANFE gerado localmente: o cupom sai igual sem internet, e nenhum
  // dado da venda vai parar num serviço de terceiro.
  let qrDataUrl = null;
  if (fiscal && fiscal.qrCodeData) {
    try {
      qrDataUrl = await QRCode.toDataURL(fiscal.qrCodeData, {
        errorCorrectionLevel: 'M', margin: 1, scale: 6,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch (err) {
      // Sem QR o cupom ainda serve: a chave de acesso impressa permite a
      // consulta manual no site da SEFAZ.
      console.error('[print] falha ao gerar QR:', err.message);
    }
  }
  return printSilentInner({
    sale, quote, fiscal, qrDataUrl, tenantName, deviceName,
    copies, paperWidth, silent, printMode, bold,
  });
}

function printSilentInner({
  sale, quote, fiscal, qrDataUrl, tenantName, deviceName,
  copies, paperWidth, silent, printMode, bold,
}) {
  // O nome da impressora manda: evita cupom largo demais quando a opção da
  // tela não corresponde ao equipamento instalado.
  paperWidth = resolvePaperWidth(deviceName, paperWidth);
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 400, height: 800,
      webPreferences: { offscreen: false, sandbox: true },
    });
    const html = quote
      ? buildQuoteHtml({ quote, tenantName, paperWidth, bold })
      : buildReceiptHtml({ sale, tenantName, paperWidth, fiscal, qrDataUrl, bold });

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
      const tag = quote ? 'orcamento'
        : String(sale.offlineSyncId || '').startsWith('TEST') ? 'teste' : 'venda';
      const dbg = path.join(os.tmpdir(), `solucao-ultimo-cupom-${tag}.html`);
      fs.writeFileSync(dbg, html, 'utf8');
      fs.writeFileSync(
        path.join(os.tmpdir(), `solucao-ultimo-cupom-${tag}.json`),
        JSON.stringify({ paperWidthUsado: paperWidth, printMode, copies, deviceName, silent, sale, quote }, null, 2),
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

  // Orçamento: mesma rota de impressão, miolo diferente
  ipcMain.handle('print:quote-silent', async (_e, payload) => {
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

// Builders exportados para permitir validar o layout fora do Electron
module.exports = { registerPrintIpc, buildReceiptHtml, buildQuoteHtml, resolvePaperWidth };
