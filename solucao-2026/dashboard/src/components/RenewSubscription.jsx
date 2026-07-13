import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const PLAN_LABELS = {
  basic: 'Basic', standard: 'Standard', premium: 'Premium', enterprise: 'Enterprise',
};
const PERIODS = [
  { months: 1, label: '1 mês' },
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '12 meses' },
];

/**
 * Fluxo de renovação por PIX: escolhe plano+período → QR Code na tela →
 * o componente consulta o status a cada 5s; quando o pagamento cai, a
 * validade já foi estendida pelo backend e o onRenewed é chamado.
 */
export default function RenewSubscription({ currentPlan, onClose, onRenewed }) {
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(currentPlan || 'standard');
  const [months, setMonths] = useState(1);
  const [charge, setCharge] = useState(null); // cobrança criada (fase QR)
  const [paid, setPaid] = useState(null);     // {newExpiresAt}
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);

  useEffect(() => {
    api.get('/api/billing/plans')
      .then(({ data }) => setPlans(data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  // Desenha o QR quando a cobrança existe
  useEffect(() => {
    if (charge && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, charge.qrCodeText, { width: 232, margin: 1 })
        .catch(() => {});
    }
  }, [charge]);

  // Polling do pagamento a cada 5s enquanto o QR está na tela
  useEffect(() => {
    if (!charge || paid) return undefined;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/api/billing/charges/${charge.id}`);
        if (data.status === 'paid') {
          setPaid({ newExpiresAt: data.newExpiresAt });
          clearInterval(t);
        }
      } catch { /* tenta de novo no próximo tick */ }
    }, 5000);
    return () => clearInterval(t);
  }, [charge, paid]);

  const price = plans.find((p) => p.planType === plan)?.monthlyPrice ?? 0;
  const total = price * months;

  const createCharge = async () => {
    setError('');
    setCreating(true);
    try {
      const { data } = await api.post('/api/billing/charges', { planType: plan, months });
      setCharge(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(charge.qrCodeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch { /* clipboard bloqueado */ }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[60]" onClick={paid ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-auto">
        <header className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">💠 Renovar assinatura via PIX</h2>
        </header>

        {/* ===== Fase 3: pago ===== */}
        {paid ? (
          <div className="p-8 text-center space-y-4">
            <div className="text-6xl">✅</div>
            <h3 className="text-xl font-bold text-emerald-700">Pagamento confirmado!</h3>
            <p className="text-sm text-slate-600">
              Assinatura <strong>{PLAN_LABELS[plan]}</strong> renovada
              {paid.newExpiresAt && <> até <strong>{new Date(`${paid.newExpiresAt}T12:00:00`).toLocaleDateString('pt-BR')}</strong></>}.
            </p>
            <button onClick={onRenewed}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold">
              Continuar usando o sistema
            </button>
          </div>
        ) : charge ? (
          /* ===== Fase 2: QR aguardando pagamento ===== */
          <div className="p-6 text-center space-y-4">
            <p className="text-sm text-slate-600">
              Pague <strong>{brl(charge.amount)}</strong> — {PLAN_LABELS[charge.planType]} por {charge.months} mês(es)
            </p>
            <div className="inline-block p-3 bg-white border-2 border-slate-200 rounded-2xl">
              <canvas ref={canvasRef} />
            </div>
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-700 mb-1">PIX copia e cola</label>
              <div className="flex gap-2">
                <input readOnly value={charge.qrCodeText}
                       className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 truncate" />
                <button onClick={copy}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs whitespace-nowrap">
                  {copied ? '✅ Copiado' : '📋 Copiar'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              Aguardando pagamento… a confirmação é automática.
            </div>
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Pagar depois
            </button>
          </div>
        ) : (
          /* ===== Fase 1: escolha de plano e período ===== */
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Plano</label>
              <div className="grid grid-cols-2 gap-2">
                {plans.map((p) => (
                  <button key={p.planType} type="button" onClick={() => setPlan(p.planType)}
                          className={`p-3 rounded-xl border-2 text-left transition-colors ${
                            plan === p.planType ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-semibold text-sm text-slate-800">
                      {PLAN_LABELS[p.planType]}
                      {p.planType === currentPlan && <span className="text-[10px] text-blue-600 ml-1">(atual)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{brl(p.monthlyPrice)}/mês</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Período</label>
              <div className="flex gap-2">
                {PERIODS.map((per) => (
                  <button key={per.months} type="button" onClick={() => setMonths(per.months)}
                          className={`flex-1 py-2 rounded-lg border-2 text-sm transition-colors ${
                            months === per.months ? 'border-blue-600 bg-blue-50 font-semibold' : 'border-slate-200 hover:border-slate-300'}`}>
                    {per.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
              <span className="text-sm text-slate-600">Total</span>
              <span className="text-2xl font-extrabold text-slate-800">{brl(total)}</span>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">⚠️ {error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button type="button" onClick={createCharge} disabled={creating || plans.length === 0}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                {creating ? 'Gerando PIX…' : 'Gerar QR Code PIX'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
