import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, User, Wifi, WifiOff, Package, Trash2, CreditCard, Banknote, QrCode } from 'lucide-react';
import SyncService from '../services/SyncService';

const PDV = () => {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [category, setCategory] = useState("Todos");

  // Mock de produtos (em um app real viria do SQLite local)
  const products = [
    { id: 1, name: "Arroz Branco 5kg", price: 19.90, stock: 150, emoji: "🍚", category: "Mercearia" },
    { id: 2, name: "Feijão Carioca 1kg", price: 8.90, stock: 200, emoji: "🫘", category: "Mercearia" },
    { id: 3, name: "Leite Integral 1L", price: 5.49, stock: 8, emoji: "🥛", category: "Laticínios" },
    { id: 4, name: "Refrigerante 2L", price: 8.50, stock: 60, emoji: "🥤", category: "Bebidas" },
  ];

  useEffect(() => {
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
  }, []);

  const addToCart = (product) => {
    const existing = cart.find(i => i.id === product.id);
    if (existing) {
      setCart(cart.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      {/* LEFT PANEL: PRODUCTS */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Package size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">SOLUÇÃO <span className="text-blue-500">2026</span></h1>
          </div>
          
          <div className="flex items-center gap-6 bg-[#1e293b] px-4 py-2 rounded-full border border-slate-700">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
              <span className="text-sm font-medium">{isOnline ? 'Cloud Online' : 'Modo Offline'}</span>
            </div>
            <div className="h-4 w-[1px] bg-slate-700"></div>
            <div className="flex items-center gap-2">
              <User size={16} className="text-slate-400" />
              <span className="text-sm">Operador: <span className="font-bold">João Silva</span></span>
            </div>
          </div>
        </header>

        {/* SEARCH & FILTERS */}
        <div className="flex gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Pesquisar produto ou código de barras (F2)..."
              className="w-full bg-[#1e293b] border-none rounded-xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all text-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="bg-[#1e293b] border-none rounded-xl px-6 focus:ring-2 focus:ring-blue-500 text-lg cursor-pointer"
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>Todos</option>
            <option>Mercearia</option>
            <option>Bebidas</option>
          </select>
        </div>

        {/* PRODUCT GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {products.map(p => (
            <button 
              key={p.id}
              onClick={() => addToCart(p)}
              className="bg-[#1e293b] p-4 rounded-2xl border border-transparent hover:border-blue-500 hover:bg-[#273549] transition-all group text-left relative overflow-hidden"
            >
              <span className="text-4xl mb-3 block">{p.emoji}</span>
              <h3 className="font-bold text-lg mb-1 truncate">{p.name}</h3>
              <p className="text-blue-400 font-black text-xl">R$ {p.price.toFixed(2)}</p>
              <p className={`text-xs mt-2 ${p.stock < 10 ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                {p.stock} unidades em estoque
              </p>
              <div className="absolute top-2 right-2 bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                + Adicionar
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: CART */}
      <div className="w-[450px] bg-[#1e293b] border-l border-slate-800 flex flex-col p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <ShoppingCart size={24} className="text-blue-500" />
          <h2 className="text-xl font-bold">Carrinho de Venda</h2>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 pr-2 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
              <ShoppingCart size={64} className="mb-4" />
              <p className="text-lg">Carrinho vazio</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="bg-[#0f172a] p-4 rounded-xl flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.emoji}</span>
                    <div>
                      <h4 className="font-bold text-sm leading-tight">{item.name}</h4>
                      <p className="text-xs text-slate-500">{item.qty}x R$ {item.price.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-blue-400">R$ {(item.price * item.qty).toFixed(2)}</span>
                    <button className="text-slate-600 hover:text-rose-500 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TOTALS & PAYMENT */}
        <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex justify-between text-slate-400">
            <span>Subtotal</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Desconto (F5)</span>
            <span className="text-emerald-500">- R$ 0,00</span>
          </div>
          <div className="h-[1px] bg-slate-800"></div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold">TOTAL</span>
            <span className="text-4xl font-black text-blue-500">R$ {total.toFixed(2)}</span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 pt-4">
            <button className="flex flex-col items-center justify-center gap-2 bg-[#1e293b] p-3 rounded-2xl hover:bg-slate-700 transition-colors">
              <Banknote size={20} /> <span className="text-[10px] font-bold">DINHEIRO</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-2 bg-[#1e293b] p-3 rounded-2xl hover:bg-slate-700 transition-colors">
              <CreditCard size={20} /> <span className="text-[10px] font-bold">CARTÃO</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-2 bg-[#1e293b] p-3 rounded-2xl hover:bg-slate-700 transition-colors">
              <QrCode size={20} /> <span className="text-[10px] font-bold">PIX</span>
            </button>
          </div>

          <button className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-xl shadow-lg shadow-blue-900/20 transition-all mt-4 transform active:scale-95">
            FINALIZAR VENDA (F10)
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDV;
