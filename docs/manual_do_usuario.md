# 📖 Manual do Usuário
## Sistema SOLUÇÃO — Gestão Completa de Varejo
### Versão 1.0 | Maio/2026

---

> [!IMPORTANT]
> **Como abrir o sistema:** Acesse a pasta `Sistema de Varejo teste` e abra o arquivo **`index.html`** com qualquer navegador (Chrome, Edge, Firefox).

---

## 🔐 1. Login — Acesso ao Sistema

### Como fazer login

1. Abra o arquivo `index.html` no navegador
2. Preencha os campos:

| Campo | Valor |
|-------|-------|
| **E-mail** | `admin@solucao.com` |
| **Senha** | `123456` |

3. Clique em **"🚀 Entrar no Sistema"**

### Acesso rápido (demonstração)
- Clique no botão **"⚡ Acesso Demonstração Rápida"** para entrar sem digitar credenciais — ideal para testes.

### Recursos da tela de login
- 👁️ **Mostrar/ocultar senha:** Clique no ícone de olho no campo de senha
- ☑️ **Lembrar acesso:** Marque para manter o login salvo
- 🔗 **Esqueceu a senha?** Link disponível para recuperação futura

---

## 📊 2. Dashboard — Visão Geral do Negócio

O Dashboard é a **tela principal** do sistema. Ao fazer login, você verá automaticamente:

### KPIs (Indicadores-Chave)
| Card | O que mostra |
|------|-------------|
| 💰 **Vendas Hoje** | Faturamento total do dia + variação vs. dia anterior |
| 🛍️ **Vendas Realizadas** | Número de transações do dia |
| 🎯 **Ticket Médio** | Valor médio por venda |
| 📦 **Estoque Crítico** | Qtd. de produtos abaixo do nível mínimo |
| 🚴 **Pedidos Ativos** | Pedidos de delivery em andamento |

### Meta do Dia
- Barra de progresso colorida mostrando % da meta atingida
- Configure a meta em **Configurações → Empresa**

### Gráficos
- **📈 Barras:** Vendas dos últimos 7 dias
- **🍩 Donut:** Vendas distribuídas por categoria de produto

### Alertas Inteligentes
- ⚠️ Aviso automático de estoque crítico
- 💸 Contas a pagar pendentes
- 🚴 Pedidos de delivery aguardando

### Atividade Recente
- Feed com as últimas 5 ações realizadas no sistema

### Botão Rápido
- **"🛒 Abrir Caixa"** → Acessa o PDV diretamente

---

## 🛒 3. PDV — Ponto de Venda (Caixa)

O PDV é o **coração do sistema**. Use para registrar todas as vendas.

### Como realizar uma venda

**Passo 1 — Adicionar produtos**
- Clique no card do produto para adicionar ao carrinho
- Use a **barra de busca** para localizar por nome ou código de barras
- Filtre por **categoria** no seletor à direita da busca

> [!TIP]
> **Atalho de leitor de barras:** Comece a digitar qualquer coisa fora de um campo e o cursor vai automaticamente para a busca. Simula um leitor de código de barras!

**Passo 2 — Ajustar carrinho**
- ➕ / ➖ Aumentar ou diminuir quantidade
- 🗑️ Remover item individualmente
- **Desconto (%):** Digite um percentual para desconto no total
- O sistema calcula automaticamente: Subtotal → Desconto → Total

**Passo 3 — Selecionar pagamento**
| Forma | Ação extra |
|-------|-----------|
| 💵 Dinheiro | Informe o valor recebido → Troco calculado automaticamente |
| 📱 Pix | Finalize normalmente |
| 💳 Débito | Finalize normalmente |
| 💳 Crédito | Finalize normalmente |

**Passo 4 — Cliente (opcional)**
- Clique em **"👤 Cliente"** para vincular a venda a um cliente cadastrado
- Os **pontos de fidelidade** são acumulados automaticamente (1 ponto a cada R$ 10)

