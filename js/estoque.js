// Estoque Logic
let todosOsProdutos=[];
let paginaAtual=1;
const porPagina=10;

function initEstoque(){
  todosOsProdutos=DataService.getProdutos();
  populaCategorias();
  renderKPIs();
  renderTabela();
  document.getElementById('search-estoque').addEventListener('input',()=>{paginaAtual=1;renderTabela();});
  document.getElementById('filtro-categoria').addEventListener('change',()=>{paginaAtual=1;renderTabela();});
  document.getElementById('filtro-status').addEventListener('change',()=>{paginaAtual=1;renderTabela();});
  // Margem preview
  ['p-custo','p-venda'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input',atualizaMargemPreview);
  });
}

function populaCategorias(){
  const cats=[...new Set(todosOsProdutos.map(p=>p.categoria))];
  const sel=document.getElementById('filtro-categoria');
  cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
  const selP=document.getElementById('p-categoria');
  if(selP){cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;});} 
}

function renderKPIs(){
  const produtos=DataService.getProdutos();
  const totalItens=produtos.reduce((s,p)=>s+p.estoque,0);
  const valorEstoque=produtos.reduce((s,p)=>s+p.estoque*p.preco_custo,0);
  const criticos=produtos.filter(p=>p.estoque<=p.estoque_min).length;
  const zerados=produtos.filter(p=>p.estoque===0).length;
  document.getElementById('estoque-kpis').innerHTML=`
    <div class="kpi-card"><div class="kpi-icon">📦</div><div class="kpi-value">${produtos.length}</div><div class="kpi-label">Total Produtos</div></div>
    <div class="kpi-card success"><div class="kpi-icon">🔢</div><div class="kpi-value">${totalItens.toLocaleString('pt-BR')}</div><div class="kpi-label">Unidades em Estoque</div></div>
    <div class="kpi-card info"><div class="kpi-icon">💰</div><div class="kpi-value">${formatMoeda(valorEstoque)}</div><div class="kpi-label">Valor Total (Custo)</div></div>
    <div class="kpi-card ${criticos>0?'danger':'success'}"><div class="kpi-icon">⚠️</div><div class="kpi-value">${criticos}</div><div class="kpi-label">Estoque Crítico</div></div>
    <div class="kpi-card ${zerados>0?'danger':'success'}"><div class="kpi-icon">🚫</div><div class="kpi-value">${zerados}</div><div class="kpi-label">Sem Estoque</div></div>
  `;
}

function getStatus(p){
  if(p.estoque===0)return {label:'Zerado',cls:'danger',filtro:'critico'};
  if(p.estoque<=p.estoque_min)return {label:'Crítico',cls:'danger',filtro:'critico'};
  if(p.estoque<=p.estoque_min*2)return {label:'Baixo',cls:'warning',filtro:'baixo'};
  return {label:'OK',cls:'success',filtro:'ok'};
}

