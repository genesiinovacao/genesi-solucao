// Delivery Logic
const STATUS_ORDER=['pendente','preparando','em_rota','entregue'];
const STATUS_LABELS={pendente:'⏳ Pendente',preparando:'👨‍🍳 Preparando',em_rota:'🚴 Em Rota',entregue:'✅ Entregue'};
const STATUS_NEXT={pendente:'preparando',preparando:'em_rota',em_rota:'entregue'};
const STATUS_BADGE={pendente:'warning',preparando:'info',em_rota:'primary',entregue:'success'};

function initDelivery(){renderKPIsDelivery();renderKanban();}

function renderKPIsDelivery(){
  const pedidos=DataService.getPedidos();
  const total=pedidos.reduce((s,p)=>s+p.total,0);
  const entregues=pedidos.filter(p=>p.status==='entregue').length;
  const ativos=pedidos.filter(p=>p.status!=='entregue').length;
  const pendentes=pedidos.filter(p=>p.status==='pendente').length;
  document.getElementById('delivery-kpis').innerHTML=`
    <div class="kpi-card"><div class="kpi-icon">📦</div><div class="kpi-value">${pedidos.length}</div><div class="kpi-label">Total Pedidos</div></div>
    <div class="kpi-card warning"><div class="kpi-icon">⏳</div><div class="kpi-value">${pendentes}</div><div class="kpi-label">Aguardando</div></div>
    <div class="kpi-card info"><div class="kpi-icon">🚴</div><div class="kpi-value">${ativos}</div><div class="kpi-label">Em Andamento</div></div>
    <div class="kpi-card success"><div class="kpi-icon">✅</div><div class="kpi-value">${entregues}</div><div class="kpi-label">Entregues</div></div>
    <div class="kpi-card"><div class="kpi-icon">💰</div><div class="kpi-value">${formatMoeda(total)}</div><div class="kpi-label">Faturamento</div></div>
  `;
}

function renderKanban(){
  const pedidos=DataService.getPedidos();
  STATUS_ORDER.forEach(status=>{
    const col=document.getElementById('col-'+status);
    const cnt=document.getElementById('cnt-'+status);
    const lista=pedidos.filter(p=>p.status===status);
    if(cnt)cnt.textContent=lista.length;
    if(!col)return;
    if(!lista.length){col.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.8rem">Nenhum pedido</div>';return;}
    col.innerHTML=lista.map(p=>`
      <div class="delivery-card" style="margin-bottom:12px">
        <div class="delivery-header">
          <span class="delivery-id">${p.id}</span>
          <span class="badge badge-${STATUS_BADGE[p.status]}">${STATUS_LABELS[p.status]}</span>
        </div>
        <div class="delivery-customer">${p.cliente}</div>
        <div class="delivery-address">📍 ${p.endereco}</div>
        <div style="font-size:.75rem;color:var(--text-secondary);margin-top:6px">🕐 ${p.horario} • 💳 ${p.pagamento}</div>
        <div style="font-size:.78rem;margin-top:6px;color:var(--text-muted)">${Array.isArray(p.itens)?p.itens.join(', '):'...'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
          <strong style="color:var(--accent-primary)">${formatMoeda(p.total)}</strong>
          <div style="display:flex;gap:6px">
            ${status!=='entregue'?`<button class="btn btn-sm btn-primary" onclick="avancarPedido('${p.id}')">➡️ ${STATUS_LABELS[STATUS_NEXT[status]]||''}</button>`:''}
            <button class="btn-icon" onclick="notificarCliente('${p.cliente}')" title="WhatsApp">📱</button>
          </div>
        </div>
      </div>`).join('');
  });
}

function avancarPedido(id){
  const p=DataService.getPedidos().find(x=>x.id===id);
  if(!p||!STATUS_NEXT[p.status])return;
  const novoStatus=STATUS_NEXT[p.status];
  DataService.updatePedido(id,{status:novoStatus});
  APP.toast(`Pedido ${id} → ${STATUS_LABELS[novoStatus]}!`,'success');
  renderKPIsDelivery();renderKanban();
  if(novoStatus==='em_rota')notificarCliente(p.cliente);
}

function notificarCliente(nome){
  APP.toast(`📱 WhatsApp enviado para ${nome}! "Seu pedido está a caminho! 🚴"`,'info');
}

function simularWhatsApp(){
  const pedidos=DataService.getPedidos().filter(p=>p.status!=='entregue');
  if(!pedidos.length){APP.toast('Nenhum pedido ativo para notificar!','warning');return;}
  pedidos.forEach((p,i)=>{setTimeout(()=>{APP.toast(`📱 Notificação enviada para ${p.cliente}!`,'info');},i*800);});
}

function novoPedido(){
  ['d-cliente','d-telefone','d-endereco','d-itens','d-total'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  APP.openModal('modal-pedido');
}

function criarPedido(){
  const cliente=document.getElementById('d-cliente').value.trim();
  const endereco=document.getElementById('d-endereco').value.trim();
  const total=parseFloat(document.getElementById('d-total').value);
  if(!cliente||!endereco||!total){APP.toast('Preencha os campos obrigatórios!','error');return;}
  const itens=document.getElementById('d-itens').value.split(',').map(s=>s.trim()).filter(Boolean);
  const pedidos=DataService.getPedidos();
  const novoId='#DEL'+String(pedidos.length+1).padStart(3,'0');
  pedidos.push({id:novoId,cliente,endereco,itens,total,status:'pendente',horario:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),pagamento:document.getElementById('d-pagamento').value});
  DB.set('pedidos_delivery',pedidos);
  APP.closeModal('modal-pedido');
  APP.toast(`Pedido ${novoId} criado!`,'success');
  renderKPIsDelivery();renderKanban();
  notificarCliente(cliente);
}

document.addEventListener('DOMContentLoaded',initDelivery);
// Auto-refresh kanban every 30s
setInterval(()=>{renderKanban();},30000);
