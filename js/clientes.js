// Clientes Logic
let tabAtual='todos';

function initClientes(){
  renderKPIsClientes();
  renderClientes();
  document.getElementById('search-cliente').addEventListener('input',renderClientes);
}

function setTab(tab,el){
  tabAtual=tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderClientes();
}

function renderKPIsClientes(){
  const lista=DataService.getClientes();
  const ativos=lista.filter(c=>c.status==='ativo').length;
  const vip=lista.filter(c=>c.pontos>=500).length;
  const totalGasto=lista.reduce((s,c)=>s+c.total_compras,0);
  const totalPontos=lista.reduce((s,c)=>s+c.pontos,0);
  document.getElementById('clientes-kpis').innerHTML=`
    <div class="kpi-card"><div class="kpi-icon">👥</div><div class="kpi-value">${lista.length}</div><div class="kpi-label">Total Clientes</div></div>
    <div class="kpi-card success"><div class="kpi-icon">✅</div><div class="kpi-value">${ativos}</div><div class="kpi-label">Clientes Ativos</div></div>
    <div class="kpi-card warning"><div class="kpi-icon">⭐</div><div class="kpi-value">${vip}</div><div class="kpi-label">Clientes VIP</div></div>
    <div class="kpi-card info"><div class="kpi-icon">💰</div><div class="kpi-value">${formatMoeda(totalGasto)}</div><div class="kpi-label">Total em Compras</div></div>
    <div class="kpi-card"><div class="kpi-icon">🎁</div><div class="kpi-value">${totalPontos.toLocaleString('pt-BR')}</div><div class="kpi-label">Pontos Distribuídos</div></div>
  `;
}