**Passo 5 — Finalizar**
- Clique em **"✅ Finalizar Venda"**
- O sistema gera um **cupom da venda** automaticamente
- O estoque é atualizado automaticamente
- Use **"🖨️ Imprimir"** para imprimir o cupom

> [!NOTE]
> O carrinho é **limpo automaticamente** após finalizar a venda. Para começar uma nova venda, basta adicionar produtos novamente.

---

## 📦 4. Estoque — Controle de Produtos

### Visualização
- Tabela com todos os produtos cadastrados
- **Paginação** de 10 itens por página
- **Indicador de status** por cor: 🟢 OK | 🟡 Baixo | 🔴 Crítico

### Filtros disponíveis
- 🔍 **Busca** por nome ou código de barras
- 📁 **Categoria** (Mercearia, Laticínios, Bebidas etc.)
- ⚠️ **Status** (Estoque Crítico / Baixo / OK)

### Como cadastrar um produto
1. Clique em **"➕ Novo Produto"**
2. Preencha: Nome, Código de Barras, Categoria, Unidade (un/kg/pc), Emoji, Preço de Custo, Preço de Venda, Estoque Atual, Estoque Mínimo
3. O sistema mostra a **margem de lucro em tempo real** enquanto você digita
4. Clique **"💾 Salvar Produto"**

### Como movimentar estoque
1. Clique no ícone 📦 na linha do produto
2. Escolha o tipo: **Entrada** (compra/reposição) ou **Saída** (ajuste/perda)
3. Informe a quantidade e uma observação
4. Clique **"✅ Confirmar"**

### Exportar CSV
- Clique em **"📥 Exportar CSV"** para baixar a lista completa em Excel

---

## 👥 5. Clientes — Programa de Fidelidade

### Visualização
- Cards com avatar (iniciais), status, pontos e total gasto
- **Níveis de fidelidade:**
  - 🥉 **Bronze:** 0 a 499 pontos
  - 🥈 **Silver:** 500 a 999 pontos
  - 🥇 **Gold:** 1.000+ pontos

### Como cadastrar um cliente
1. Clique em **"➕ Novo Cliente"**
2. Preencha: Nome, CPF, Telefone, E-mail, Endereço
3. Defina os pontos iniciais (normalmente 0) e o status (Ativo/Inativo)
4. Clique **"💾 Salvar"**

### Abas de filtro
- **Todos** → Todos os clientes
- **Ativos** → Apenas clientes ativos
- **Inativos** → Clientes inativos
- **⭐ VIP** → Clientes com 500+ pontos

### Pontos acumulados
- Os pontos sobem automaticamente quando uma venda é vinculada ao cliente no PDV
- 1 ponto a cada R$ 10,00 em compras

---

## 🏭 6. Fornecedores

### Como cadastrar um fornecedor
1. Clique em **"➕ Novo Fornecedor"**
2. Preencha: Razão Social, CNPJ, Contato, Telefone, E-mail, Categoria, Status
3. Clique **"💾 Salvar"**

### Ações disponíveis
- ✏️ **Editar** informações do fornecedor
- ✉️ **Enviar e-mail** direto pelo cliente de e-mail padrão
- 🗑️ **Excluir** fornecedor

---

## 💰 7. Financeiro — Meu Lucro

### Resumo financeiro (4 cards)
| Card | Descrição |
|------|-----------|
| 📈 **Total Receitas** | Soma de todas as receitas pagas |
| 📉 **Total Despesas** | Soma de todas as despesas pagas |
| ⏳ **A Pagar** | Despesas com status "Pendente" |
| ✅ **Resultado Líquido** | Receitas − Despesas (lucro real) |

### Painel "Meu Lucro"
- 💰 **Lucro Líquido** do período
- 📊 **Margem Média** de todos os produtos
- 📦 **Valor em Estoque** (a preço de venda)
- 🎯 **ROI** — Retorno sobre o Investimento

