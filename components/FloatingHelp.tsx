
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, X, Info, Sparkles, ShieldCheck, Zap, Palette, MapPin } from 'lucide-react';
import { AppScreen } from '../types';

interface FloatingHelpProps {
  currentScreen: AppScreen;
  onCloseOnboarding: () => void;
  onOpenOnboarding: () => void;
  onOpenPalette: () => void;
  onOpenAIAssistant: () => void;
}

const FloatingHelp: React.FC<FloatingHelpProps> = ({ 
  currentScreen, 
  onCloseOnboarding, 
  onOpenOnboarding, 
  onOpenPalette,
  onOpenAIAssistant
}) => {
  const [isOpen, setIsOpen] = useState(false);

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
    <>
      <motion.div 
        drag
        dragMomentum={false}
        dragElastic={0.1}
        className="fixed bottom-6 right-6 z-[999]"
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all backdrop-blur-xl border ${
            isOpen 
              ? 'bg-white/20 border-white/30 text-white' 
              : 'bg-[#007AFF]/80 border-white/20 text-white animate-pulse-soft'
          }`}
        >
          {isOpen ? <X size={28} /> : <HelpCircle size={28} />}
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20, x: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20, x: 20 }}
              className="absolute bottom-20 right-0 z-[998] w-80 bg-[#1c1c1e]/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-8 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[#007AFF]/50" />
              
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 rounded-xl bg-[#007AFF]/20 flex items-center justify-center">
                  <Sparkles className="text-[#007AFF]" size={18} />
                </div>
                <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Dicas de Governança</h3>
              </div>

              <div className="space-y-5">
                {tips.map((tip, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start space-x-4"
                  >
                    <div className="mt-1 text-[#007AFF]/60">{tip.icon}</div>
                    <p className="text-[12px] text-white/60 leading-relaxed font-medium">{tip.text}</p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex flex-col space-y-4">
                <button 
                  onClick={() => {
                    onOpenAIAssistant();
                    setIsOpen(false);
                  }}
                  className="w-full py-4 bg-gradient-to-r from-[#4F46E5] to-[#2563EB] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center space-x-3 shadow-lg shadow-blue-500/20"
                >
                  <Sparkles size={14} />
                  <span>Assistente IA</span>
                </button>

                <button 
                  onClick={() => {
                    onOpenOnboarding();
                    setIsOpen(false);
                  }}
                  className="w-full py-4 bg-[#007AFF] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#007AFF]/90 transition-all flex items-center justify-center space-x-3 shadow-lg shadow-[#007AFF]/20"
                >
                  <Zap size={14} />
                  <span>Ver Onboarding Completo</span>
                </button>

                <button 
                  onClick={() => {
                    onOpenPalette();
                    setIsOpen(false);
                  }}
                  className="w-full py-4 bg-white/5 border border-white/10 text-white/70 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center space-x-3"
                >
                  <Palette size={14} />
                  <span>Guia de Cores</span>
                </button>

                <button 
                  onClick={() => {
                    onCloseOnboarding();
                    setIsOpen(false);
                  }}
                  className="text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-[#007AFF] transition-colors text-center mt-2"
                >
                  Não mostrar dicas novamente
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};

export default FloatingHelp;
