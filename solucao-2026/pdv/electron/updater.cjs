// SOLUÇÃO 2026 — Auto-update via GitHub Releases (electron-updater).
// Fluxo: checa ao abrir (e a cada 4h), baixa em segundo plano e avisa o
// renderer; a troca de versão só acontece quando o operador clica em
// "Reiniciar e atualizar" (ou no próximo fechamento do app) — nunca no meio
// de uma venda.
const { app, ipcMain } = require('electron');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function registerUpdaterIpc(getWindow) {
  ipcMain.handle('sys:app-version', () => app.getVersion());

  // Em desenvolvimento não há pacote instalado para atualizar
  if (!app.isPackaged) {
    ipcMain.handle('updates:check', () => ({ status: 'dev' }));
    ipcMain.handle('updates:install', () => ({ ok: false }));
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // fechou o PDV = atualizou

  const send = (payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('updates:event', payload);
  };

  autoUpdater.on('update-available',     (info) => send({ status: 'downloading', version: info.version }));
  autoUpdater.on('update-not-available', ()     => send({ status: 'none' }));
  autoUpdater.on('download-progress',    (p)    => send({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded',    (info) => send({ status: 'ready', version: info.version }));
  autoUpdater.on('error',                (err)  => send({ status: 'error', message: String(err?.message || err) }));

  ipcMain.handle('updates:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      // Sem internet / GitHub fora do ar: o PDV segue funcionando normalmente
      send({ status: 'error', message: String(err?.message || err) });
      return { ok: false };
    }
  });

  ipcMain.handle('updates:install', () => {
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => { /* offline — tenta de novo depois */ });
  setTimeout(check, 10_000); // deixa a janela abrir antes
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { registerUpdaterIpc };
