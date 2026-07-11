import { useEffect, useState } from 'react';
import { Card, Title, Text, LineChart, BarChart, DonutChart, Metric } from '@tremor/react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export default function Reports() {
  const [period, setPeriod] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: res } = await api.get('/api/reports/sales-overview', { params: { period } });
        setData(res);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally { setLoading(false); }
    })();
  }, [period]);

  const exportPdf = () => window.print();

  if (loading) return <main className="p-10 text-slate-500">Carregando relatórios…</main>;
  if (error)   return <main className="p-10 text-red-700">⚠️ {error}</main>;
  if (!data)   return null;

  const lineData = data.dailySeries.map((p) => ({
    Dia: fmtDate(p.date),
    Vendas: p.total,
  }));
  const productsData = data.topProducts.map((p) => ({ name: p.name, value: p.revenue }));
  const categoriesData = data.byCategory.map((c) => ({ name: c.category, value: c.revenue }));
  const empty = data.totalSalesCount === 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📈 Relatórios</h1>
          <Text className="text-slate-500 mt-1">
            Análise das vendas — {fmtDate(data.from)} a {fmtDate(data.to)}
          </Text>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-white border border-slate-300 rounded-lg overflow-hidden text-sm">
            {[7, 15, 30].map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                      className={`px-4 py-2 ${period === p ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                {p} dias
              </button>
            ))}
          </div>
          <button onClick={exportPdf} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">
            📥 Exportar PDF
          </button>
        </div>
      </header>

      {empty && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm">
          ℹ️ Ainda não há vendas registradas neste período. As vendas chegam pelo PDV (Fase 3).
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card decoration="top" decorationColor="blue">
          <Text>💰 Faturamento</Text>
          <Metric className="mt-1 !text-xl">{brl(data.totalRevenue)}</Metric>
          <Text className="text-xs mt-2">no período</Text>
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <Text>🛍️ Total de Vendas</Text>
          <Metric className="mt-1 !text-xl">{data.totalSalesCount}</Metric>
          <Text className="text-xs mt-2">transações</Text>
        </Card>
        <Card decoration="top" decorationColor="indigo">
          <Text>🎯 Ticket Médio</Text>
          <Metric className="mt-1 !text-xl">{brl(data.averageTicket)}</Metric>
          <Text className="text-xs mt-2">por venda</Text>
        </Card>
        <Card decoration="top" decorationColor="amber">
          <Text>🏆 Melhor Dia</Text>
          <Metric className="mt-1 !text-xl">{data.bestDay ? fmtDate(data.bestDay) : '—'}</Metric>
          <Text className="text-xs mt-2">{brl(data.bestDayRevenue)}</Text>
        </Card>
      </div>

      <Card className="mb-6">
        <Title>📈 Evolução das vendas</Title>
        <LineChart className="h-72 mt-4"
                   data={lineData} index="Dia" categories={["Vendas"]}
                   colors={["blue"]} valueFormatter={brl} yAxisWidth={70} showLegend={false} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card>
          <Title>📦 Top 5 Produtos</Title>
          <Text className="text-xs">por faturamento</Text>
          {productsData.length === 0
            ? <p className="text-sm text-slate-500 mt-10 text-center">Sem produtos vendidos.</p>
            : <BarChart className="h-72 mt-4" data={productsData} index="name"
                        categories={["value"]} colors={["blue"]} layout="vertical"
                        valueFormatter={brl} yAxisWidth={140} showLegend={false} />}
        </Card>
        <Card>
          <Title>📁 Vendas por Categoria</Title>
          <Text className="text-xs">distribuição percentual</Text>
          {categoriesData.length === 0
            ? <p className="text-sm text-slate-500 mt-10 text-center">Sem categorias.</p>
            : <DonutChart className="h-72 mt-4" data={categoriesData} index="name"
                          category="value" valueFormatter={brl} />}
        </Card>
      </div>

      <Card className="mb-6">
        <Title>🥇 Top 5 Clientes</Title>
        <Text className="text-xs">maiores compradores no período</Text>
        {data.topCustomers.length === 0 ? (
          <p className="text-sm text-slate-500 mt-10 text-center">Nenhum cliente com compra no período.</p>
        ) : (
          <div className="space-y-3 mt-4">
            {data.topCustomers.map((c, i) => {
              const max = data.topCustomers[0].totalSpent || 1;
              const pct = (c.totalSpent / max) * 100;
              return (
                <div key={c.id || c.name + i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">
                      <span className="font-bold text-blue-600 mr-2">#{i + 1}</span>{c.name}
                      <span className="text-xs text-slate-400 ml-2">{c.purchases} compra(s)</span>
                    </span>
                    <span className="font-bold text-slate-800">{brl(c.totalSpent)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <Title>📋 Histórico diário</Title>
        <Text className="text-xs">faturamento dia a dia com variação vs. dia anterior</Text>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr className="text-left uppercase tracking-wide">
                <th className="py-2">Data</th>
                <th className="text-right">Vendas</th>
                <th className="text-right">Faturamento</th>
                <th className="text-right">Variação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.dailySeries.slice().reverse().map((p) => (
                <tr key={p.date}>
                  <td className="py-2 text-slate-700">{new Date(p.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                  <td className="text-right text-slate-600">{p.salesCount}</td>
                  <td className="text-right font-semibold text-slate-800">{brl(p.total)}</td>
                  <td className="text-right">
                    {p.changePercent > 0 && <span className="text-emerald-600">▲ {p.changePercent.toFixed(1)}%</span>}
                    {p.changePercent < 0 && <span className="text-rose-600">▼ {Math.abs(p.changePercent).toFixed(1)}%</span>}
                    {p.changePercent === 0 && <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
