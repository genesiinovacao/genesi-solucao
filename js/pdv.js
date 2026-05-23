// PDV Logic
let cart=[];
let clienteSelecionado=null;
let pagamentoSelecionado='dinheiro';

function initPDV(){
  const produtos=DataService.getProdutos();
  // Categorias
  const cats=[...new Set(produtos.map(p=>p.categoria))];
  const sel=document.getElementById('pdv-categoria');
  cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
  renderProducts(produtos);
  // Clock
  (function clock(){const el=document.getElementById('pdv-clock');if(el)el.textContent=new Date().toLocaleTimeString('pt-BR');setTimeout(clock,1000)})();
  // Events
  document.getElementById('pdv-search').addEventListener('input',filterProducts);
  document.getElementById('pdv-categoria').addEventListener('change',filterProducts);
  document.getElementById('desconto-input').addEventListener('input',updateTotals);
  document.querySelectorAll('.payment-btn').forEach(btn=>{
    btn.addEventListener('click',function(){
      document.querySelectorAll('.payment-btn').forEach(b=>b.classList.remove('active'));
      this.classList.add('active');
      pagamentoSelecionado=this.dataset.pay;
      document.getElementById('troco-area').style.display=pagamentoSelecionado==='dinheiro'?'block':'none';
    });
  });
  document.getElementById('valor-recebido')?.addEventListener('input',calcTroco);
  loadClientesPDV();
  document.getElementById('search-cliente-pdv')?.addEventListener('input',function(){loadClientesPDV(this.value);});
}

function filterProducts(){
  const q=document.getElementById('pdv-search').value.toLowerCase();
  const cat=document.getElementById('pdv-categoria').value;
  let produtos=DataService.getProdutos();
  if(q)produtos=produtos.filter(p=>p.nome.toLowerCase().includes(q)||p.codigo.includes(q));
  if(cat)produtos=produtos.filter(p=>p.categoria===cat);
  renderProducts(produtos);
}

function renderProducts(produtos){
  const grid=document.getElementById('product-grid');
  if(!produtos.length){grid.innerHTML='<div class="empty-state"><div class="empty-icon">📦</div><h3>Nenhum produto encontrado</h3></div>';return;}
  grid.innerHTML=produtos.map(p=>`
    <div class="product-card" onclick="addToCart(${p.id})" title="${p.nome}">
      <div class="product-emoji">${p.emoji}</div>
      <div class="product-name">${p.nome}</div>
      <div class="product-price">${formatMoeda(p.preco_venda)}</div>
      <div class="product-stock ${p.estoque<=p.estoque_min?'text-danger':'text-muted'}">${p.estoque} ${p.unidade} em estoque</div>
    </div>`).join('');
}

function addToCart(id){
  const p=DataService.getProduto(id);
  if(!p||p.estoque<=0){APP.toast('Produto sem estoque!','error');return;}
  const existing=cart.find(i=>i.id===id);
  if(existing){
    if(existing.qty>=p.estoque){APP.toast('Quantidade máxima atingida!','warning');return;}
    existing.qty++;
  } else {
    cart.push({id:p.id,nome:p.nome,preco:p.preco_venda,qty:1,emoji:p.emoji,estoque:p.estoque});
  }
  renderCart();
  APP.toast(`${p.emoji} ${p.nome} adicionado!`,'success',1500);
}

function removeFromCart(id){cart=cart.filter(i=>i.id!==id);renderCart();}
function changeQty(id,delta){
  const item=cart.find(i=>i.id===id);
  if(!item)return;
  item.qty+=delta;
  if(item.qty<=0)removeFromCart(id);
  else renderCart();
}
function clearCart(){cart=[];clienteSelecionado=null;document.getElementById('cliente-selecionado').textContent='';renderCart();}

function renderCart(){
  const el=document.getElementById('cart-items');
  if(!cart.length){
    el.innerHTML='<div class="empty-state" style="padding:30px 10px"><div class="empty-icon">🛒</div><h3>Carrinho vazio</h3><p>Clique nos produtos para adicionar</p></div>';
    updateTotals();return;
  }
  el.innerHTML=cart.map(item=>`
    <div class="cart-item">
      <span style="font-size:1.2rem">${item.emoji}</span>
      <div style="flex:1;min-width:0">
        <div class="cart-item-name">${item.nome}</div>
        <div class="cart-item-price">${formatMoeda(item.preco)} un.</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn" onclick="changeQty(${item.id},-1)">−</button>
        <span style="min-width:24px;text-align:center;font-weight:700">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${item.id},1)">+</button>
      </div>
      <div style="min-width:70px;text-align:right;font-weight:700;font-size:.85rem">${formatMoeda(item.preco*item.qty)}</div>
      <button class="btn-icon danger" onclick="removeFromCart(${item.id})" style="margin-left:4px">🗑️</button>
    </div>`).join('');
  updateTotals();
}