### Como lançar uma receita
1. Clique em **"➕ Nova Receita"**
2. Preencha: Descrição, Valor, Data, Categoria, Status (Pago/Pendente)
3. Clique **"💾 Salvar"**

### Como lançar uma despesa
1. Clique em **"➖ Nova Despesa"**
2. Preencha os mesmos campos
3. Clique **"💾 Salvar"**

> [!TIP]
> Use o filtro por **"Pendentes"** para ver todas as contas a pagar em aberto!

---

## 🏷️ 8. Promoções

### Como criar uma promoção
1. Clique em **"➕ Nova Promoção"**
2. Preencha:
   - **Nome:** Ex: "Semana do Café"
   - **Desconto %:** Ex: 15
   - **Tipo:** Produto / Categoria / Fidelidade
   - **Alvo:** Nome do produto ou categoria
   - **Datas:** Início e fim da promoção
   - **Status:** Ativa ou Inativa
3. Clique **"💾 Salvar"**

### Gerenciar promoções
- ⏸️ **Pausar** → Desativa temporariamente sem excluir
- ▶️ **Ativar** → Reativa uma promoção pausada
- 🗑️ **Excluir** → Remove permanentemente

### Estatísticas por promoção
- 🛒 Número de vendas geradas
- 💸 Economia total proporcionada aos clientes

---

## 🚴 9. Delivery — Painel de Pedidos

### Kanban Board (4 colunas)
```
⏳ Pendentes → 👨‍🍳 Preparando → 🚴 Em Rota → ✅ Entregues
```

### Como criar um pedido
1. Clique em **"➕ Novo Pedido"**
2. Preencha: Cliente, Telefone, Endereço, Itens, Total, Pagamento
3. Clique **"🚴 Criar Pedido"**
4. O pedido aparece na coluna "Pendentes" e o cliente é notificado (simulado)

### Avançar um pedido
- Clique no botão **"➡️ [Próxima Etapa]"** no card do pedido
- O sistema envia automaticamente uma notificação WhatsApp ao avançar para "Em Rota"

### Notificações em massa
- Clique em **"📱 Notificar WhatsApp"** para enviar mensagem a todos os pedidos ativos de uma vez

### Integrações disponíveis
- 🛵 **iFood Mercado** → Ampliar alcance das vendas
- 📱 **WhatsApp Business** → Notificações automáticas de status
- 🚴 **Motoboy App** → Gestão de entregadores

---

## 📊 10. Relatórios

### Filtro de período
Selecione o período desejado: **7 dias | 15 dias | 30 dias**

### O que os relatórios mostram
- 📈 Gráfico de linha com evolução de vendas
- 📦 Top 5 produtos mais vendidos (barras horizontais)
- 🥇 Ranking dos melhores clientes com barra de progresso
- 📁 Desempenho por categoria com percentual
- 📋 Tabela detalhada dia a dia com variação %

### Exportar relatório
- Clique em **"📥 Exportar PDF"**
- O arquivo é gerado e salvo automaticamente

---

## ⚙️ 11. Configurações

### Aba 🏢 Empresa
Configure os dados da empresa que aparecem em todo o sistema:
- Nome da empresa, CNPJ, telefone, e-mail, endereço
- **Meta de vendas diária** (usada na barra de progresso do Dashboard)

### Aba 📋 Fiscal
- Selecione o regime tributário (Simples Nacional, Lucro Presumido, MEI etc.)
- Sincronize com o **Mix Fiscal** para regras tributárias atualizadas
- Configure NFe e SAT

### Aba 👤 Usuário
- Altere nome, cargo e as iniciais do avatar
- Redefina sua senha

### Aba 🔗 Integrações
- Gerencie as conexões com iFood, WhatsApp Business, Scantech e Mix Fiscal

