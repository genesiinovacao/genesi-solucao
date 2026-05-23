// Promoções Logic
let promoTabAtual='todas';

function initPromocoes(){
  renderKPIsPromo();renderPromos();
  document.getElementById('pr-inicio').value=new Date().toISOString().split('T')[0];
  const fim=new Date();fim.setDate(fim.getDate()+7);
  document.getElementById('pr-fim').value=fim.toISOString().split('T')[0];
}

function setPromoTab(tab,el){
  promoTabAtual=tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderPromos();
}

function renderKPIsPromo(){
  const lista=DataService.getPromocoes();
  const ativas=lista.filter(p=>p.ativo).length;
  const totalVendas=lista.reduce((s,p)=>s+p.vendas,0);
  const totalEconomia=lista.reduce((s,p)=>s+p.economia_cliente,0);
  document.getElementById('promo-kpis').innerHTML=`
    <div class="kpi-card"><div class="kpi-icon">🏷️</div><div class="kpi-value">${lista.length}</div><div class="kpi-label">Total Promoções</div></div>
    <div class="kpi-card success"><div class="kpi-icon">✅</div><div class="kpi-value">${ativas}</div><div class="kpi-label">Ativas Agora</div></div>
    <div class="kpi-card info"><div class="kpi-icon">🛒</div><div class="kpi-value">${totalVendas}</div><div class="kpi-label">Vendas Geradas</div></div>
    <div class="kpi-card warning"><div class="kpi-icon">💸</div><div class="kpi-value">${formatMoeda(totalEconomia)}</div><div class="kpi-label">Economia aos Clientes</div></div>
  `;
}

function renderPromos(){
  let lista=DataService.getPromocoes();
  if(promoTabAtual==='ativa')lista=lista.filter(p=>p.ativo);
  else if(promoTabAtual==='inativa')lista=lista.filter(p=>!p.ativo);
  const grid=document.getElementById('promo-grid');
  if(!lista.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🏷️</div><h3>Nenhuma promoção encontrada</h3><p>Crie sua primeira promoção!</p></div>';return;}
  const tipoIcons={produto:'📦',categoria:'📁',fidelidade:'⭐'};
  grid.innerHTML=lista.map(p=>`
    <div class="promo-card">
      ${p.ativo?`<div class="promo-ribbon">ATIVA</div>`:''}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
        <div>
          <div class="promo-name">${p.nome}</div>
          <div class="promo-validity">📅 ${formatData(p.inicio)} – ${formatData(p.fim)}</div>
        </div>
        <div class="promo-discount">${p.desconto}%</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <span class="badge badge-info">${tipoIcons[p.tipo]||''} ${p.tipo}</span>
        <span class="badge badge-gray">${p.alvo}</span>
      </div>
      <div class="promo-stats">
        <div><span class="promo-stat-value">${p.vendas}</span><span class="promo-stat-label">Vendas</span></div>
        <div><span class="promo-stat-value">${formatMoeda(p.economia_cliente)}</span><span class="promo-stat-label">Economia Cliente</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-sm btn-secondary" style="flex:1" onclick="editarPromo(${p.id})">✏️ Editar</button>
        <button class="btn btn-sm btn-${p.ativo?'warning':'success'}" onclick="togglePromo(${p.id})">${p.ativo?'⏸️ Pausar':'▶️ Ativar'}</button>
        <button class="btn-icon danger" onclick="excluirPromo(${p.id})">🗑️</button>
      </div>
    </div>`).join('');
}

function novaPromocao(){
  document.getElementById('modal-promo-title').textContent='➕ Nova Promoção';
  ['pr-id','pr-nome','pr-alvo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('pr-desconto').value='';
  document.getElementById('pr-tipo').value='produto';
  document.getElementById('pr-ativo').value='true';
  APP.openModal('modal-promo');
}

function editarPromo(id){
  const p=DataService.getPromocoes().find(x=>x.id===id);if(!p)return;
  document.getElementById('modal-promo-title').textContent='✏️ Editar Promoção';
  document.getElementById('pr-id').value=p.id;document.getElementById('pr-nome').value=p.nome;
  document.getElementById('pr-desconto').value=p.desconto;document.getElementById('pr-tipo').value=p.tipo;
  document.getElementById('pr-alvo').value=p.alvo;document.getElementById('pr-inicio').value=p.inicio;
  document.getElementById('pr-fim').value=p.fim;document.getElementById('pr-ativo').value=String(p.ativo);
  APP.openModal('modal-promo');
}

function salvarPromocao(){
  const nome=document.getElementById('pr-nome').value.trim();
  const desconto=parseInt(document.getElementById('pr-desconto').value);
  if(!nome||!desconto){APP.toast('Preencha os campos obrigatórios!','error');return;}
  const data={nome,desconto,tipo:document.getElementById('pr-tipo').value,alvo:document.getElementById('pr-alvo').value,
    inicio:document.getElementById('pr-inicio').value,fim:document.getElementById('pr-fim').value,
    ativo:document.getElementById('pr-ativo').value==='true',vendas:0,economia_cliente:0};
  const id=document.getElementById('pr-id').value;
  if(id){DataService.updatePromocao(id,data);APP.toast('Promoção atualizada!','success');}
  else{DataService.addPromocao(data);APP.toast('Promoção criada!','success');}
  APP.closeModal('modal-promo');renderKPIsPromo();renderPromos();
}

function togglePromo(id){
  const p=DataService.getPromocoes().find(x=>x.id===id);if(!p)return;
  DataService.updatePromocao(id,{ativo:!p.ativo});
  APP.toast(p.ativo?'Promoção pausada!':'Promoção ativada!',p.ativo?'warning':'success');
  renderKPIsPromo();renderPromos();
}

function excluirPromo(id){
  APP.confirm('Excluir esta promoção?',()=>{DataService.deletePromocao(id);renderKPIsPromo();renderPromos();APP.toast('Promoção excluída!','success');});
}

document.addEventListener('DOMContentLoaded',initPromocoes);
