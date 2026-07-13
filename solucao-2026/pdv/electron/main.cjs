// SOLUÇÃO 2026 — PDV Electron main process
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { initDb, getDb } = require('./db.cjs');
const { registerSyncIpc } = require('./sync.cjs');
const { registerPrintIpc } = require('./print.cjs');
const { registerUpdaterIpc } = require('./updater.cjs');

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:5174';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    title: 'SOLUÇÃO 2026 — PDV',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ============================================================================
// Identidade do terminal — UUID persistente por instalação. O backend usa a
// chave para contar quantas máquinas o cliente ativou (limite por tenant).
// ============================================================================
function getTerminalInfo() {
  const file = path.join(app.getPath('userData'), 'terminal.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.terminalKey) return { ...saved, hostname: os.hostname() };
  } catch { /* primeira execução */ }
  const info = { terminalKey: crypto.randomUUID() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(info));
  return { ...info, hostname: os.hostname() };
}

// ============================================================================
// IPC handlers — surface a narrow API to the renderer via preload
// ============================================================================
function registerDbIpc() {
  ipcMain.handle('sys:terminal-info', () => getTerminalInfo());
  ipcMain.handle('db:get-products', () => getDb().prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY name').all());
  ipcMain.handle('db:get-customers', () => getDb().prepare('SELECT * FROM customers WHERE status = ? ORDER BY name').all('active'));

  ipcMain.handle('db:save-snapshot', (_e, { products, customers, settings }) => {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM products').run();
      const insP = db.prepare(`INSERT INTO products
        (id, sku, barcode, name, category, unit, emoji, cost_price, sale_price, stock_quantity, min_stock, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const p of products) {
        insP.run(p.id, p.sku, p.barcode, p.name, p.category, p.unit, p.emoji,
                 p.costPrice, p.salePrice, p.stockQuantity, p.minStock, p.isActive ? 1 : 0);
      }

      db.prepare('DELETE FROM customers').run();
      const insC = db.prepare(`INSERT INTO customers
        (id, name, tax_id, phone, email, loyalty_points, total_spent, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const c of customers) {
        insC.run(c.id, c.name, c.taxId, c.phone, c.email,
                 c.loyaltyPoints, c.totalSpent, c.status);
      }

      if (settings) {
        db.prepare('DELETE FROM settings').run();
        db.prepare(`INSERT INTO settings (id, payload, updated_at) VALUES (1, ?, datetime('now'))`)
          .run(JSON.stringify(settings));
      }
    });
    tx();
    return { ok: true, productCount: products.length, customerCount: customers.length };
  });

  ipcMain.handle('db:get-settings', () => {
    const row = getDb().prepare('SELECT payload FROM settings WHERE id = 1').get();
    return row ? JSON.parse(row.payload) : null;
  });

  ipcMain.handle('db:save-sale', (_e, sale) => {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO local_sales
        (offline_sync_id, customer_id, sale_date_iso, subtotal, discount_amount,
         total_amount, payment_method, amount_received, change_amount, payload_json, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
          sale.offlineSyncId, sale.customerId, sale.saleDateIso,
          sale.subtotal, sale.discountAmount, sale.totalAmount,
          sale.paymentMethod, sale.amountReceived, sale.changeAmount,
          JSON.stringify(sale));

      // Update local stock so the next render reflects what was sold
      const dec = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?');
      for (const it of sale.items) dec.run(it.quantity, it.productId);
    });
    tx();
    return { ok: true, offlineSyncId: sale.offlineSyncId };
  });

  ipcMain.handle('db:get-pending-sales', () => {
    return getDb().prepare('SELECT payload_json, offline_sync_id FROM local_sales WHERE synced = 0 ORDER BY id').all();
  });

  ipcMain.handle('db:mark-synced', (_e, syncedIds) => {
    const db = getDb();
    const upd = db.prepare("UPDATE local_sales SET synced = 1, synced_at = datetime('now') WHERE offline_sync_id = ?");
    const tx = db.transaction(() => { for (const id of syncedIds) upd.run(id); });
    tx();
    return { ok: true, count: syncedIds.length };
  });

  ipcMain.handle('db:reset', () => {
    const db = getDb();
    db.exec('DELETE FROM products; DELETE FROM customers; DELETE FROM local_sales; DELETE FROM settings;');
    return { ok: true };
  });
}

// ============================================================================
// App lifecycle
// ============================================================================
app.whenReady().then(() => {
  initDb();
  registerDbIpc();
  registerSyncIpc();
  registerPrintIpc();
  registerUpdaterIpc(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
