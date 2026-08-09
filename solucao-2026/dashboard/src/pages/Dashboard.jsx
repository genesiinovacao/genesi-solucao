import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Title, Text, AreaChart, DonutChart, BadgeDelta, Metric } from '@tremor/react';
import { api } from '../lib/api';

const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: res } = await api.get('/api/dashboard/summary');
        setData(res);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="p-10 text-slate-500">Carregando dashboard…</main>;
  if (error)   return <main className="p-10 text-red-700">⚠️ {error}</main>;
  if (!data)   return null;

  const trend = data.salesChangePercent > 0 ? 'moderateIncrease'
              : data.salesChangePercent < 0 ? 'moderateDecrease' : 'unchanged';

  const sales7 = data.salesLast7Days.map((p) => ({
    Dia: new Date(p.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Vendas: p.total,
  }));

  const categories = data.salesByCategory.map((c) => ({ name: c.category, value: c.total }));

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📊 Dashboard</h1>
          <Text className="text-slate-500 mt-1">Resumo em tempo real (RLS isola por tenant).</Text>
        </div>
        <BadgeDelta deltaType={trend} className="px-3 py-1.5">
          {data.salesChangePercent > 0 ? '+' : ''}{data.salesChangePercent.toFixed(1)}% vs. ontem
        </BadgeDelta>
      </div>

      {/* Saldo negativo é dívida de entrada de nota: fica no alto porque
          divergência esquecida vira inventário errado, e ninguém abre a tela
          de produtos para conferir por conta própria. */}
      {data.negativeStockCount > 0 && (
        <div className="mb-8 rounded-xl border border-red-300 bg-red-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-red-800">
                📥 {data.negativeStockCount} produto(s) vendido(s) sem estoque
              </h2>
              <p className="text-sm text-red-700 mt-1">
                O saldo está negativo até você dar entrada na nota. Enquanto isso,
                o estoque desses itens não vale como número.
              </p>
              {data.negativeStockProducts?.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-red-800">
                  {data.negativeStockProducts.map((p) => (
                    <li key={p.id} className="tabular-nums">
                      {p.emoji} {p.name}
                      <strong className="ml-1.5">{p.stockQuantity}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Link to="/products?estoque=negativo"
                  className="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">
              Regularizar
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <Card decoration="top" decorationColor="blue">
          <Text>💰 Vendas Hoje</Text>
          <Metric className="mt-1">{brl(data.salesToday)}</Metric>
          <Text className="text-xs mt-2">{data.salesCountToday} venda(s)</Text>
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <Text>🎯 Ticket Médio</Text>
          <Metric className="mt-1">{brl(data.averageTicketToday)}</Metric>
          <Text className="text-xs mt-2">por venda hoje</Text>
        </Card>
        <Card decoration="top" decorationColor={data.lowStockCount > 0 ? 'amber' : 'slate'}>
          <Text>📦 Estoque Crítico</Text>
          <Metric className="mt-1">{data.lowStockCount}</Metric>
          <Text className="text-xs mt-2">produto(s) abaixo do mínimo</Text>
        </Card>
        <Card decoration="top" decorationColor="indigo">
          <Text>👥 Clientes Ativos</Text>
          <Metric className="mt-1">{data.customerCount}</Metric>
          <Text className="text-xs mt-2">{data.activeDeliveries} delivery(s) em andamento</Text>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <Card className="lg:col-span-2">
          <Title>Vendas — últimos 7 dias</Title>
          <AreaChart
            className="h-72 mt-4"
            data={sales7}
            index="Dia"
            categories={["Vendas"]}
            colors={["blue"]}
            valueFormatter={brl}
            yAxisWidth={70}
            showLegend={false}
          />
        </Card>
        <Card>
          <Title>Vendas por categoria</Title>
          <Text className="text-xs">últimos 30 dias</Text>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500 mt-10 text-center">Ainda sem vendas registradas.</p>
          ) : (
            <DonutChart
              className="h-64 mt-4"
              data={categories}
              category="value"
              index="name"
              valueFormatter={brl}
            />
          )}
        </Card>
      </div>

      <Card>
        <Title>🚨 Produtos com estoque baixo</Title>
        <Text className="text-xs">precisam de reposição</Text>
        {data.lowStockProducts.length === 0 ? (
          <p className="text-sm text-emerald-600 mt-6 text-center py-6">✅ Nenhum produto crítico no momento.</p>
        ) : (
          <table className="w-full text-sm mt-4">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2">Produto</th>
                <th className="text-right">Estoque atual</th>
                <th className="text-right">Mínimo</th>
                <th className="text-right">Falta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.lowStockProducts.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 text-slate-700">
                    <span className="mr-2">{p.emoji}</span>{p.name}
                  </td>
                  <td className="text-right font-semibold text-red-600">{p.stockQuantity}</td>
                  <td className="text-right text-slate-600">{p.minStock}</td>
                  <td className="text-right font-bold text-amber-600">{Math.max(0, p.minStock - p.stockQuantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
