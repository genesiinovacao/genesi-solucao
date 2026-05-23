import React from 'react';
import { Card, Grid, Title, Text, TabGroup, TabList, Tab, TabPanels, TabPanel, AreaChart, BarChart, DonutChart, BadgeDelta, Flex, Metric } from "@tremor/react";

const Dashboard = () => {
  const data = [
    { date: "May 10", Sales: 2840.50, Target: 3500 },
    { date: "May 11", Sales: 3120.80, Target: 3500 },
    { date: "May 12", Sales: 2950.30, Target: 3500 },
    { date: "May 13", Sales: 3800.00, Target: 3500 },
    { date: "May 14", Sales: 4200.00, Target: 3500 },
    { date: "May 15", Sales: 3950.00, Target: 3500 },
  ];

  const categories = [
    { name: "Alimentos", value: 4500, color: "blue" },
    { name: "Limpeza", value: 1200, color: "cyan" },
    { name: "Higiene", value: 800, color: "indigo" },
  ];

  return (
    <main className="p-12 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-10">
        <div>
          <Title className="text-3xl font-bold text-slate-800">Dashboard Administrativo</Title>
          <Text className="text-slate-500">Bem-vindo, Joelson Silva. Aqui está o resumo de todos os PDVs.</Text>
        </div>
        <BadgeDelta deltaType="moderateIncrease" className="px-4 py-2">
          +12.5% vs mês anterior
        </BadgeDelta>
      </div>

      <Grid numItemsSm={2} numItemsLg={4} className="gap-6 mb-10">
        <Card decoration="top" decorationColor="blue">
          <Text>Vendas Hoje</Text>
          <Metric>R$ 3.950,00</Metric>
        </Card>
        <Card decoration="top" decorationColor="green">
          <Text>Ticket Médio</Text>
          <Metric>R$ 82,29</Metric>
        </Card>
        <Card decoration="top" decorationColor="amber">
          <Text>Estoque Crítico</Text>
          <Metric>12 itens</Metric>
        </Card>
        <Card decoration="top" decorationColor="indigo">
          <Text>PDVs Ativos</Text>
          <Metric>5 / 5</Metric>
        </Card>
      </Grid>

      <Grid numItemsLg={3} className="gap-6">
        <Card className="col-span-2">
          <Title>Performance de Vendas (Real vs Meta)</Title>
          <AreaChart
            className="h-80 mt-4"
            data={data}
            index="date"
            categories={["Sales", "Target"]}
            colors={["blue", "slate"]}
            valueFormatter={(v) => `R$ ${v.toLocaleString('pt-BR')}`}
            yAxisWidth={60}
          />
        </Card>

        <Card>
          <Title>Vendas por Categoria</Title>
          <DonutChart
            className="h-80 mt-4"
            data={categories}
            category="value"
            index="name"
            colors={["blue", "cyan", "indigo"]}
            valueFormatter={(v) => `R$ ${v.toLocaleString('pt-BR')}`}
          />
        </Card>
      </Grid>

      <Card className="mt-6">
        <Title>Relatório de Fluxo por Horário (Heatmap Simulado)</Title>
        <BarChart
          className="h-72 mt-4"
          data={[
            { hour: "08:00", count: 12 },
            { hour: "10:00", count: 35 },
            { hour: "12:00", count: 89 },
            { hour: "14:00", count: 42 },
            { hour: "16:00", count: 67 },
            { hour: "18:00", count: 120 },
            { hour: "20:00", count: 45 },
          ]}
          index="hour"
          categories={["count"]}
          colors={["blue"]}
          showLegend={false}
        />
      </Card>
    </main>
  );
};

export default Dashboard;
