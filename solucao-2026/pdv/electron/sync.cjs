// SOLUÇÃO 2026 — Sync service. Drains local_sales -> POST /api/sync/sales.
// Idempotent via offline_sync_id (the backend rejects duplicates).
const { ipcMain, net } = require('electron');
const { getDb } = require('./db.cjs');

async function postJson(url, jwt, body) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'POST', url });
    req.setHeader('Authorization', `Bearer ${jwt}`);
    req.setHeader('Content-Type', 'application/json');

    const chunks = [];
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`HTTP ${res.statusCode}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry com backoff exponencial para blips de rede (o renderer também
// reagenda a cada 30s, então aqui só absorvemos falhas transitórias).
async function postJsonWithRetry(url, jwt, body, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await postJson(url, jwt, body);
    } catch (err) {
      lastErr = err;
      // 401/403: token inválido — repetir não resolve, devolve na hora
      if (/^HTTP 40[13]/.test(err.message)) throw err;
      if (i < attempts - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

async function runSync(apiBase, jwt) {
  const db = getDb();
  const pending = db.prepare('SELECT offline_sync_id, payload_json FROM local_sales WHERE synced = 0 ORDER BY id').all();
  if (pending.length === 0) return { ok: true, sent: 0, succeeded: 0 };

  const batch = pending.map((row) => {
    const sale = JSON.parse(row.payload_json);
    return {
      offlineSyncId: sale.offlineSyncId,
      customerId:    sale.customerId || null,
      cashSessionId: sale.cashSessionId || null,
      saleDate:      sale.saleDateIso,
      subtotal:      sale.subtotal,
      discountAmount: sale.discountAmount,
      surchargeAmount: sale.surchargeAmount || 0,
      quoteId:        sale.quoteId || null,
      totalAmount:   sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      amountReceived: sale.amountReceived,
      changeAmount:   sale.changeAmount,
      posTerminalId:  'pdv-electron-01',
      items: sale.items.map((i) => ({
        productId:      i.productId,
        productName:    i.productName,
        quantity:       i.quantity,
        unitPrice:      i.unitPrice,
        discountAmount: i.discountAmount || 0,
        totalPrice:     i.totalPrice,
      })),
      payments: sale.payments || [
        { method: sale.paymentMethod, amount: sale.totalAmount, authorizationCode: null }
      ],
    };
  });

  const url = `${apiBase.replace(/\/$/, '')}/api/sync/sales`;
  let results;
  try {
    results = await postJsonWithRetry(url, jwt, batch);
  } catch (err) {
    return { ok: false, sent: batch.length, succeeded: 0, pending: batch.length, error: err.message };
  }

  const succeeded = results.filter((r) => r.status === 'Success' || r.status === 'AlreadySynced').map((r) => r.offlineSyncId);

  const upd = db.prepare("UPDATE local_sales SET synced = 1, synced_at = datetime('now') WHERE offline_sync_id = ?");
  const tx = db.transaction(() => { for (const id of succeeded) upd.run(id); });
  tx();

  // Venda recusada pelo servidor não é sucesso. Antes isto voltava ok:true e a
  // tela dizia "sincronizado" com a venda parada na fila — o operador só
  // descobria pelo contador que não zerava.
  const failed = results.filter((r) => r.status === 'Error');
  if (failed.length > 0) {
    const detalhe = failed.map((f) => f.message).filter(Boolean).join(' · ');
    return {
      ok: false,
      sent: batch.length,
      succeeded: succeeded.length,
      pending: batch.length - succeeded.length,
      results,
      error: detalhe || `${failed.length} venda(s) recusada(s) pelo servidor.`,
    };
  }

  return { ok: true, sent: batch.length, succeeded: succeeded.length, pending: batch.length - succeeded.length, results };
}

function registerSyncIpc() {
  ipcMain.handle('sync:run', async (_e, { apiBase, jwt }) => {
    if (!apiBase || !jwt) return { ok: false, error: 'Missing apiBase or jwt' };
    return runSync(apiBase, jwt);
  });
}

module.exports = { registerSyncIpc, runSync };
