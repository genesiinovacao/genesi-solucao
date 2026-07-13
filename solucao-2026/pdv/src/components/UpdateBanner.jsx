import { useEffect, useState } from 'react';

// Aviso discreto de atualização do aplicativo. O download acontece sozinho em
// segundo plano; o operador escolhe quando reiniciar — nunca interrompe venda.
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null); // {status, version?, percent?}
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.pdv?.onUpdateEvent) return undefined; // dev no navegador
    const unsubscribe = window.pdv.onUpdateEvent((data) => {
      // Erros de rede não interessam ao operador — o PDV segue normal
      if (data.status === 'error' || data.status === 'none') setUpdate(null);
      else setUpdate(data);
    });
    return unsubscribe;
  }, []);

  if (!update || dismissed) return null;

  if (update.status === 'downloading') {
    return (
      <div className="fixed bottom-3 right-3 z-50 bg-slate-800/95 border border-slate-600 rounded-full px-4 py-1.5 text-xs text-slate-300 shadow-lg">
        ⬇️ Baixando atualização{update.version ? ` v${update.version}` : ''}
        {typeof update.percent === 'number' ? ` — ${update.percent}%` : '…'}
      </div>
    );
  }

  if (update.status === 'ready') {
    return (
      <div className="fixed bottom-3 right-3 z-50 bg-emerald-900/95 border border-emerald-600 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 max-w-sm">
        <span className="text-xl">🚀</span>
        <div className="text-xs text-emerald-100">
          <p className="font-semibold">Nova versão {update.version} pronta</p>
          <p className="text-emerald-300/80">Atualiza ao reiniciar — termine a venda antes.</p>
        </div>
        <button onClick={() => window.pdv.installUpdate()}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-lg text-xs font-bold whitespace-nowrap">
          Reiniciar agora
        </button>
        <button onClick={() => setDismissed(true)} title="Atualiza sozinho quando o PDV for fechado"
                className="text-emerald-400 hover:text-emerald-200 text-sm">✕</button>
      </div>
    );
  }

  return null;
}
