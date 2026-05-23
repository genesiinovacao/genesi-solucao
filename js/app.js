// SOLUÇÃO — App Core: Sidebar, Toast, Shared UI
const APP={
  sidebarCollapsed:false,
  currentPage:'',

  init(){
    this.renderSidebar();
    this.initSidebarToggle();
    this.highlightNav();
    this.renderTopBar();
    this.checkAlerts();
  },

  NAV:[
    {section:'Principal'},
    {icon:'📊',label:'Dashboard',href:'dashboard.html',id:'dashboard'},
    {icon:'🛒',label:'PDV — Caixa',href:'pdv.html',id:'pdv'},
    {section:'Gestão'},
    {icon:'📦',label:'Estoque',href:'estoque.html',id:'estoque'},
    {icon:'👥',label:'Clientes',href:'clientes.html',id:'clientes'},
    {icon:'🏭',label:'Fornecedores',href:'fornecedores.html',id:'fornecedores'},
    {section:'Financeiro'},
    {icon:'💰',label:'Financeiro',href:'financeiro.html',id:'financeiro'},
    {icon:'🏷️',label:'Promoções',href:'promocoes.html',id:'promocoes'},
    {icon:'🚴',label:'Delivery',href:'delivery.html',id:'delivery',badge:3},
    {section:'Inteligência'},
    {icon:'📈',label:'Relatórios',href:'relatorios.html',id:'relatorios'},
    {id:'ia',icon:'🤖',label:'SOLUÇÃO IA',href:'ia.html'},
    {section:'Sistema'},
    {id:'manual',icon:'📖',label:'Manual do Usuário',href:'manual.html'},
    {id:'plano',icon:'📋',label:'Plano de Projeto',href:'plano.html'},
    {id:'configuracoes',icon:'⚙️',label:'Configurações',href:'configuracoes.html'}
  ],

  renderSidebar(){
    const cfg=DataService.getConfig();
    const sb=document.getElementById('sidebar');
    if(!sb)return;
    let html=`
    <div class="sidebar-logo">
      <div class="logo-icon">💡</div>
      <div class="logo-text">
        <div class="logo-name">SOLUÇÃO</div>
        <span class="logo-tagline">Sistema de Varejo</span>
      </div>
    </div>
    <nav class="sidebar-nav">`;
    let section='';
    this.NAV.forEach(item=>{
      if(item.section){
        if(section) html += '</div>';
        html += `<div class="nav-section"><div class="nav-section-label">${item.section}</div>`;
        section = item.section;
      } else {
        const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
        html += `<a href="${item.href}" class="nav-item" id="nav-${item.id}" data-tooltip="${item.label}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span>${badge}</a>`;
      }
    });
    if(section) html += '</div>';
    html += `</nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="user-avatar">${cfg.usuario?.avatar||'JS'}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${cfg.usuario?.nome||'Usuário'}</div>
          <div class="sidebar-user-role">${cfg.usuario?.cargo||'Operador'}</div>
        </div>
      </div>
    </div>`;
    sb.innerHTML=html;
  },

  renderTopBar(){
    const cfg=DataService.getConfig();
    const el=document.getElementById('empresa-nome');
    if(el)el.textContent=cfg.empresa||'SOLUÇÃO';
  },

  highlightNav(){
    const page=location.pathname.split('/').pop().replace('.html','');
    const el=document.getElementById('nav-'+page);
    if(el)el.classList.add('active');
  },

  initSidebarToggle(){
    const sb=document.getElementById('sidebar');
    const mc=document.getElementById('main-content');
    const btn=document.getElementById('toggle-sidebar');
    if(!sb||!btn)return;
    btn.addEventListener('click',()=>{
      this.sidebarCollapsed=!this.sidebarCollapsed;
      sb.classList.toggle('collapsed',this.sidebarCollapsed);
      mc.classList.toggle('collapsed',this.sidebarCollapsed);
      btn.innerHTML=this.sidebarCollapsed?'☰':'✕';
    });
  },

  checkAlerts(){
    const produtos=DataService.getProdutos();
    const criticos=produtos.filter(p=>p.estoque<=p.estoque_min);
    if(criticos.length>0){
      const badge=document.getElementById('notif-badge');
      if(badge)badge.textContent=criticos.length;
    }
  },

  // TOAST
  toast(msg,type='info',duration=3500){
    let container=document.querySelector('.toast-container');
    if(!container){container=document.createElement('div');container.className='toast-container';document.body.appendChild(container);}
    const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    const t=document.createElement('div');
    t.className=`toast ${type}`;
    t.innerHTML=`<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-message">${msg}</span>`;
    container.appendChild(t);
    setTimeout(()=>{t.style.animation='slideInToast .3s ease reverse';setTimeout(()=>t.remove(),300);},duration);
  },

  // MODAL
  openModal(id){document.getElementById(id)?.classList.add('active')},
  closeModal(id){document.getElementById(id)?.classList.remove('active')},

  // CONFIRM
  confirm(msg,cb){
    if(window.confirm(msg))cb();
  }
};

// Modal close on overlay click
document.addEventListener('click',e=>{
  if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('active');
});

// Keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.querySelectorAll('.modal-overlay.active').forEach(m=>m.classList.remove('active'));}
});

document.addEventListener('DOMContentLoaded',()=>APP.init());
