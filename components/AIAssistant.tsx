import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Brain, Database, MessageSquare, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { generateTestAssets, getEnvironmentGuidance } from '../services/geminiService';
import { Asset, User } from '../types';
import { syncAssetsToCloud } from '../services/supabaseService';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onAssetsGenerated?: (newAssets: Asset[]) => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose, user, onAssetsGenerated }) => {
  const [guidance, setGuidance] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [theme, setTheme] = useState('Equipamentos de TI e Escritório');
  const [count, setCount] = useState(10);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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
      setGuidance("O assistente está offline no momento.");
    }
  };

  const handleGenerate = async () => {
    if (!user) return;
    
    setIsGenerating(true);
    setStatus('loading');
    try {
      const partialAssets = await generateTestAssets(theme, count);
      
      // Complementar com campos obrigatórios do sistema
      const fullAssets: Asset[] = partialAssets.map((pa, idx) => ({
        ...pa,
        id: `TEST-${Date.now()}-${idx}`,
        _tenantid: user.tenantid,
        _unitid: user.unitid || 'MATRIZ',
        _conferido: false,
        _plaquetado: false,
        _isNew: true,
        _dataLeitura: new Date().toISOString()
      })) as Asset[];

      // Salvar no Supabase
      await syncAssetsToCloud(fullAssets, user.tenantid);
      
      setStatus('success');
      if (onAssetsGenerated) {
        onAssetsGenerated(fullAssets);
      }
      
      // Fechar após 2 segundos em caso de sucesso
      setTimeout(() => {
        onClose();
        setStatus('idle');
      }, 2000);
    } catch (error: unknown) {
      console.error(error);
      setStatus('error');
      const msg = error instanceof Error ? error.message : 'Erro ao gerar ativos';
      setErrorMessage(msg);
    } finally {
      setIsGenerating(false);
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
                  <h2 className="text-lg font-black uppercase tracking-widest">GBR AI Concierge</h2>
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

              {environment === 'staging' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database size={16} className="text-accent" />
                    <h3 className="text-xs font-black text-ink uppercase tracking-widest">Gerador de Massa de Testes</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-black text-ink-muted uppercase tracking-widest mb-1 block">Tema dos Ativos</label>
                      <input 
                        type="text" 
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        placeholder="Ex: Frota de Veículos, TI, Móveis..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                      />
                    </div>
                    
                    <div>
                      <label className="text-[9px] font-black text-ink-muted uppercase tracking-widest mb-1 block">Quantidade ({count})</label>
                      <input 
                        type="range" 
                        min="1" 
                        max="20" 
                        value={count}
                        onChange={(e) => setCount(parseInt(e.target.value))}
                        className="w-full accent-accent"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || status === 'success'}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95 ${
                      status === 'success' 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-accent text-white hover:opacity-90'
                    }`}
                  >
                    {status === 'loading' ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Gerando Dados...
                      </>
                    ) : status === 'success' ? (
                      <>
                        <CheckCircle2 size={18} />
                        Dados Inseridos!
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Popular Staging via IA
                      </>
                    )}
                  </button>

                  {status === 'error' && (
                    <div className="flex items-center gap-2 text-red-600 justify-center">
                      <AlertCircle size={14} />
                      <span className="text-[10px] font-bold uppercase">{errorMessage}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="inline-flex p-3 bg-slate-100 rounded-full mb-3">
                    <MessageSquare size={24} className="text-slate-400" />
                  </div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                    O gerador de dados está disponível apenas no ambiente de Staging.
                  </p>
                </div>
              )}
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
