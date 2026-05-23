import React from 'react';
import { Card, Title, Text, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge, Button, ProgressBar, Flex } from "@tremor/react";
import { BrainCircuit, AlertTriangle, ArrowUpRight, ShoppingCart } from 'lucide-react';

const AIInventory = () => {
  const stockPredictions = [
    { name: "Arroz Branco 5kg", stock: 150, avgSales: 12, daysRemaining: 12, status: "Normal", risk: "low" },
    { name: "Leite Integral 1L", stock: 8, avgSales: 25, daysRemaining: 0, status: "Ruptura Iminente", risk: "critical" },
    { name: "Café Torrado 500g", stock: 5, avgSales: 3, daysRemaining: 1, status: "Repor Urgente", risk: "high" },
    { name: "Óleo de Soja 900ml", stock: 45, avgSales: 15, daysRemaining: 3, status: "Abaixo do Mínimo", risk: "medium" },
  ];

  return (
    <div className="p-10 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-start mb-10">
        <div>
          <Flex className="gap-2 mb-2">
            <BrainCircuit className="text-blue-600" />
            <Text className="text-blue-600 font-bold uppercase tracking-widest">Módulo de IA Preditiva</Text>
          </Flex>
          <Title className="text-4xl font-black text-slate-800">Estoque Inteligente</Title>
          <Text className="text-slate-500 mt-2">A IA está analisando seu histórico de vendas para prever faltas e excessos.</Text>
        </div>
        <Card className="max-w-xs ring-2 ring-blue-500 shadow-blue-100">
          <Text>Saúde Geral do Estoque</Text>
          <Metric className="text-blue-600">84%</Metric>
          <ProgressBar value={84} color="blue" className="mt-3" />
        </Card>
      </div>

      <Card className="ring-0 shadow-xl rounded-3xl p-8">
        <Title className="mb-6">Previsão de Ruptura (Próximos 7 dias)</Title>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Produto</TableHeaderCell>
              <TableHeaderCell>Estoque Atual</TableHeaderCell>
              <TableHeaderCell>Média Vendas/Dia</TableHeaderCell>
              <TableHeaderCell>Dias Restantes</TableHeaderCell>
              <TableHeaderCell>Status IA</TableHeaderCell>
              <TableHeaderCell>Ação Sugerida</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockPredictions.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-bold">{item.name}</TableCell>
                <TableCell>{item.stock} un</TableCell>
                <TableCell>{item.avgSales} un/dia</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={`font-black ${item.daysRemaining <= 2 ? 'text-rose-500' : 'text-slate-700'}`}>
                      {item.daysRemaining} dias
                    </span>
                    {item.daysRemaining <= 2 && <AlertTriangle size={14} className="text-rose-500" />}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge color={item.risk === 'critical' ? 'red' : item.risk === 'high' ? 'orange' : item.risk === 'medium' ? 'yellow' : 'green'}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="xs" variant="secondary" icon={ShoppingCart} color="blue">
                    Gerar Pedido de Compra
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-2 gap-6 mt-6">
        <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8 rounded-3xl ring-0">
          <Title className="text-white opacity-80 text-lg">Sugestão de Compra Inteligente</Title>
          <div className="mt-6 space-y-4">
            <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl">
              <Text className="text-white font-bold">Leite Integral 1L</Text>
              <div className="text-right">
                <Text className="text-white text-xs opacity-70">Sugerido</Text>
                <Text className="text-white font-black">+240 un</Text>
              </div>
            </div>
            <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl">
              <Text className="text-white font-bold">Café Torrado 500g</Text>
              <div className="text-right">
                <Text className="text-white text-xs opacity-70">Sugerido</Text>
                <Text className="text-white font-black">+50 un</Text>
              </div>
            </div>
          </div>
          <Button className="w-full mt-8 bg-white text-blue-600 hover:bg-slate-100 border-none font-bold">
            Enviar Pedidos para Fornecedores
          </Button>
        </Card>

        <Card className="p-8 rounded-3xl shadow-xl ring-0 border border-slate-100">
          <Title>Otimização Financeira</Title>
          <Text className="mt-2">Economia projetada ao evitar compras de emergência:</Text>
          <div className="mt-10 flex flex-col items-center justify-center">
            <div className="text-5xl font-black text-emerald-500">R$ 1.240,00</div>
            <Text className="text-slate-400 mt-2 italic">Projeção para os próximos 30 dias</Text>
            <div className="mt-8 flex gap-2">
              <ArrowUpRight className="text-emerald-500" />
              <Text className="text-emerald-500 font-bold">+15% de eficiência de caixa</Text>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AIInventory;