### Aba ⚙️ Sistema
- Ative/desative alertas de estoque
- Ative/desative notificações automáticas
- Ative/desative a SOLUÇÃO IA
- **💾 Fazer Backup** dos dados
- **🗑️ Resetar Dados Demo** → Volta o sistema ao estado inicial

> [!CAUTION]
> O reset apaga **todos** os dados e volta para os dados de demonstração. Use somente se necessário!

---

## 🤖 12. SOLUÇÃO IA — Assistente Inteligente

### Como usar
1. Acesse **"🤖 SOLUÇÃO IA"** na barra lateral
2. Use os **atalhos rápidos** no painel esquerdo OU
3. Digite sua pergunta no campo de texto e pressione Enter ou clique em ➤

### Exemplos de perguntas que a IA responde

**Estoque:**
- *"Como está meu estoque hoje?"*
- *"Quais produtos estão com estoque crítico?"*
- *"Quais produtos devo repor esta semana?"*

**Vendas:**
- *"Qual foi o faturamento desta semana?"*
- *"Compare meu desempenho com a semana passada"*
- *"Quais são os produtos mais vendidos?"*

**Finanças:**
- *"Qual é minha margem de lucro média?"*
- *"Tenho contas a pagar pendentes?"*
- *"Me dê a análise completa do mês"*

**Clientes e Promoções:**
- *"Quais clientes compraram mais?"*
- *"Quais promoções estão ativas agora?"*
- *"Me dê sugestões para aumentar as vendas"*

**Delivery:**
- *"Quantos pedidos de delivery estão em andamento?"*

> [!NOTE]
> A IA analisa os dados **reais do sistema** em tempo real — cada resposta é baseada nos produtos, clientes, vendas e transações que você tem cadastrado.

---

## ⌨️ Atalhos e Dicas Úteis

| Atalho | Ação |
|--------|------|
| `ESC` | Fecha qualquer modal aberto |
| Digitar no PDV | Foca automaticamente na busca de produtos |
| `Enter` no chat da IA | Envia a mensagem |
| Clicar fora do modal | Fecha o modal |

### Dicas para melhores resultados
1. **Configure a meta diária** em Configurações para ver o progresso no Dashboard
2. **Vincule clientes às vendas** no PDV para acumular pontos de fidelidade
3. **Use a IA** pela manhã para ter um resumo rápido do negócio
4. **Monitore o Dashboard** diariamente — os alertas aparecem automaticamente
5. **Exporte o CSV de estoque** semanalmente para backup externo
6. **Crie promoções** para categorias com estoque alto — a IA vai sugerir quando necessário

---

## ❓ FAQ — Perguntas Frequentes

**Q: Os dados são salvos se eu fechar o navegador?**
A: Sim! Os dados ficam salvos no LocalStorage do navegador automaticamente.

**Q: Posso acessar em outro computador?**
A: Não na versão atual. O LocalStorage é específico do navegador/dispositivo.

**Q: Como faço backup dos dados?**
A: Vá em Configurações → Sistema → "💾 Fazer Backup".

**Q: A IA usa internet?**
A: Não! A IA do SOLUÇÃO analisa apenas os dados locais do sistema, sem enviar nada para a internet.

**Q: O que acontece se o estoque chegar a zero?**
A: O produto aparece como "Zerado" em vermelho no estoque e não pode ser adicionado ao carrinho do PDV.

**Q: Como alterar o nome da empresa no sistema?**
A: Vá em Configurações → Empresa → altere o campo "Nome da Empresa" → clique "Salvar Alterações".

**Q: Como resetar o sistema para testar?**
A: Vá em Configurações → Sistema → clique "🗑️ Resetar Dados Demo". **Atenção:** isso apaga todos os dados!

---

## 📞 Suporte

Para dúvidas ou sugestões de melhorias no sistema **SOLUÇÃO**, entre em contato com o desenvolvedor.

---

*© 2026 SOLUÇÃO — Sistema de Gestão de Varejo | Todos os direitos reservados*