function updateTotals(){
  const subtotal=cart.reduce((s,i)=>s+i.preco*i.qty,0);
  const descPct=parseFloat(document.getElementById('desconto-input')?.value)||0;
  const descVal=subtotal*(descPct/100);
  const total=subtotal-descVal;
  document.getElementById('subtotal').textContent=formatMoeda(subtotal);
  document.getElementById('desconto-display').textContent='- '+formatMoeda(descVal);
  document.getElementById('total-display').textContent=formatMoeda(total);
  calcTroco();
}

function calcTroco(){
  const total=parseFloat(document.getElementById('total-display').textContent.replace('R$ ','').replace('.','').replace(',','.'))||0;
  const recebido=parseFloat(document.getElementById('valor-recebido')?.value)||0;
  const troco=recebido-total;
  const el=document.getElementById('troco-value');
  if(el){el.textContent=formatMoeda(Math.max(0,troco));el.style.color=troco>=0?'var(--accent-success)':'var(--accent-danger)';}
}

function loadClientesPDV(q=''){
  let clientes=DataService.getClientes();
  if(q)clientes=clientes.filter(c=>c.nome.toLowerCase().includes(q.toLowerCase())||c.cpf.includes(q));
  const el=document.getElementById('clientes-pdv-list');
  if(!el)return;
  el.innerHTML=clientes.map(c=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:var(--radius-md);cursor:pointer;transition:var(--transition);border:1px solid var(--border-color);margin-bottom:8px" onclick="selecionarCliente(${c.id})" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
      <div>
        <div style="font-weight:600;font-size:.875rem">${c.nome}</div>
        <div style="font-size:.75rem;color:var(--text-secondary)">${c.cpf} • ⭐ ${c.pontos} pts</div>
      </div>
      <span class="badge badge-primary">Selecionar</span>
    </div>`).join('');
}

function selecionarCliente(id){
  const c=DataService.getClientes().find(x=>x.id===id);
  clienteSelecionado=c;
  document.getElementById('cliente-selecionado').textContent=`👤 ${c.nome} • ⭐ ${c.pontos} pontos`;
  APP.closeModal('modal-cliente-pdv');
  APP.toast(`Cliente ${c.nome} selecionado!`,'success');
}

function finalizarVenda(){
  if(!cart.length){APP.toast('Carrinho vazio!','error');return;}
  const subtotal=cart.reduce((s,i)=>s+i.preco*i.qty,0);
  const descPct=parseFloat(document.getElementById('desconto-input')?.value)||0;
  const total=subtotal*(1-descPct/100);
  if(pagamentoSelecionado==='dinheiro'){
    const recebido=parseFloat(document.getElementById('valor-recebido')?.value)||0;
    if(recebido>0&&recebido<total){APP.toast('Valor insuficiente!','error');return;}
  }
  // Update stock
  cart.forEach(item=>{
    const p=DataService.getProduto(item.id);
    if(p)DataService.updateProduto(item.id,{estoque:p.estoque-item.qty});
  });
  // Save transaction
  DataService.addTransacao({tipo:'receita',descricao:'Venda PDV #'+Date.now().toString().slice(-4),valor:total,data:new Date().toISOString().split('T')[0],categoria:'Vendas',status:'pago'});
  // Update client points
  if(clienteSelecionado){
    const pontos=Math.floor(total/10);
    DataService.updateCliente(clienteSelecionado.id,{pontos:clienteSelecionado.pontos+pontos,total_compras:clienteSelecionado.total_compras+total});
  }
  gerarCupom(total,subtotal,descPct);
  APP.openModal('modal-cupom');
  cart=[];clienteSelecionado=null;
  document.getElementById('desconto-input').value='';
  document.getElementById('valor-recebido').value='';
  renderCart();
  APP.toast('✅ Venda finalizada com sucesso!','success');
}

function gerarCupom(total,subtotal,desc){
  const cfg=DataService.getConfig();
  const agora=new Date().toLocaleString('pt-BR');
  const itens=cart.length?cart:JSON.parse(sessionStorage.getItem('last_cart')||'[]');
  let txt=`════════════════════════════\n`;
  txt+=`       ${cfg.empresa}\n`;
  txt+=`   CNPJ: ${cfg.cnpj}\n`;
  txt+=`   ${cfg.endereco}\n`;
  txt+=`════════════════════════════\n`;
  txt+=`   CUPOM NÃO FISCAL\n`;
  txt+=`   ${agora}\n`;
  txt+=`────────────────────────────\n`;
  if(clienteSelecionado)txt+=`Cliente: ${clienteSelecionado.nome}\n────────────────────────────\n`;
  document.getElementById('cupom-content').textContent=txt+`Subtotal: ${formatMoeda(subtotal)}\nDesconto: ${desc}%\nTOTAL:    ${formatMoeda(total)}\nPgto:     ${pagamentoSelecionado.toUpperCase()}\n════════════════════════════\n    Obrigado pela preferência!\n    Volte sempre! 😊\n════════════════════════════`;
}

document.addEventListener('DOMContentLoaded',initPDV);
// Barcode keyboard shortcut: focus search on any keypress
document.addEventListener('keypress',e=>{
  if(e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){
    const s=document.getElementById('pdv-search');
    if(s){s.focus();s.value+=e.key;}
  }
});
