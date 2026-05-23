// SOLUÇÃO — Central Data Layer & LocalStorage Management
const DB = {
  get(key){try{return JSON.parse(localStorage.getItem('solucao_'+key))||null}catch{return null}},
  set(key,val){localStorage.setItem('solucao_'+key,JSON.stringify(val))},
  remove(key){localStorage.removeItem('solucao_'+key)}
};

// SEED DATA
const SEED = {
  produtos:[
    {id:1,codigo:'7891234560001',nome:'Arroz Branco 5kg',categoria:'Mercearia',preco_custo:14.90,preco_venda:19.90,estoque:150,estoque_min:20,unidade:'un',emoji:'🍚'},
    {id:2,codigo:'7891234560002',nome:'Feijão Carioca 1kg',categoria:'Mercearia',preco_custo:5.80,preco_venda:8.90,estoque:200,estoque_min:30,unidade:'un',emoji:'🫘'},
    {id:3,codigo:'7891234560003',nome:'Leite Integral 1L',categoria:'Laticínios',preco_custo:3.50,preco_venda:5.49,estoque:8,estoque_min:50,unidade:'un',emoji:'🥛'},
    {id:4,codigo:'7891234560004',nome:'Pão Francês (kg)',categoria:'Padaria',preco_custo:4.00,preco_venda:8.00,estoque:30,estoque_min:10,unidade:'kg',emoji:'🥖'},
    {id:5,codigo:'7891234560005',nome:'Refrigerante 2L',categoria:'Bebidas',preco_custo:5.00,preco_venda:8.50,estoque:60,estoque_min:15,unidade:'un',emoji:'🥤'},
    {id:6,codigo:'7891234560006',nome:'Óleo de Soja 900ml',categoria:'Mercearia',preco_custo:7.20,preco_venda:10.90,estoque:45,estoque_min:20,unidade:'un',emoji:'🫙'},
    {id:7,codigo:'7891234560007',nome:'Açúcar Cristal 1kg',categoria:'Mercearia',preco_custo:3.10,preco_venda:4.90,estoque:180,estoque_min:40,unidade:'un',emoji:'🍬'},
    {id:8,codigo:'7891234560008',nome:'Café Torrado 500g',categoria:'Mercearia',preco_custo:9.50,preco_venda:14.90,estoque:5,estoque_min:20,unidade:'un',emoji:'☕'},
    {id:9,codigo:'7891234560009',nome:'Sabão em Pó 1kg',categoria:'Limpeza',preco_custo:8.00,preco_venda:12.90,estoque:70,estoque_min:15,unidade:'un',emoji:'🧺'},
    {id:10,codigo:'7891234560010',nome:'Papel Higiênico 4un',categoria:'Higiene',preco_custo:6.50,preco_venda:10.90,estoque:120,estoque_min:30,unidade:'pc',emoji:'🧻'},
    {id:11,codigo:'7891234560011',nome:'Frango Congelado 1kg',categoria:'Carnes',preco_custo:9.00,preco_venda:14.90,estoque:35,estoque_min:10,unidade:'kg',emoji:'🍗'},
    {id:12,codigo:'7891234560012',nome:'Macarrão Espaguete',categoria:'Mercearia',preco_custo:2.50,preco_venda:4.29,estoque:90,estoque_min:20,unidade:'un',emoji:'🍝'},
    {id:13,codigo:'7891234560013',nome:'Manteiga 200g',categoria:'Laticínios',preco_custo:5.00,preco_venda:8.90,estoque:25,estoque_min:10,unidade:'un',emoji:'🧈'},
    {id:14,codigo:'7891234560014',nome:'Biscoito Cream Cracker',categoria:'Mercearia',preco_custo:2.80,preco_venda:4.50,estoque:55,estoque_min:15,unidade:'un',emoji:'🍪'},
    {id:15,codigo:'7891234560015',nome:'Detergente 500ml',categoria:'Limpeza',preco_custo:1.80,preco_venda:2.99,estoque:80,estoque_min:30,unidade:'un',emoji:'🧴'},
    {id:16,codigo:'7891234560016',nome:'Shampoo 400ml',categoria:'Higiene',preco_custo:6.00,preco_venda:10.90,estoque:40,estoque_min:15,unidade:'un',emoji:'💆'},
    {id:17,codigo:'7891234560017',nome:'Iogurte Natural 170g',categoria:'Laticínios',preco_custo:2.00,preco_venda:3.49,estoque:30,estoque_min:20,unidade:'un',emoji:'🥣'},
    {id:18,codigo:'7891234560018',nome:'Água Mineral 1,5L',categoria:'Bebidas',preco_custo:1.20,preco_venda:2.49,estoque:100,estoque_min:30,unidade:'un',emoji:'💧'},
    {id:19,codigo:'7891234560019',nome:'Queijo Mussarela 200g',categoria:'Laticínios',preco_custo:6.50,preco_venda:10.90,estoque:3,estoque_min:10,unidade:'un',emoji:'🧀'},
    {id:20,codigo:'7891234560020',nome:'Presunto Fatiado 200g',categoria:'Frios',preco_custo:5.50,preco_venda:9.90,estoque:18,estoque_min:8,unidade:'un',emoji:'🥩'},
  ],
  clientes:[
    {id:1,nome:'Maria da Silva',cpf:'123.456.789-00',telefone:'(11) 99999-1111',email:'maria@email.com',endereco:'Rua das Flores, 123',pontos:350,total_compras:1850.00,status:'ativo'},
    {id:2,nome:'João Pereira',cpf:'987.654.321-00',telefone:'(11) 98888-2222',email:'joao@email.com',endereco:'Av. Principal, 456',pontos:120,total_compras:680.00,status:'ativo'},
    {id:3,nome:'Ana Costa',cpf:'111.222.333-44',telefone:'(11) 97777-3333',email:'ana@email.com',endereco:'Rua do Comércio, 789',pontos:580,total_compras:3200.00,status:'ativo'},
    {id:4,nome:'Carlos Souza',cpf:'555.666.777-88',telefone:'(11) 96666-4444',email:'carlos@email.com',endereco:'Rua Nova, 321',pontos:210,total_compras:1100.00,status:'ativo'},
    {id:5,nome:'Fernanda Lima',cpf:'999.888.777-66',telefone:'(11) 95555-5555',email:'fernanda@email.com',endereco:'Av. Central, 654',pontos:890,total_compras:4750.00,status:'ativo'},
    {id:6,nome:'Roberto Nunes',cpf:'333.444.555-22',telefone:'(11) 94444-6666',email:'roberto@email.com',endereco:'Rua Sete, 10',pontos:45,total_compras:250.00,status:'inativo'},
    {id:7,nome:'Lucia Mendes',cpf:'777.888.999-11',telefone:'(11) 93333-7777',email:'lucia@email.com',endereco:'Praça Central, 5',pontos:1200,total_compras:6400.00,status:'ativo'},
    {id:8,nome:'Paulo Rodrigues',cpf:'222.111.000-33',telefone:'(11) 92222-8888',email:'paulo@email.com',endereco:'Av. Paulista, 100',pontos:75,total_compras:410.00,status:'ativo'},
  ],
  fornecedores:[
    {id:1,nome:'Distribuidora Central Ltda',cnpj:'12.345.678/0001-90',contato:'Pedro Alves',telefone:'(11) 3333-1111',email:'comercial@distribcentral.com',categoria:'Mercearia',status:'ativo'},
    {id:2,nome:'Laticínios Bom Sabor',cnpj:'98.765.432/0001-10',contato:'Sandra Vieira',telefone:'(11) 3333-2222',email:'vendas@bomsabor.com',categoria:'Laticínios',status:'ativo'},
    {id:3,nome:'Frigorífico Sul',cnpj:'11.222.333/0001-44',contato:'Marcos Gomes',telefone:'(11) 3333-3333',email:'compras@frigosul.com',categoria:'Carnes',status:'ativo'},
    {id:4,nome:'Higiene & Limpeza SA',cnpj:'55.666.777/0001-88',contato:'Carla Santos',telefone:'(11) 3333-4444',email:'pedidos@higlimsa.com',categoria:'Higiene/Limpeza',status:'ativo'},
    {id:5,nome:'Bebidas Premium Distribuidora',cnpj:'99.888.777/0001-66',contato:'Lucas Ferreira',telefone:'(11) 3333-5555',email:'vendas@bebpremium.com',categoria:'Bebidas',status:'inativo'},
  ],
  promocoes:[
    {id:1,nome:'Semana da Mercearia',desconto:15,tipo:'categoria',alvo:'Mercearia',inicio:'2026-05-10',fim:'2026-05-17',ativo:true,vendas:42,economia_cliente:185.60},
    {id:2,nome:'Leve 3 Pague 2 — Refrigerante',desconto:33,tipo:'produto',alvo:'Refrigerante 2L',inicio:'2026-05-12',fim:'2026-05-19',ativo:true,vendas:28,economia_cliente:79.00},
    {id:3,nome:'Desconto Fidelidade',desconto:10,tipo:'fidelidade',alvo:'Clientes Premium',inicio:'2026-05-01',fim:'2026-05-31',ativo:true,vendas:156,economia_cliente:620.40},
    {id:4,nome:'Promoção de Laticínios',desconto:20,tipo:'categoria',alvo:'Laticínios',inicio:'2026-04-01',fim:'2026-04-30',ativo:false,vendas:89,economia_cliente:310.80},
  ],
  pedidos_delivery:[
    {id:'#DEL001',cliente:'Maria da Silva',endereco:'Rua das Flores, 123',itens:['Arroz 5kg','Feijão 1kg','Leite 1L x3'],total:44.28,status:'entregue',horario:'09:15',pagamento:'Pix'},
    {id:'#DEL002',cliente:'João Pereira',endereco:'Av. Principal, 456',itens:['Refrigerante 2L x2','Biscoito x3'],total:30.50,status:'em_rota',horario:'10:30',pagamento:'Cartão'},
    {id:'#DEL003',cliente:'Ana Costa',endereco:'Rua do Comércio, 789',itens:['Frango 1kg','Queijo Mussarela','Presunto'],total:35.70,status:'preparando',horario:'11:00',pagamento:'Dinheiro'},
    {id:'#DEL004',cliente:'Fernanda Lima',endereco:'Av. Central, 654',itens:['Café 500g x2','Açúcar 1kg','Leite 1L x6'],total:63.74,status:'pendente',horario:'11:15',pagamento:'Pix'},
  ],
  transacoes_financeiras:[
    {id:1,tipo:'receita',descricao:'Vendas do dia - 10/05',valor:2840.50,data:'2026-05-10',categoria:'Vendas',status:'pago'},
    {id:2,tipo:'despesa',descricao:'Nota Fiscal - Distribuidora Central',valor:850.00,data:'2026-05-10',categoria:'Compras',status:'pago'},
    {id:3,tipo:'receita',descricao:'Vendas do dia - 11/05',valor:3120.80,data:'2026-05-11',categoria:'Vendas',status:'pago'},
    {id:4,tipo:'despesa',descricao:'Conta de Energia Elétrica',valor:420.00,data:'2026-05-15',categoria:'Utilidades',status:'pendente'},
    {id:5,tipo:'despesa',descricao:'Aluguel do Espaço',valor:2200.00,data:'2026-05-20',categoria:'Aluguel',status:'pendente'},
    {id:6,tipo:'receita',descricao:'Vendas do dia - 12/05',valor:2950.30,data:'2026-05-12',categoria:'Vendas',status:'pago'},
    {id:7,tipo:'despesa',descricao:'Nota Fiscal - Laticínios Bom Sabor',valor:620.00,data:'2026-05-11',categoria:'Compras',status:'pago'},
    {id:8,tipo:'receita',descricao:'Delivery - Pedidos do dia',valor:340.00,data:'2026-05-12',categoria:'Delivery',status:'pago'},
  ],
  vendas_historico: generateVendas(),
  config:{
    empresa:'Mercado do João',
    cnpj:'12.345.678/0001-90',
    endereco:'Rua Principal, 100 - Centro',
    telefone:'(11) 99999-0000',
    email:'contato@mercadodojoao.com',
    regime:'simples_nacional',
    meta_vendas_dia:3500,
    usuario:{nome:'João Silva',cargo:'Gerente',avatar:'JS'}
  }
};

