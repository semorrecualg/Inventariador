
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, User, Bot, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

const AIChatModal: React.FC<AIChatModalProps> = ({ isOpen, onClose, username }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `Olá ${username}, sou seu assistente de auditoria. Como posso ajudar você hoje?` }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    // Simulação de resposta da IA (Gemini Stream seria integrado aqui)
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Entendi sua solicitação. Estou analisando os dados do inventário para fornecer o melhor insight técnico." 
      }]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[2000]"
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: '30%' }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 h-[70%] bg-white rounded-t-[2.5rem] shadow-2xl z-[2001] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 ai-gradient rounded-xl shadow-lg shadow-ai-start/20">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink tracking-tight">Assistente IA</h2>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Google AI Studio • Gemini</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-8 py-6 space-y-8 no-scrollbar"
            >
              {messages.map((msg, i) => (
                <div key={i} className={`flex items-start space-x-4 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                    msg.role === 'assistant' ? 'bg-slate-50 text-ai-end' : 'bg-accent text-white'
                  }`}>
                    {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                  </div>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-ai-end shadow-sm">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                  <div className="bg-slate-50 h-10 w-24 rounded-2xl animate-pulse" />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-8 py-6 border-t border-slate-100 bg-white">
              <div className="flex items-center space-x-3 bg-slate-50 rounded-2xl px-4 py-2">
                <input 
                  type="text" 
                  placeholder="Pergunte algo sobre o inventário..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                    input.trim() && !isLoading ? 'ai-gradient shadow-lg shadow-ai-start/20' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AIChatModal;