function renderClientes(){
  const q=document.getElementById('search-cliente').value.toLowerCase();
  let lista=DataService.getClientes();
  if(q)lista=lista.filter(c=>c.nome.toLowerCase().includes(q)||c.cpf.includes(q)||c.email.toLowerCase().includes(q));
  if(tabAtual==='ativo')lista=lista.filter(c=>c.status==='ativo');
  else if(tabAtual==='inativo')lista=lista.filter(c=>c.status==='inativo');
  else if(tabAtual==='vip')lista=lista.filter(c=>c.pontos>=500);
  const grid=document.getElementById('clientes-grid');
  if(!lista.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👥</div><h3>Nenhum cliente encontrado</h3></div>';return;}
  grid.innerHTML=lista.map(c=>{
    const nivel=c.pontos>=1000?{label:'🥇 Gold',cor:'#f59e0b'}:c.pontos>=500?{label:'🥈 Silver',cor:'#94a3b8'}:{label:'🥉 Bronze',cor:'#c07850'};
    const initials=c.nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
    const pct=Math.min((c.pontos/1000)*100,100);
    return `
    <div class="card" style="cursor:pointer" onclick="verDetalhe(${c.id})">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome}</div>
          <div style="font-size:.75rem;color:var(--text-secondary)">${c.telefone}</div>
        </div>
        <span class="badge badge-${c.status==='ativo'?'success':'danger'}">${c.status==='ativo'?'Ativo':'Inativo'}</span>
      </div>
      <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:12px">${c.email}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.8rem">
        <span style="color:${nivel.cor};font-weight:700">${nivel.label}</span>
        <span style="font-weight:700">⭐ ${c.pontos.toLocaleString('pt-BR')} pts</span>
      </div>
      <div class="progress-bar"><div class="progress-fill primary" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);font-size:.78rem">
        <span style="color:var(--text-secondary)">Total gasto</span>
        <span style="font-weight:700;color:var(--accent-primary)">${formatMoeda(c.total_compras)}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-secondary" style="flex:1" onclick="editarCliente(${c.id})">✏️ Editar</button>
        <button class="btn btn-sm btn-danger" onclick="excluirCliente(${c.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function verDetalhe(id){
  const c=DataService.getClientes().find(x=>x.id===id);
  if(!c)return;
  const nivel=c.pontos>=1000?'🥇 Gold':c.pontos>=500?'🥈 Silver':'🥉 Bronze';
  document.getElementById('detalhe-content').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div><p class="text-muted text-sm">Nome</p><p class="font-bold">${c.nome}</p></div>
      <div><p class="text-muted text-sm">CPF</p><p class="font-bold">${c.cpf}</p></div>
      <div><p class="text-muted text-sm">Telefone</p><p class="font-bold">${c.telefone}</p></div>
      <div><p class="text-muted text-sm">E-mail</p><p class="font-bold">${c.email}</p></div>
      <div style="grid-column:1/-1"><p class="text-muted text-sm">Endereço</p><p class="font-bold">${c.endereco}</p></div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:center">
      <div style="background:var(--bg-tertiary);padding:16px;border-radius:var(--radius-md)">
        <div style="font-size:1.5rem;font-weight:800;color:var(--accent-primary)">${c.pontos}</div>
        <div class="text-muted text-sm">Pontos</div>
      </div>
      <div style="background:var(--bg-tertiary);padding:16px;border-radius:var(--radius-md)">
        <div style="font-size:1.2rem;font-weight:800;color:var(--accent-success)">${formatMoeda(c.total_compras)}</div>
        <div class="text-muted text-sm">Total Gasto</div>
      </div>
      <div style="background:var(--bg-tertiary);padding:16px;border-radius:var(--radius-md)">
        <div style="font-size:1.5rem;font-weight:800">${nivel}</div>
        <div class="text-muted text-sm">Nível</div>
      </div>
    </div>`;
  APP.openModal('modal-detalhe-cliente');
}

function novoCliente(){
  document.getElementById('modal-cliente-title').textContent='➕ Novo Cliente';
  ['c-id','c-nome','c-cpf','c-telefone','c-email','c-endereco'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('c-pontos').value='0';
  document.getElementById('c-status').value='ativo';
  APP.openModal('modal-cliente');
}

function editarCliente(id){
  const c=DataService.getClientes().find(x=>x.id===id);
  if(!c)return;
  document.getElementById('modal-cliente-title').textContent='✏️ Editar Cliente';
  document.getElementById('c-id').value=c.id;
  document.getElementById('c-nome').value=c.nome;
  document.getElementById('c-cpf').value=c.cpf;
  document.getElementById('c-telefone').value=c.telefone;
  document.getElementById('c-email').value=c.email;
  document.getElementById('c-endereco').value=c.endereco;
  document.getElementById('c-pontos').value=c.pontos;
  document.getElementById('c-status').value=c.status;
  APP.openModal('modal-cliente');
}

function salvarCliente(){
  const nome=document.getElementById('c-nome').value.trim();
  if(!nome){APP.toast('Nome é obrigatório!','error');return;}
  const data={
    nome,cpf:document.getElementById('c-cpf').value,
    telefone:document.getElementById('c-telefone').value,
    email:document.getElementById('c-email').value,
    endereco:document.getElementById('c-endereco').value,
    pontos:parseInt(document.getElementById('c-pontos').value)||0,
    total_compras:0,
    status:document.getElementById('c-status').value
  };
  const id=document.getElementById('c-id').value;
  if(id){DataService.updateCliente(id,data);APP.toast('Cliente atualizado!','success');}
  else{DataService.addCliente(data);APP.toast('Cliente cadastrado!','success');}
  APP.closeModal('modal-cliente');
  renderKPIsClientes();renderClientes();
}

function excluirCliente(id){
  APP.confirm('Deseja excluir este cliente?',()=>{
    DataService.deleteCliente(id);APP.toast('Cliente excluído!','success');renderKPIsClientes();renderClientes();
  });
}

function exportarClientesCSV(){
  const lista=DataService.getClientes();
  const h='Nome,CPF,Telefone,Email,Endereço,Pontos,Total Gasto,Status\n';
  const rows=lista.map(c=>`"${c.nome}",${c.cpf},${c.telefone},${c.email},"${c.endereco}",${c.pontos},${c.total_compras},${c.status}`).join('\n');
  const blob=new Blob([h+rows],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='clientes_solucao.csv';a.click();
  APP.toast('CSV exportado!','success');
}

document.addEventListener('DOMContentLoaded',initClientes);