function generateVendas(){
  const v=[];
  const hoje=new Date();
  for(let i=29;i>=0;i--){
    const d=new Date(hoje);d.setDate(d.getDate()-i);
    const base=2000+Math.random()*2000;
    v.push({data:d.toISOString().split('T')[0],total:+base.toFixed(2),qtd_vendas:Math.floor(20+Math.random()*60),ticket_medio:+(base/(20+Math.random()*60)).toFixed(2)});
  }
  return v;
}

// INITIALIZE DB
function initDB(){
  if(!DB.get('initialized')){
    Object.entries(SEED).forEach(([k,v])=>DB.set(k,v));
    DB.set('initialized',true);
    console.log('SOLUÇÃO: Banco de dados inicializado!');
  }
}

// CRUD HELPERS
const DataService={
  // Produtos
  getProdutos(){return DB.get('produtos')||[]},
  saveProdutos(p){DB.set('produtos',p)},
  addProduto(p){const arr=this.getProdutos();p.id=Date.now();arr.push(p);this.saveProdutos(arr);return p},
  updateProduto(id,data){const arr=this.getProdutos();const i=arr.findIndex(x=>x.id==id);if(i>-1){arr[i]={...arr[i],...data};this.saveProdutos(arr);}return arr[i]},
  deleteProduto(id){const arr=this.getProdutos().filter(x=>x.id!=id);this.saveProdutos(arr)},
  getProduto(id){return this.getProdutos().find(x=>x.id==id)},

  // Clientes
  getClientes(){return DB.get('clientes')||[]},
  saveClientes(c){DB.set('clientes',c)},
  addCliente(c){const arr=this.getClientes();c.id=Date.now();arr.push(c);this.saveClientes(arr);return c},
  updateCliente(id,data){const arr=this.getClientes();const i=arr.findIndex(x=>x.id==id);if(i>-1){arr[i]={...arr[i],...data};this.saveClientes(arr);}},
  deleteCliente(id){const arr=this.getClientes().filter(x=>x.id!=id);this.saveClientes(arr)},

  // Fornecedores
  getFornecedores(){return DB.get('fornecedores')||[]},
  saveFornecedores(f){DB.set('fornecedores',f)},
  addFornecedor(f){const arr=this.getFornecedores();f.id=Date.now();arr.push(f);this.saveFornecedores(arr);return f},
  updateFornecedor(id,data){const arr=this.getFornecedores();const i=arr.findIndex(x=>x.id==id);if(i>-1){arr[i]={...arr[i],...data};this.saveFornecedores(arr);}},
  deleteFornecedor(id){const arr=this.getFornecedores().filter(x=>x.id!=id);this.saveFornecedores(arr)},

  // Promoções
  getPromocoes(){return DB.get('promocoes')||[]},
  savePromocoes(p){DB.set('promocoes',p)},
  addPromocao(p){const arr=this.getPromocoes();p.id=Date.now();arr.push(p);this.savePromocoes(arr);return p},
  updatePromocao(id,data){const arr=this.getPromocoes();const i=arr.findIndex(x=>x.id==id);if(i>-1){arr[i]={...arr[i],...data};this.savePromocoes(arr);}},
  deletePromocao(id){const arr=this.getPromocoes().filter(x=>x.id!=id);this.savePromocoes(arr)},

  // Financeiro
  getTransacoes(){return DB.get('transacoes_financeiras')||[]},
  addTransacao(t){const arr=this.getTransacoes();t.id=Date.now();arr.push(t);DB.set('transacoes_financeiras',arr);return t},
  deleteTransacao(id){const arr=this.getTransacoes().filter(x=>x.id!=id);DB.set('transacoes_financeiras',arr)},

  // Delivery
  getPedidos(){return DB.get('pedidos_delivery')||[]},
  updatePedido(id,data){const arr=this.getPedidos();const i=arr.findIndex(x=>x.id==id);if(i>-1){arr[i]={...arr[i],...data};DB.set('pedidos_delivery',arr);}},

  // Vendas histórico
  getVendasHistorico(){return DB.get('vendas_historico')||[]},
  addVenda(v){const arr=this.getVendasHistorico();arr.push(v);DB.set('vendas_historico',arr)},

  // Config
  getConfig(){return DB.get('config')||SEED.config},
  saveConfig(c){DB.set('config',c)},

  // DASHBOARD KPIs
  getDashboardKPIs(){
    const hoje=new Date().toISOString().split('T')[0];
    const vendas=this.getVendasHistorico();
    const hoje_venda=vendas.find(v=>v.data===hoje)||{total:2950.30,qtd_vendas:48,ticket_medio:61.46};
    const ontem_venda=vendas[vendas.length-2]||{total:2840.50};
    const produtos=this.getProdutos();
    const estoque_critico=produtos.filter(p=>p.estoque<=p.estoque_min).length;
    const pedidos=this.getPedidos();
    const pedidos_ativos=pedidos.filter(p=>p.status!=='entregue').length;
    const variacao=((hoje_venda.total-ontem_venda.total)/ontem_venda.total*100).toFixed(1);
    const config=this.getConfig();
    return {
      vendas_dia:hoje_venda.total,
      variacao_vendas:+variacao,
      qtd_vendas:hoje_venda.qtd_vendas,
      ticket_medio:hoje_venda.ticket_medio,
      estoque_critico,
      pedidos_ativos,
      meta_dia:config.meta_vendas_dia||3500,
      meta_percentual:+((hoje_venda.total/(config.meta_vendas_dia||3500))*100).toFixed(1)
    };
  }
};

// UTILITY
function formatMoeda(v){return 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function formatData(d){return new Date(d+'T12:00:00').toLocaleDateString('pt-BR')}
function formatDataHora(d){return new Date(d).toLocaleString('pt-BR')}

// Init on load
initDB();
