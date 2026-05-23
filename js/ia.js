// SOLUÇÃO IA — Assistente Inteligente com dados reais do sistema
const RESPOSTAS_IA = {
  estoque(q){
    const produtos=DataService.getProdutos();
    const criticos=produtos.filter(p=>p.estoque<=p.estoque_min);
    const zerados=produtos.filter(p=>p.estoque===0);
    const totalItens=produtos.reduce((s,p)=>s+p.estoque,0);
    const valorTotal=produtos.reduce((s,p)=>s+p.estoque*p.preco_custo,0);
    if(q.includes('crítico')||q.includes('critico')||q.includes('alerta')){
      if(!criticos.length)return '✅ Ótimas notícias! Nenhum produto está com estoque crítico no momento. Seu estoque está bem gerenciado!';
      return `⚠️ **${criticos.length} produto(s) com estoque crítico:**\n\n${criticos.map(p=>`• ${p.emoji} **${p.nome}**: ${p.estoque} ${p.unidade} (mínimo: ${p.estoque_min})`).join('\n')}\n\n💡 **Recomendação:** Faça pedidos de reposição urgente para esses itens, especialmente ${criticos[0]?.nome}.`;
    }
    if(q.includes('reposição')||q.includes('repor')){
      const reposicao=produtos.filter(p=>p.estoque<=p.estoque_min*2).slice(0,5);
      return `🔄 **Sugestão de Reposição para esta semana:**\n\n${reposicao.map(p=>`• ${p.emoji} **${p.nome}**: estoque atual ${p.estoque}, pedir ~${p.estoque_min*3} ${p.unidade}`).join('\n')}\n\n📦 Total de ${reposicao.length} produtos precisam de atenção.`;
    }
    return `📦 **Status do Estoque:**\n\n• Total de produtos cadastrados: **${produtos.length}**\n• Unidades em estoque: **${totalItens.toLocaleString('pt-BR')}**\n• Valor em estoque (custo): **${formatMoeda(valorTotal)}**\n• Produtos com alerta: **${criticos.length}**\n• Produtos zerados: **${zerados.length}**\n\n${criticos.length>0?`⚠️ Atenção especial para: ${criticos.map(p=>p.nome).join(', ')}`:'✅ Estoque em boas condições geral!'}`;
  },

  vendas(q){
    const vendas=DataService.getVendasHistorico();
    const semana=vendas.slice(-7);
    const mes=vendas.slice(-30);
    const totalSemana=semana.reduce((s,v)=>s+v.total,0);
    const totalMes=mes.reduce((s,v)=>s+v.total,0);
    const ticketMedio=totalSemana/(semana.reduce((s,v)=>s+v.qtd_vendas,0)||1);
    const melhorDia=semana.reduce((m,v)=>v.total>m.total?v:m,semana[0]);
    if(q.includes('semana')){
      return `📈 **Faturamento da Semana:**\n\n• Total: **${formatMoeda(totalSemana)}**\n• Ticket médio: **${formatMoeda(ticketMedio)}**\n• Melhor dia: **${formatData(melhorDia?.data)} — ${formatMoeda(melhorDia?.total)}**\n• Média diária: **${formatMoeda(totalSemana/7)}**\n\n💡 ${totalSemana>20000?'📈 Semana excelente! Continue assim!':'📊 Há oportunidade de crescimento. Considere ativar promoções.'}`;
    }
    if(q.includes('comparar')||q.includes('compare')||q.includes('comparativo')){
      const semanaAtual=vendas.slice(-7).reduce((s,v)=>s+v.total,0);
      const semanaAnterior=vendas.slice(-14,-7).reduce((s,v)=>s+v.total,0);
      const variacao=semanaAnterior>0?((semanaAtual-semanaAnterior)/semanaAnterior*100):0;
      return `⚖️ **Comparativo Semanal:**\n\n• Semana atual: **${formatMoeda(semanaAtual)}**\n• Semana anterior: **${formatMoeda(semanaAnterior)}**\n• Variação: **${variacao>=0?'▲':'▼'} ${Math.abs(variacao).toFixed(1)}%**\n\n${variacao>=0?'🎉 Performance positiva! Continue com as estratégias atuais.':'⚠️ Queda detectada. Considere ativar promoções ou campanhas de fidelidade.'}`;
    }
    return `💰 **Resumo de Vendas:**\n\n• Últimos 7 dias: **${formatMoeda(totalSemana)}**\n• Últimos 30 dias: **${formatMoeda(totalMes)}**\n• Ticket médio semanal: **${formatMoeda(ticketMedio)}**\n• Projeção mensal: **${formatMoeda(totalSemana/7*30)}**`;
  },

  financeiro(q){
    const trans=DataService.getTransacoes();
    const receitas=trans.filter(t=>t.tipo==='receita'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
    const despesas=trans.filter(t=>t.tipo==='despesa'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
    const pendentes=trans.filter(t=>t.status==='pendente'&&t.tipo==='despesa');
    const lucro=receitas-despesas;
    if(q.includes('pendente')||q.includes('pagar')){
      if(!pendentes.length)return '✅ Ótimo! Não há contas pendentes no momento. Suas finanças estão em dia!';
      return `💸 **Contas Pendentes:**\n\n${pendentes.map(t=>`• **${t.descricao}**: ${formatMoeda(t.valor)} — vence em ${formatData(t.data)}`).join('\n')}\n\n💰 Total a pagar: **${formatMoeda(pendentes.reduce((s,t)=>s+t.valor,0))}**\n\n⚠️ Planeje os pagamentos para evitar inadimplência.`;
    }
    if(q.includes('lucro')||q.includes('margem')){
      const produtos=DataService.getProdutos();
      const margemMedia=produtos.reduce((s,p)=>s+((p.preco_venda-p.preco_custo)/p.preco_venda*100),0)/produtos.length;
      return `📊 **Análise de Lucro:**\n\n• Receitas totais: **${formatMoeda(receitas)}**\n• Despesas totais: **${formatMoeda(despesas)}**\n• Lucro líquido: **${formatMoeda(lucro)}**\n• Margem média de produtos: **${margemMedia.toFixed(1)}%**\n• ROI do período: **${receitas>0?((lucro/receitas)*100).toFixed(1):0}%**\n\n${lucro>0?'💚 Negócio lucrativo! Continue monitorando as despesas.':'❌ Atenção! Resultado negativo. Revise suas despesas urgentemente.'}`;
    }
    return `💰 **Situação Financeira:**\n\n• Receitas: **${formatMoeda(receitas)}**\n• Despesas: **${formatMoeda(despesas)}**\n• Resultado: **${formatMoeda(lucro)}**\n• Contas pendentes: **${pendentes.length}**\n\n${lucro>=0?'✅ Finanças positivas!':'⚠️ Revise suas despesas!'}`;
  },

  clientes(q){
    const lista=DataService.getClientes();
    const ativos=lista.filter(c=>c.status==='ativo');
    const vip=lista.filter(c=>c.pontos>=500);
    const topCliente=lista.sort((a,b)=>b.total_compras-a.total_compras)[0];
    if(q.includes('top')||q.includes('mais')){
      const top5=lista.sort((a,b)=>b.total_compras-a.total_compras).slice(0,5);
      return `👥 **Top 5 Clientes:**\n\n${top5.map((c,i)=>`${i+1}. **${c.nome}** — ${formatMoeda(c.total_compras)} (${c.pontos} pts)`).join('\n')}\n\n💡 **Dica:** Ofereça benefícios especiais para seus top clientes para fidelizá-los ainda mais!`;
    }
    return `👥 **Resumo de Clientes:**\n\n• Total de clientes: **${lista.length}**\n• Clientes ativos: **${ativos.length}**\n• Clientes VIP (+500 pts): **${vip.length}**\n• Melhor cliente: **${topCliente?.nome}** (${formatMoeda(topCliente?.total_compras||0)})\n\n💡 Programa de fidelidade ativo com ${lista.reduce((s,c)=>s+c.pontos,0).toLocaleString('pt-BR')} pontos distribuídos!`;
  },

  promocoes(q){
    const lista=DataService.getPromocoes();
    const ativas=lista.filter(p=>p.ativo);
    return `🏷️ **Promoções Ativas (${ativas.length}):**\n\n${ativas.map(p=>`• **${p.nome}**: ${p.desconto}% de desconto em ${p.alvo}\n  📅 Válido até ${formatData(p.fim)} | 🛒 ${p.vendas} vendas`).join('\n\n')}\n\n📈 Total de economia gerada aos clientes: ${formatMoeda(lista.reduce((s,p)=>s+p.economia_cliente,0))}`;
  },

  delivery(q){
    const pedidos=DataService.getPedidos();
    const ativos=pedidos.filter(p=>p.status!=='entregue');
    const pendentes=pedidos.filter(p=>p.status==='pendente');
    return `🚴 **Status Delivery:**\n\n• Pedidos ativos: **${ativos.length}**\n• Aguardando: **${pendentes.length}**\n• Entregues hoje: **${pedidos.filter(p=>p.status==='entregue').length}**\n• Faturamento delivery: **${formatMoeda(pedidos.reduce((s,p)=>s+p.total,0))}**\n\n${pendentes.length>0?`⏳ ${pendentes.length} pedido(s) aguardando preparo!`:'✅ Todos os pedidos estão em andamento!'}`;
  },

  sugestoes(q){
    const kpis=DataService.getDashboardKPIs();
    const produtos=DataService.getProdutos();
    const criticos=produtos.filter(p=>p.estoque<=p.estoque_min);
    const sugestoes=[];
    if(criticos.length>0)sugestoes.push(`📦 Repor ${criticos.length} produto(s) com estoque crítico urgentemente`);
    if(kpis.meta_percentual<80)sugestoes.push(`🎯 Você está em ${kpis.meta_percentual}% da meta. Ative promoções para acelerar vendas`);
    const promos=DataService.getPromocoes().filter(p=>p.ativo).length;
    if(promos===0)sugestoes.push(`🏷️ Nenhuma promoção ativa. Crie uma promoção para atrair mais clientes`);
    sugestoes.push(`💡 Ofereça cupons de desconto aos clientes VIP para aumentar recorrência`);
    sugestoes.push(`📱 Configure o WhatsApp Business para notificações automáticas de delivery`);
    sugestoes.push(`🤖 Use a análise de IA regularmente para identificar tendências`);
    return `💡 **Sugestões para Aumentar Vendas:**\n\n${sugestoes.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\n🚀 Implementando essas ações, você pode aumentar o faturamento em até 30%!`;
  },

  analise(q){
    const kpis=DataService.getDashboardKPIs();
    const vendas=DataService.getVendasHistorico().slice(-30);
    const totalMes=vendas.reduce((s,v)=>s+v.total,0);
    const trans=DataService.getTransacoes();
    const despesas=trans.filter(t=>t.tipo==='despesa'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
    const lucroMes=totalMes-despesas;
    return `📈 **Análise Completa do Mês:**\n\n**📊 Vendas:**\n• Faturamento: ${formatMoeda(totalMes)}\n• Média diária: ${formatMoeda(totalMes/30)}\n• Meta do dia: ${kpis.meta_percentual}% atingida\n\n**💰 Financeiro:**\n• Despesas: ${formatMoeda(despesas)}\n• Lucro estimado: ${formatMoeda(lucroMes)}\n• ROI: ${totalMes>0?((lucroMes/totalMes)*100).toFixed(1):0}%\n\n**📦 Estoque:**\n• ${kpis.estoque_critico} produto(s) com alerta\n\n**🚴 Delivery:**\n• ${kpis.pedidos_ativos} pedido(s) ativos\n\n${lucroMes>0?'✅ **Mês positivo!** Continue com a boa gestão.':'⚠️ **Atenção!** Revise despesas para melhorar resultado.'}`;
  }
};

function processarMensagem(msg){
  const q=msg.toLowerCase();
  if(q.includes('estoque')||q.includes('produto')||q.includes('reposi'))return RESPOSTAS_IA.estoque(q);
  if(q.includes('venda')||q.includes('faturamento')||q.includes('semana')||q.includes('comparar')||q.includes('comparativo'))return RESPOSTAS_IA.vendas(q);
  if(q.includes('financeiro')||q.includes('lucro')||q.includes('margem')||q.includes('pagar')||q.includes('pendente')||q.includes('despesa'))return RESPOSTAS_IA.financeiro(q);
  if(q.includes('cliente')||q.includes('fidelidade'))return RESPOSTAS_IA.clientes(q);
  if(q.includes('promoç')||q.includes('desconto'))return RESPOSTAS_IA.promocoes(q);
  if(q.includes('delivery')||q.includes('pedido')||q.includes('entrega'))return RESPOSTAS_IA.delivery(q);
  if(q.includes('sugestão')||q.includes('sugest')||q.includes('aumentar')||q.includes('melhorar'))return RESPOSTAS_IA.sugestoes(q);
  if(q.includes('análise')||q.includes('analise')||q.includes('desempenho')||q.includes('mês'))return RESPOSTAS_IA.analise(q);
  return `🤖 Entendi sua pergunta! Posso ajudá-lo com:\n\n• 📦 **Estoque** — status, alertas, reposição\n• 💰 **Vendas** — faturamento, ticket médio, tendências\n• 📊 **Financeiro** — lucro, margem, contas\n• 👥 **Clientes** — top clientes, fidelidade\n• 🏷️ **Promoções** — promoções ativas\n• 🚴 **Delivery** — pedidos em andamento\n• 💡 **Sugestões** — estratégias para crescer\n\nSe preferir, use os atalhos no painel esquerdo! 😊`;
}

function addBubble(text,type){
  const container=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className=`chat-bubble ${type} animate-in`;
  div.innerHTML=text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

function addTyping(){
  const container=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className='chat-bubble ai';div.id='typing-indicator';
  div.innerHTML='<span style="display:flex;gap:4px;align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-primary);animation:pulse 1s infinite"></span><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-primary);animation:pulse 1s infinite .2s"></span><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-primary);animation:pulse 1s infinite .4s"></span></span>';
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

function removeTyping(){document.getElementById('typing-indicator')?.remove();}

function sendMessage(){
  const input=document.getElementById('chat-input');
  const msg=input.value.trim();
  if(!msg)return;
  addBubble(msg,'user');
  input.value='';
  document.getElementById('btn-send').disabled=true;
  addTyping();
  const delay=800+Math.random()*700;
  setTimeout(()=>{
    removeTyping();
    const resposta=processarMensagem(msg);
    addBubble(resposta,'ai');
    document.getElementById('btn-send').disabled=false;
    input.focus();
  },delay);
}

function quickAsk(msg){
  document.getElementById('chat-input').value=msg;
  sendMessage();
}

function limparChat(){
  const container=document.getElementById('chat-messages');
  container.innerHTML='<div style="text-align:center;padding:30px 20px"><div style="font-size:3rem;margin-bottom:12px">🤖</div><div style="font-size:1.2rem;font-weight:700;margin-bottom:8px">Conversa reiniciada!</div><div style="font-size:.875rem;color:var(--text-secondary)">Como posso ajudar você hoje?</div></div>';
  APP.toast('Conversa limpa!','info');
}

document.addEventListener('DOMContentLoaded',()=>{
  setTimeout(()=>{
    addBubble('👋 Olá! Bem-vindo ao **SOLUÇÃO IA**! Sou seu assistente inteligente de varejo.\n\nEstou conectado aos dados do seu negócio e posso analisar estoque, vendas, finanças e muito mais em tempo real.\n\nO que você gostaria de saber hoje?','ai');
  },500);
});
