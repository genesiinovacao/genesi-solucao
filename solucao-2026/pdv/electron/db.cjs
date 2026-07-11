// SOLUÇÃO 2026 — Local SQLite (better-sqlite3) on the Electron main process.
// File lives at %APPDATA%/solucao-pdv/data.db (Windows) — survives app restarts.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

function initDb() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'data.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA);

  console.log(`[pdv-db] ready at ${dbPath}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialised. Call initDb() first.');
  return db;
}

// Snapshot of the products/customers that arrived from the backend during the
// last bootstrap. local_sales is the offline write-ahead log that the
// SyncService drains when the PDV is online again.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
    id              TEXT PRIMARY KEY,
    sku             TEXT,
    barcode         TEXT,
    name            TEXT NOT NULL,
    category        TEXT,
    unit            TEXT NOT NULL DEFAULT 'un',
    emoji           TEXT,
    cost_price      REAL NOT NULL DEFAULT 0,
    sale_price      REAL NOT NULL DEFAULT 0,
    stock_quantity  REAL NOT NULL DEFAULT 0,
    min_stock       REAL NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE TABLE IF NOT EXISTS customers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    tax_id          TEXT,
    phone           TEXT,
    email           TEXT,
    loyalty_points  INTEGER NOT NULL DEFAULT 0,
    total_spent     REAL NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON customers(tax_id);

CREATE TABLE IF NOT EXISTS local_sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    offline_sync_id TEXT NOT NULL UNIQUE,
    customer_id     TEXT,
    sale_date_iso   TEXT NOT NULL,
    subtotal        REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    total_amount    REAL NOT NULL,
    payment_method  TEXT NOT NULL,
    amount_received REAL,
    change_amount   REAL,
    payload_json    TEXT NOT NULL,
    synced          INTEGER NOT NULL DEFAULT 0,
    synced_at       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_local_sales_pending ON local_sales(synced);

CREATE TABLE IF NOT EXISTS settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    payload     TEXT NOT NULL,
    updated_at  TEXT
);
`;

module.exports = { initDb, getDb };
