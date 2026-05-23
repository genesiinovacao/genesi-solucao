# Manual de Migração e Desenvolvimento - SOLUÇÃO 2026

Este documento serve como guia técnico para a equipe de desenvolvimento implementar e manter a nova arquitetura do sistema de varejo.

## 1. Visão Geral da Arquitetura
O sistema mudou de uma aplicação HTML/JS simples para uma arquitetura **Híbrida Multi-tenant**:
- **Backend**: .NET 8/9 Web API (Centralizado).
- **Frontend Admin**: React + Tailwind + Tremor.
- **PDV Desktop**: Electron + React + SQLite (Offline-first).
- **Banco de Dados**: PostgreSQL com Row Level Security (RLS).

## 2. Configuração do Banco de Dados (PostgreSQL)
A segurança dos 100 clientes é garantida pelo **RLS**.
1. Execute o script em `database/schema.sql`.
2. Para cada conexão, o backend define a variável de sessão:
   ```sql
   SET app.current_tenant_id = 'id-do-cliente-aqui';
   ```
3. O PostgreSQL filtrará automaticamente os dados. Nunca remova as políticas de RLS sem revisão de segurança.

## 3. Fluxo de Sincronização (Offline-First)
O PDV Desktop deve ser a "fonte da verdade" local.
- **Vendas**: São salvas no SQLite local com `synced: false`.
- **SyncService**: O serviço monitora o evento `online`. Ao detectar internet, envia o lote de vendas pendentes para `/api/sync/sales`.
- **Idempotência**: Sempre use o `OfflineSyncId` (UUID) gerado no PDV para evitar duplicidade de vendas no servidor central.

## 4. Desenvolvimento do Frontend (Dashboard)
Utilizamos a biblioteca **Tremor** para os componentes de BI.
- **Estilos**: Todos os componentes seguem o Tailwind CSS.
- **Gráficos**: Use os componentes `AreaChart`, `BarChart` e `DonutChart` para manter o padrão visual de 2026.
- **Impressão**: O arquivo `PrintTemplate.css` contém os estilos necessários para que os relatórios virem PDFs profissionais ao clicar em imprimir.

## 5. Implementação da IA de Estoque
A lógica de IA reside em analisar o `avgSales` (média de vendas) e projetar o `daysRemaining`.
- **Fórmula de Predição**: `Estoque Atual / Média de Vendas Diárias (Janela de 30 dias)`.
- **Ação**: O sistema deve disparar notificações via SignalR para o Dashboard quando o `daysRemaining` for menor ou igual a 3.

## 6. Comandos Úteis
### Backend
```bash
dotnet build
dotnet run
```
### Dashboard/PDV
```bash
npm install
npm run dev
```

## 7. Segurança (LGPD)
- Todas as comunicações devem usar **TLS 1.3**.
- O `TenantId` nunca deve ser exposto na URL, apenas via Claims de JWT ou Headers seguros.
