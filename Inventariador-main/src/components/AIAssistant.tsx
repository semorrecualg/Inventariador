import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Brain } from 'lucide-react';
import { getEnvironmentGuidance } from '../services/geminiService';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose }) => {
  const [guidance, setGuidance] = useState<string>('');

  const environment = import.meta.env.VITE_ENVIRONMENT || 'development';

  useEffect(() => {
    if (isOpen) {
      loadGuidance();
    }
  }, [isOpen]);

  const loadGuidance = async () => {
    try {
      const text = await getEnvironmentGuidance(environment);
      setGuidance(text);
    } catch {
      setGuidance("O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-bg-main/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white border border-border rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden relative"
          >
            {/* Header */}
            <div className="bg-accent p-6 text-white relative">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-widest">AI Concierge</h2>
                  <p className="text-[10px] font-bold text-white/70 uppercase tracking-tighter">Assistente Inteligente de Ambiente</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              {/* Guidance Section */}
              <div className="bg-accent-soft border border-accent/10 p-4 rounded-2xl flex gap-3">
                <Brain className="text-accent shrink-0" size={20} />
                <p className="text-xs text-ink font-medium leading-relaxed italic">
                  &ldquo;{guidance || 'Consultando o oráculo...'}&rdquo;
                </p>
              </div>

              <div className="text-center py-8">
                <div className="inline-flex p-4 bg-accent-soft rounded-full mb-4">
                  <Sparkles size={32} className="text-accent animate-pulse" />
                </div>
                <h3 className="text-sm font-black text-ink uppercase tracking-widest mb-2">Assistente de Inteligência</h3>
                <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest leading-relaxed max-w-[200px] mx-auto">
                  O assistente está pronto para ajudar na análise de dados e auditoria do seu inventário.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-slate-50 flex justify-center">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">Powered by Gemini 3.1 Flash</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AIAssistant;
