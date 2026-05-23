/**
 * SOLUÇÃO 2026 - SyncService (Desktop PDV)
 * Responsible for managing the offline-to-cloud synchronization flow.
 */

class SyncService {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.isSyncing = false;
    this.init();
  }

  init() {
    // Listen for browser/app online status
    window.addEventListener('online', () => {
      console.log('📶 Internet Restaurada! Iniciando sincronização...');
      this.syncPendingData();
    });

    // Check periodically anyway in case 'online' event missed something
    setInterval(() => this.syncPendingData(), 60000); // every 1 min
  }

  /**
   * Main sync loop
   */
  async syncPendingData() {
    if (this.isSyncing || !navigator.onLine) return;

    try {
      this.isSyncing = true;
      
      // 1. Get unsynced sales from local storage (SQLite or IndexedDB mockup)
      const pendingSales = await this.getLocalUnsyncedSales();
      
      if (pendingSales.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`📤 Enviando ${pendingSales.length} vendas para a nuvem...`);

      // 2. Post to Central API
      const response = await fetch(`${this.apiBaseUrl}/api/sync/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': localStorage.getItem('tenant_id') // Identifying the client
        },
        body: JSON.stringify(pendingSales)
      });

      if (response.ok) {
        const results = await response.json();
        
        // 3. Update local records based on server confirmation
        await this.markAsSynced(results);
        console.log('✅ Sincronização concluída com sucesso!');
      }
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Mock of SQLite query
   */
  async getLocalUnsyncedSales() {
    // In a real Electron app, this would be: 
    // db.all("SELECT * FROM sales WHERE synced = 0")
    const allSales = JSON.parse(localStorage.getItem('local_sales') || '[]');
    return allSales.filter(s => !s.synced);
  }

  /**
   * Update local status
   */
  async markAsSynced(results) {
    let allSales = JSON.parse(localStorage.getItem('local_sales') || '[]');
    
    results.forEach(res => {
      if (res.status === 'Success' || res.status === 'AlreadySynced') {
        const sale = allSales.find(s => s.offlineSyncId === res.offlineSyncId);
        if (sale) sale.synced = true;
      }
    });

    localStorage.setItem('local_sales', JSON.stringify(allSales));
  }

  /**
   * Save a new sale (called by PDV UI)
   */
  async saveSaleLocally(saleData) {
    const sale = {
      ...saleData,
      offlineSyncId: crypto.randomUUID(),
      synced: false,
      saleDate: new Date().toISOString()
    };

    // Save to local storage
    const allSales = JSON.parse(localStorage.getItem('local_sales') || '[]');
    allSales.push(sale);
    localStorage.setItem('local_sales', JSON.stringify(allSales));

    // Try immediate sync if online
    this.syncPendingData();
    
    return sale;
  }
}

export default new SyncService('https://api.solucao2026.com.br');
