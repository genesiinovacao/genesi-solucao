import React from 'react';
import { Card, Title, Text, BarChart, AreaChart, ColorPanel, Grid, Col, DeltaBar, Flex, Badge, Button } from "@tremor/react";
import { Printer, Download, Filter, Calendar } from 'lucide-react';

const Reports = () => {
  // Simulação de dados para o Mapa de Calor (Vendas por Hora)
  const heatmapData = [
    { hour: "08h", segunda: 12, terca: 15, quarta: 10, quinta: 18, sexta: 25, sabado: 40 },
    { hour: "10h", segunda: 35, terca: 30, quarta: 45, quinta: 40, sexta: 55, sabado: 85 },
    { hour: "12h", segunda: 90, terca: 85, quarta: 95, quinta: 110, sexta: 130, sabado: 150 },
    { hour: "14h", segunda: 45, terca: 40, quarta: 50, quinta: 48, sexta: 60, sabado: 90 },
    { hour: "16h", segunda: 65, terca: 70, quarta: 60, quinta: 80, sexta: 95, sabado: 110 },
    { hour: "18h", segunda: 110, terca: 120, quarta: 105, quinta: 130, sexta: 160, sabado: 180 },
    { hour: "20h", segunda: 40, terca: 35, quarta: 45, quinta: 50, sexta: 70, sabado: 95 },
  ];

  const performanceData = [
    { name: "PDV 01 - Principal", sales: 45000, status: "Acima da Meta" },
    { name: "PDV 02 - Entrada", sales: 32000, status: "Na Meta" },
    { name: "PDV 03 - Conveniência", sales: 28000, status: "Abaixo da Meta" },
  ];

  return (
    <div className="p-10 bg-slate-50 min-h-screen">
      {/* HEADER */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <Badge color="blue" className="mb-2">Relatórios BI</Badge>
          <Title className="text-4xl font-black text-slate-800">Análise de Performance</Title>
          <Text className="text-slate-500 mt-2">Visão detalhada de fluxo e conversão de todos os pontos de venda.</Text>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={Filter}>Filtros</Button>
          <Button variant="secondary" icon={Calendar}>Maio 2026</Button>
          <Button variant="primary" icon={Printer} onClick={() => window.print()}>Exportar PDF</Button>
        </div>
      </div>

      <Grid numItemsLg={3} className="gap-6">
        {/* HEATMAP SECTION */}
        <Col numColSpanLg={2}>
          <Card className="ring-0 shadow-xl rounded-3xl p-8">
            <div className="flex justify-between items-start mb-8">
              <div>
                <Title className="text-2xl font-bold">Mapa de Calor de Vendas</Title>
                <Text>Volume de transações por hora e dia da semana</Text>
              </div>
              <Badge deltaType="increase">Pico: Sábado 18h</Badge>
            </div>
            
            {/* Visual Heatmap representation using BarChart */}
            <BarChart
              className="h-96 mt-4"
              data={heatmapData}
              index="hour"
              categories={["segunda", "terca", "quarta", "quinta", "sexta", "sabado"]}
              colors={["slate", "slate", "slate", "blue", "indigo", "violet"]}
              yAxisWidth={48}
              showLegend={true}
              stack={true}
            />
            <div className="mt-6 p-4 bg-blue-50 rounded-2xl flex items-center gap-4 border border-blue-100">
              <div className="bg-blue-500 w-2 h-10 rounded-full"></div>
              <Text className="text-blue-800 font-medium">
                Insight: Seu faturamento aumenta **35%** entre as **17h e 19h**. 
                Considere reforçar a equipe neste período.
              </Text>
            </div>
          </Card>
        </Col>

        {/* PERFORMANCE RANKING */}
        <Col>
          <Card className="ring-0 shadow-xl rounded-3xl p-8 h-full">
            <Title className="text-2xl font-bold mb-6">Ranking de PDVs</Title>
            <div className="space-y-8">
              {performanceData.map((item, index) => (
                <div key={item.name} className="relative">
                  <Flex className="mb-2">
                    <Text className="font-bold text-slate-700">{item.name}</Text>
                    <Text className="font-mono font-bold text-blue-600">
                      R$ {item.sales.toLocaleString('pt-BR')}
                    </Text>
                  </Flex>
                  <DeltaBar 
                    value={index === 0 ? 80 : index === 1 ? 60 : 45} 
                    isIncreasing={index < 2} 
                    className="mt-2" 
                  />
                  <Text className="text-[10px] mt-2 uppercase tracking-widest text-slate-400 font-bold">
                    Status: {item.status}
                  </Text>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100">
              <Title className="text-lg font-bold mb-4">Ticket Médio p/ Canal</Title>
              <Flex className="mb-4">
                <Text>Loja Física</Text>
                <Text className="font-bold">R$ 78,50</Text>
              </Flex>
              <Flex className="mb-4">
                <Text>Delivery App</Text>
                <Text className="font-bold text-emerald-600">R$ 92,10</Text>
              </Flex>
            </div>
          </Card>
        </Col>
      </Grid>

      {/* PRINT-ONLY STYLES (Modern PDF Mockup) */}
      <style>{`
        @media print {
          body { background: white; }
          .p-10 { padding: 0; }
          button { display: none; }
          .shadow-xl { box-shadow: none; border: 1px solid #e2e8f0; }
          .bg-slate-50 { background: white; }
        }
      `}</style>
    </div>
  );
};

export default Reports;
