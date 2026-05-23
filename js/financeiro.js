// Financeiro Logic
function initFinanceiro(){
  renderResumo();renderLucro();renderCharts();renderTransacoes();
  document.getElementById('filtro-tipo-trans').addEventListener('change',renderTransacoes);
  document.getElementById('filtro-status-trans').addEventListener('change',renderTransacoes);
  document.getElementById('t-data').value=new Date().toISOString().split('T')[0];
}

function calcTotais(){
  const trans=DataService.getTransacoes();
  const receitas=trans.filter(t=>t.tipo==='receita'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
  const despesas=trans.filter(t=>t.tipo==='despesa'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
  const pendentes=trans.filter(t=>t.status==='pendente'&&t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
  return{receitas,despesas,pendentes,lucro:receitas-despesas};
}

function renderResumo(){
  const{receitas,despesas,pendentes,lucro}=calcTotais();
  document.getElementById('finance-summary').innerHTML=`
    <div class="finance-box">
      <div class="finance-amount" style="color:var(--accent-success)">${formatMoeda(receitas)}</div>
      <div class="finance-label">📈 Total Receitas</div>
    </div>
    <div class="finance-box">
      <div class="finance-amount" style="color:var(--accent-danger)">${formatMoeda(despesas)}</div>
      <div class="finance-label">📉 Total Despesas</div>
    </div>
    <div class="finance-box">
      <div class="finance-amount" style="color:var(--accent-warning)">${formatMoeda(pendentes)}</div>
      <div class="finance-label">⏳ A Pagar</div>
    </div>
    <div class="finance-box" style="background:${lucro>=0?'rgba(16,185,129,.05)':'rgba(239,68,68,.05)'};border-color:${lucro>=0?'rgba(16,185,129,.2)':'rgba(239,68,68,.2)'}">
      <div class="finance-amount" style="color:${lucro>=0?'var(--accent-success)':'var(--accent-danger)'}">${formatMoeda(lucro)}</div>
      <div class="finance-label">${lucro>=0?'✅':'❌'} Resultado Líquido</div>
    </div>`;
}

function renderLucro(){
  const produtos=DataService.getProdutos();
  const receitas=DataService.getTransacoes().filter(t=>t.tipo==='receita'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
  const despesas=DataService.getTransacoes().filter(t=>t.tipo==='despesa'&&t.status==='pago').reduce((s,t)=>s+t.valor,0);
  const lucro=receitas-despesas;
  const margemMedia=produtos.reduce((s,p)=>s+((p.preco_venda-p.preco_custo)/p.preco_venda*100),0)/produtos.length;
  const valorEstoque=produtos.reduce((s,p)=>s+p.estoque*p.preco_venda,0);
  document.getElementById('lucro-content').innerHTML=`
    <div style="text-align:center;padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md)">
      <div style="font-size:1.5rem;font-weight:800;color:${lucro>=0?'var(--accent-success)':'var(--accent-danger)'}">${formatMoeda(lucro)}</div>
      <div class="text-muted text-sm mt-1">💰 Lucro Líquido</div>
    </div>
    <div style="text-align:center;padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md)">
      <div style="font-size:1.5rem;font-weight:800;color:var(--accent-primary)">${margemMedia.toFixed(1)}%</div>
      <div class="text-muted text-sm mt-1">📊 Margem Média</div>
    </div>
    <div style="text-align:center;padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md)">
      <div style="font-size:1.3rem;font-weight:800;color:var(--accent-info)">${formatMoeda(valorEstoque)}</div>
      <div class="text-muted text-sm mt-1">📦 Valor em Estoque (Venda)</div>
    </div>
    <div style="text-align:center;padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md)">
      <div style="font-size:1.5rem;font-weight:800;color:var(--accent-warning)">${receitas>0?((lucro/receitas)*100).toFixed(1):0}%</div>
      <div class="text-muted text-sm mt-1">🎯 ROI do Período</div>
    </div>`;
}

function renderCharts(){
  const vendas=DataService.getVendasHistorico().slice(-7);
  const trans=DataService.getTransacoes();
  const ctx1=document.getElementById('chart-fluxo').getContext('2d');
  const receitas=vendas.map(v=>v.total);
  const despesas_dia=vendas.map(()=>Math.random()*800+200);
  new Chart(ctx1,{type:'line',data:{
    labels:vendas.map(v=>formatData(v.data).slice(0,5)),
    datasets:[
      {label:'Receitas',data:receitas,borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.1)',tension:.4,fill:true},
      {label:'Despesas',data:despesas_dia,borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.1)',tension:.4,fill:true}
    ]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8'}}},scales:{x:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#94a3b8'}},y:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#94a3b8'}}}}});

  // Despesas por categoria
  const cats={};
  trans.filter(t=>t.tipo==='despesa').forEach(t=>{cats[t.categoria]=(cats[t.categoria]||0)+t.valor;});
  const ctx2=document.getElementById('chart-despesas').getContext('2d');
  new Chart(ctx2,{type:'doughnut',data:{
    labels:Object.keys(cats),
    datasets:[{data:Object.values(cats),backgroundColor:['#7c3aed','#ef4444','#f59e0b','#10b981','#3b82f6','#64748b'],borderWidth:0}]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:11}}}}}});
}

function renderTransacoes(){
  const tipo=document.getElementById('filtro-tipo-trans').value;
  const status=document.getElementById('filtro-status-trans').value;
  let lista=DataService.getTransacoes().sort((a,b)=>new Date(b.data)-new Date(a.data));
  if(tipo)lista=lista.filter(t=>t.tipo===tipo);
  if(status)lista=lista.filter(t=>t.status===status);
  const tbody=document.getElementById('trans-tbody');
  if(!lista.length){tbody.innerHTML='<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💰</div><h3>Nenhum lançamento encontrado</h3></div></td></tr>';return;}
  tbody.innerHTML=lista.map(t=>`<tr>
    <td>${formatData(t.data)}</td>
    <td><strong>${t.descricao}</strong></td>
    <td><span class="badge badge-gray">${t.categoria}</span></td>
    <td><span class="badge badge-${t.tipo==='receita'?'success':'danger'}">${t.tipo==='receita'?'📈 Receita':'📉 Despesa'}</span></td>
    <td><strong style="color:${t.tipo==='receita'?'var(--accent-success)':'var(--accent-danger)'}">${t.tipo==='receita'?'+':'-'} ${formatMoeda(t.valor)}</strong></td>
    <td><span class="badge badge-${t.status==='pago'?'success':'warning'}">${t.status==='pago'?'✅ Pago':'⏳ Pendente'}</span></td>
    <td><button class="btn-icon danger" onclick="excluirTransacao(${t.id})">🗑️</button></td>
  </tr>`).join('');
}

function novaTransacao(tipo){
  document.getElementById('modal-trans-title').textContent=tipo==='receita'?'➕ Nova Receita':'➖ Nova Despesa';
  document.getElementById('t-tipo').value=tipo;
  document.getElementById('t-desc').value='';document.getElementById('t-valor').value='';
  document.getElementById('t-data').value=new Date().toISOString().split('T')[0];
  document.getElementById('t-status').value='pago';
  APP.openModal('modal-trans');
}

function salvarTransacao(){
  const desc=document.getElementById('t-desc').value.trim();
  const valor=parseFloat(document.getElementById('t-valor').value);
  const data=document.getElementById('t-data').value;
  if(!desc||!valor||!data){APP.toast('Preencha todos os campos!','error');return;}
  DataService.addTransacao({tipo:document.getElementById('t-tipo').value,descricao:desc,valor,data,categoria:document.getElementById('t-categoria').value,status:document.getElementById('t-status').value});
  APP.closeModal('modal-trans');APP.toast('Lançamento salvo!','success');
  renderResumo();renderLucro();renderTransacoes();
}

function excluirTransacao(id){
  APP.confirm('Excluir este lançamento?',()=>{DataService.deleteTransacao(id);renderResumo();renderLucro();renderTransacoes();APP.toast('Lançamento excluído!','success');});
}

document.addEventListener('DOMContentLoaded',initFinanceiro);