function renderTabela(){
  todosOsProdutos=DataService.getProdutos();
  const q=document.getElementById('search-estoque').value.toLowerCase();
  const cat=document.getElementById('filtro-categoria').value;
  const st=document.getElementById('filtro-status').value;
  let lista=todosOsProdutos;
  if(q)lista=lista.filter(p=>p.nome.toLowerCase().includes(q)||p.codigo.includes(q));
  if(cat)lista=lista.filter(p=>p.categoria===cat);
  if(st)lista=lista.filter(p=>getStatus(p).filtro===st);
  const total=lista.length;
  const inicio=(paginaAtual-1)*porPagina;
  const pagina=lista.slice(inicio,inicio+porPagina);
  const tbody=document.getElementById('estoque-tbody');
  if(!pagina.length){tbody.innerHTML='<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📦</div><h3>Nenhum produto encontrado</h3></div></td></tr>';return;}
  tbody.innerHTML=pagina.map(p=>{
    const st=getStatus(p);
    const margem=((p.preco_venda-p.preco_custo)/p.preco_venda*100).toFixed(1);
    return `<tr>
      <td><span style="font-size:1.2rem">${p.emoji}</span> <strong>${p.nome}</strong></td>
      <td><span style="font-size:.72rem;font-family:monospace;color:var(--text-muted)">${p.codigo}</span></td>
      <td><span class="badge badge-gray">${p.categoria}</span></td>
      <td>${formatMoeda(p.preco_custo)}</td>
      <td><strong>${formatMoeda(p.preco_venda)}</strong></td>
      <td><span style="color:${+margem>20?'var(--accent-success)':'var(--accent-warning)'};font-weight:600">${margem}%</span></td>
      <td><strong style="color:${st.cls==='danger'?'var(--accent-danger)':st.cls==='warning'?'var(--accent-warning)':'inherit'}">${p.estoque} ${p.unidade}</strong></td>
      <td style="color:var(--text-secondary)">${p.estoque_min} ${p.unidade}</td>
      <td><span class="badge badge-${st.cls}">${st.label}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-icon" onclick="editarProduto(${p.id})" title="Editar">✏️</button>
          <button class="btn-icon" onclick="moverEstoque(${p.id})" title="Movimentar">📦</button>
          <button class="btn-icon danger" onclick="excluirProduto(${p.id})" title="Excluir">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  // Pagination
  const totalPag=Math.ceil(total/porPagina);
  document.getElementById('estoque-pagination').innerHTML=`
    <span>Mostrando ${inicio+1}–${Math.min(inicio+porPagina,total)} de ${total} produtos</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm btn-secondary" onclick="mudarPagina(-1)" ${paginaAtual===1?'disabled':''}>◀ Anterior</button>
      <span style="padding:6px 12px;background:var(--bg-tertiary);border-radius:var(--radius-md)">${paginaAtual}/${totalPag}</span>
      <button class="btn btn-sm btn-secondary" onclick="mudarPagina(1)" ${paginaAtual>=totalPag?'disabled':''}>Próxima ▶</button>
    </div>`;
}

function mudarPagina(delta){paginaAtual+=delta;renderTabela();}

function atualizaMargemPreview(){
  const custo=parseFloat(document.getElementById('p-custo')?.value)||0;
  const venda=parseFloat(document.getElementById('p-venda')?.value)||0;
  const el=document.getElementById('margem-preview');
  if(!el)return;
  if(custo>0&&venda>0){
    const margem=((venda-custo)/venda*100).toFixed(1);
    const lucro=venda-custo;
    el.innerHTML=`💡 Margem de lucro: <strong style="color:${+margem>20?'var(--accent-success)':'var(--accent-warning)'}">${margem}%</strong> | Lucro por unidade: <strong>${formatMoeda(lucro)}</strong>`;
  } else {el.innerHTML='';}
}

function novoProducto(){
  document.getElementById('modal-produto-title').textContent='➕ Novo Produto';
  ['p-id','p-nome','p-codigo','p-custo','p-venda','p-estoque','p-estoque-min'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('p-emoji').value='🛒';
  document.getElementById('margem-preview').innerHTML='';
}

function editarProduto(id){
  const p=DataService.getProduto(id);
  if(!p)return;
  document.getElementById('modal-produto-title').textContent='✏️ Editar Produto';
  document.getElementById('p-id').value=p.id;
  document.getElementById('p-nome').value=p.nome;
  document.getElementById('p-codigo').value=p.codigo;
  document.getElementById('p-categoria').value=p.categoria;
  document.getElementById('p-unidade').value=p.unidade;
  document.getElementById('p-emoji').value=p.emoji;
  document.getElementById('p-custo').value=p.preco_custo;
  document.getElementById('p-venda').value=p.preco_venda;
  document.getElementById('p-estoque').value=p.estoque;
  document.getElementById('p-estoque-min').value=p.estoque_min;
  atualizaMargemPreview();
  APP.openModal('modal-produto');
}

function salvarProduto(){
  const nome=document.getElementById('p-nome').value.trim();
  const custo=parseFloat(document.getElementById('p-custo').value);
  const venda=parseFloat(document.getElementById('p-venda').value);
  const estoque=parseInt(document.getElementById('p-estoque').value);
  const estoqueMin=parseInt(document.getElementById('p-estoque-min').value);
  if(!nome||isNaN(custo)||isNaN(venda)||isNaN(estoque)||isNaN(estoqueMin)){APP.toast('Preencha todos os campos obrigatórios!','error');return;}
  const data={nome,codigo:document.getElementById('p-codigo').value||'',categoria:document.getElementById('p-categoria').value,unidade:document.getElementById('p-unidade').value,emoji:document.getElementById('p-emoji').value||'📦',preco_custo:custo,preco_venda:venda,estoque,estoque_min:estoqueMin};
  const id=document.getElementById('p-id').value;
  if(id){DataService.updateProduto(id,data);APP.toast('Produto atualizado!','success');}
  else{DataService.addProduto(data);APP.toast('Produto cadastrado!','success');}
  APP.closeModal('modal-produto');
  renderKPIs();renderTabela();
}

function excluirProduto(id){
  APP.confirm('Deseja excluir este produto?',()=>{
    DataService.deleteProduto(id);APP.toast('Produto excluído!','success');renderKPIs();renderTabela();
  });
}

function moverEstoque(id){
  const p=DataService.getProduto(id);
  if(!p)return;
  document.getElementById('mov-produto-id').value=id;
  document.getElementById('mov-produto-nome').textContent=`${p.emoji} ${p.nome} — Estoque atual: ${p.estoque} ${p.unidade}`;
  document.getElementById('mov-qty').value='';
  document.getElementById('mov-obs').value='';
  APP.openModal('modal-movimentacao');
}

function salvarMovimentacao(){
  const id=document.getElementById('mov-produto-id').value;
  const tipo=document.getElementById('mov-tipo').value;
  const qty=parseInt(document.getElementById('mov-qty').value);
  if(!qty||qty<=0){APP.toast('Informe uma quantidade válida!','error');return;}
  const p=DataService.getProduto(id);
  if(!p)return;
  const novoEstoque=tipo==='entrada'?p.estoque+qty:Math.max(0,p.estoque-qty);
  DataService.updateProduto(id,{estoque:novoEstoque});
  APP.closeModal('modal-movimentacao');
  APP.toast(`Estoque ${tipo==='entrada'?'adicionado':'removido'}! Novo estoque: ${novoEstoque} ${p.unidade}`,'success');
  renderKPIs();renderTabela();
}

function exportarCSV(){
  const produtos=DataService.getProdutos();
  const headers='Código,Nome,Categoria,Custo,Venda,Estoque,Mínimo,Status\n';
  const rows=produtos.map(p=>`${p.codigo},"${p.nome}",${p.categoria},${p.preco_custo},${p.preco_venda},${p.estoque},${p.estoque_min},${getStatus(p).label}`).join('\n');
  const blob=new Blob([headers+rows],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='estoque_solucao.csv';a.click();
  APP.toast('CSV exportado!','success');
}

// Override modal open to reset form
document.addEventListener('DOMContentLoaded',()=>{
  initEstoque();
  document.querySelector('[onclick="APP.openModal(\'modal-produto\')"]')?.addEventListener('click',novoProducto,true);
});
