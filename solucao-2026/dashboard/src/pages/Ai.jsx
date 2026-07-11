import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

export default function Ai() {
  const [messages, setMessages] = useState([
    { from: 'ia', text: 'Olá! Sou a SOLUÇÃO IA. Pergunte qualquer coisa sobre seu negócio.', bullets: null, intent: 'welcome' },
  ]);
  const [prompts, setPrompts] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const user = auth.getUser();

  useEffect(() => {
    api.get('/api/ai/quick-prompts').then(r => setPrompts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (question) => {
    if (!question.trim() || loading) return;
    setMessages((m) => [...m, { from: 'user', text: question }]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/ask', { question });
      setMessages((m) => [...m, { from: 'ia', text: data.answer, bullets: data.bullets, intent: data.intent }]);
    } catch (err) {
      setMessages((m) => [...m, { from: 'ia', text: '⚠️ Erro ao consultar: ' + (err.response?.data?.error || err.message), bullets: null, intent: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); ask(input); };
  const clearChat = () => setMessages([{ from: 'ia', text: 'Conversa reiniciada. No que posso ajudar?', bullets: null, intent: 'welcome' }]);

  return (
    <div className="h-full flex">
      {/* Sidebar com perguntas rápidas */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">⚡ Perguntas rápidas</h2>
          <p className="text-xs text-slate-500 mt-1">Clique para perguntar instantaneamente</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {prompts.map((p) => (
            <button key={p.title} onClick={() => ask(p.prompt)} disabled={loading}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-lg text-sm text-slate-700 disabled:opacity-50 border border-transparent hover:border-slate-200">
              <span className="mr-2">{p.icon}</span>{p.title}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-slate-200">
          <button onClick={clearChat} className="w-full text-xs text-slate-500 hover:text-slate-700 py-2">🗑️ Limpar conversa</button>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-800">🤖 SOLUÇÃO IA</h1>
            <p className="text-xs text-slate-500">Assistente do {user?.tenantName} · responde com dados reais do banco</p>
          </div>
          <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Online
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m, i) => (
            <Message key={i} m={m} />
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-slate-200">
                <span className="inline-flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSubmit} className="bg-white border-t border-slate-200 p-4 flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading}
                 placeholder="Pergunte algo... ex: 'qual o faturamento de hoje?'"
                 className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
          <button type="submit" disabled={loading || !input.trim()}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-medium">
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}

function Message({ m }) {
  const isUser = m.from === 'user';
  // Negrito do **texto** estilo markdown bem leve
  const renderText = (t) => t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
      )}
      <div className={`max-w-2xl rounded-2xl px-4 py-3 shadow-sm ${
        isUser
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
      }`}>
        <p className="text-sm whitespace-pre-wrap">{renderText(m.text)}</p>
        {m.bullets && m.bullets.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {m.bullets.map((b, i) => (
              <li key={i} className={isUser ? 'text-blue-100' : 'text-slate-600'}>• {b}</li>
            ))}
          </ul>
        )}
      </div>
      {isUser && (
        <div className="w-9 h-9 bg-slate-700 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
          {(auth.getUser()?.name || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()}
        </div>
      )}
    </div>
  );
}
