// SOLUÇÃO 2026 — secure bridge between renderer and main
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdv', {
  // ---- Catalogue (local SQLite) ----
  getProducts:  ()        => ipcRenderer.invoke('db:get-products'),
  getCustomers: ()        => ipcRenderer.invoke('db:get-customers'),
  getSettings:  ()        => ipcRenderer.invoke('db:get-settings'),
  saveSnapshot: (data)    => ipcRenderer.invoke('db:save-snapshot', data),

  // ---- Sales ----
  saveSale:        (sale) => ipcRenderer.invoke('db:save-sale', sale),
  getPendingSales: ()     => ipcRenderer.invoke('db:get-pending-sales'),
  markSynced:      (ids)  => ipcRenderer.invoke('db:mark-synced', ids),

  // ---- Sync ----
  syncNow: (apiBase, jwt) => ipcRenderer.invoke('sync:run', { apiBase, jwt }),

  // ---- Identidade do terminal (limite de PDVs por cliente) ----
  getTerminalInfo: () => ipcRenderer.invoke('sys:terminal-info'),

  // ---- Reset (clears local snapshot — useful when switching tenant) ----
  reset: () => ipcRenderer.invoke('db:reset'),

  // ---- Impressão térmica silenciosa ----
  listPrinters: ()             => ipcRenderer.invoke('print:list-printers'),
  printReceiptSilent: (payload) => ipcRenderer.invoke('print:receipt-silent', payload),
});
