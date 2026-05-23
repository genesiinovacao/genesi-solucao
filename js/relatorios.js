// Relatórios Logic
let periodoAtual=7;
let chartVendas=null,chartTop=null;

function initRelatorios(){renderTudo();}

function setPeriodo(dias,el){
  periodoAtual=dias;
  document.querySelectorAll('.report-period-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  if(chartVendas){chartVendas.destroy();chartVendas=null;}
  if(chartTop){chartTop.destroy();chartTop=null;}
  renderTudo();
}

function renderTudo(){
  const vendas=DataService.getVendasHistorico().slice(-periodoAtual);
  renderKPIs(vendas);renderCharts(vendas);renderTopClientes();renderCatPerformance();renderTabela(vendas);
}

function renderKPIs(vendas){
  const total=vendas.reduce((s,v)=>s+v.total,0);
  const qtd=vendas.reduce((s,v)=>s+v.qtd_vendas,0);
  const ticket=qtd>0?total/qtd:0;
  const melhor=vendas.reduce((m,v)=>v.total>m?v.total:m,0);
  document.getElementById('rel-kpis').innerHTML=`
    <div class="kpi-card"><div class="kpi-icon">💰</div><div class="kpi-value">${formatMoeda(total)}</div><div class="kpi-label">Faturamento Total</div></div>
    <div class="kpi-card success"><div class="kpi-icon">🛍️</div><div class="kpi-value">${qtd.toLocaleString('pt-BR')}</div><div class="kpi-label">Vendas Realizadas</div></div>
    <div class="kpi-card info"><div class="kpi-icon">🎯</div><div class="kpi-value">${formatMoeda(ticket)}</div><div class="kpi-label">Ticket Médio</div></div>
    <div class="kpi-card warning"><div class="kpi-icon">🏆</div><div class="kpi-value">${formatMoeda(melhor)}</div><div class="kpi-label">Melhor Dia</div></div>
  `;
}

function renderCharts(vendas){
  const ctx1=document.getElementById('chart-rel-vendas').getContext('2d');
  chartVendas=new Chart(ctx1,{type:'line',data:{
    labels:vendas.map(v=>formatData(v.data).slice(0,5)),
    datasets:[{label:'Vendas (R$)',data:vendas.map(v=>v.total),borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,.15)',tension:.4,fill:true,pointBackgroundColor:'#7c3aed',pointRadius:4}]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#94a3b8'}},y:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#94a3b8',callback:v=>'R$'+v.toLocaleString('pt-BR')}}}}});

  const produtos=DataService.getProdutos().slice(0,5);
  const ctx2=document.getElementById('chart-top-produtos').getContext('2d');
  chartTop=new Chart(ctx2,{type:'bar',data:{
    labels:produtos.map(p=>p.nome.split(' ').slice(0,2).join(' ')),
    datasets:[{label:'Unidades vendidas',data:produtos.map(()=>Math.floor(Math.random()*100+20)),backgroundColor:['#7c3aed','#06b6d4','#10b981','#f59e0b','#ef4444'],borderRadius:6}]
  },options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#94a3b8'}},y:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#94a3b8'}}}}});
}

function renderTopClientes(){
  const clientes=DataService.getClientes().sort((a,b)=>b.total_compras-a.total_compras).slice(0,5);
  const max=clientes[0]?.total_compras||1;
  document.getElementById('top-clientes-list').innerHTML=clientes.map((c,i)=>{
    const pct=(c.total_compras/max*100).toFixed(0);
    const medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:.85rem">
        <span>${medals[i]} <strong>${c.nome}</strong></span>
        <span style="color:var(--accent-primary);font-weight:700">${formatMoeda(c.total_compras)}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill primary" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderCatPerformance(){
  const cats=['Mercearia','Laticínios','Bebidas','Limpeza','Higiene'];
  const valores=cats.map(()=>Math.floor(Math.random()*5000+1000));
  const total=valores.reduce((s,v)=>s+v,0);
  document.getElementById('cat-performance').innerHTML=cats.map((c,i)=>{
    const pct=(valores[i]/total*100).toFixed(1);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:4px">
        <span><strong>${c}</strong></span>
        <span style="color:var(--text-secondary)">${pct}% — ${formatMoeda(valores[i])}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill ${['primary','info','success','warning','danger'][i]}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderTabela(vendas){
  const lista=[...vendas].reverse();
  document.getElementById('rel-tbody').innerHTML=lista.map((v,i)=>{
    const anterior=lista[i+1];
    const var_val=anterior?((v.total-anterior.total)/anterior.total*100):0;
    return `<tr>
      <td>${formatData(v.data)}</td>
      <td>${v.qtd_vendas}</td>
      <td><strong>${formatMoeda(v.total)}</strong></td>
      <td>${formatMoeda(v.ticket_medio)}</td>
      <td><span style="color:${var_val>=0?'var(--accent-success)':'var(--accent-danger)'};font-weight:600">${var_val>=0?'▲':'▼'} ${Math.abs(var_val).toFixed(1)}%</span></td>
    </tr>`;
  }).join('');
}

function exportarRelatorio(){
  APP.toast('📄 Gerando relatório PDF... (simulado)','info');
  setTimeout(()=>{APP.toast('✅ Relatório gerado e salvo!','success');},1500);
}

document.addEventListener('DOMContentLoaded',initRelatorios);
