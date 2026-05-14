
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info, Sparkles, ShieldCheck, Zap, Palette, MapPin } from 'lucide-react';
import { AppScreen } from '../types';

interface FloatingHelpProps {
  currentScreen: AppScreen;
  onCloseOnboarding: () => void;
  onOpenOnboarding: () => void;
  onOpenPalette: () => void;
  onOpenAIAssistant: () => void;
  isOpen: boolean;
  onToggle: (val: boolean) => void;
}

const FloatingHelp: React.FC<FloatingHelpProps> = ({ 
  currentScreen, 
  onCloseOnboarding, 
  onOpenOnboarding, 
  onOpenPalette,
  onOpenAIAssistant,
  isOpen,
  onToggle
}) => {
  const getTips = (screen: AppScreen) => {
    switch (screen) {
      case AppScreen.LOGIN:
        return [
          { icon: <ShieldCheck size={14} />, text: "Use o Magic Link para entrar sem senha via e-mail." },
          { icon: <Zap size={14} />, text: "O modo SUPABASE sincroniza dados em tempo real." }
        ];
      case AppScreen.MAIN_MENU:
        return [
          { icon: <Sparkles size={14} />, text: "O 'POP Interativo' contém o manual completo do sistema." },
          { icon: <MapPin size={14} />, text: "Use 'Simular GPS' apenas para testes em Desktop." }
        ];
      case AppScreen.INVENTORY:
        return [
          { icon: <Zap size={14} />, text: "Dê um toque longo em um item para ver detalhes rápidos." },
          { icon: <ShieldCheck size={14} />, text: "O GPS é capturado automaticamente ao confirmar um item." }
        ];
      default:
        return [
          { icon: <Info size={14} />, text: "Seus dados estão protegidos por criptografia AES-256." },
          { icon: <ShieldCheck size={14} />, text: "App em conformidade com a LGPD v24.50." }
        ];
    }
  };

  const tips = getTips(currentScreen);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onToggle(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000]"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="fixed top-24 right-6 z-[1001] w-80 bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-6 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-[#007AFF]" />
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-[#007AFF]/20 flex items-center justify-center">
                  <Sparkles className="text-[#007AFF]" size={18} />
                </div>
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Centro de Ajuda</h3>
              </div>
              <button 
                onClick={() => onToggle(false)}
                className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {tips.map((tip, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start space-x-3"
                >
                  <div className="mt-0.5 text-[#007AFF]/60 shrink-0">{tip.icon}</div>
                  <p className="text-[11px] text-white/60 leading-tight font-medium">{tip.text}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 flex flex-col space-y-3">
              <button 
                onClick={() => {
                  onOpenAIAssistant();
                  onToggle(false);
                }}
                className="w-full py-4 bg-gradient-to-r from-[#4F46E5] to-[#2563EB] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center space-x-3 shadow-lg shadow-blue-500/20"
              >
                <Sparkles size={14} />
                <span>Assistente IA</span>
              </button>

              <button 
                onClick={() => {
                  onOpenOnboarding();
                  onToggle(false);
                }}
                className="w-full py-4 bg-[#007AFF] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#007AFF]/90 transition-all flex items-center justify-center space-x-3 shadow-lg shadow-[#007AFF]/20"
              >
                <Zap size={14} />
                <span>Onboarding Completo</span>
              </button>

              <button 
                onClick={() => {
                  onOpenPalette();
                  onToggle(false);
                }}
                className="w-full py-4 bg-white/5 border border-white/10 text-white/70 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center space-x-3"
              >
                <Palette size={14} />
                <span>Guia de Cores</span>
              </button>

              <button 
                onClick={() => {
                  onCloseOnboarding();
                  onToggle(false);
                }}
                className="text-[9px] font-black text-white/20 uppercase tracking-widest hover:text-[#007AFF] transition-colors text-center mt-2"
              >
                Não mostrar dicas novamente
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default FloatingHelp;
