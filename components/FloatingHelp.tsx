
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, X, Info, Sparkles, ShieldCheck, Zap, Palette } from 'lucide-react';
import { AppScreen } from '../types';

interface FloatingHelpProps {
  currentScreen: AppScreen;
  onCloseOnboarding: () => void;
  onOpenOnboarding: () => void;
  onOpenPalette: () => void;
}

const FloatingHelp: React.FC<FloatingHelpProps> = ({ currentScreen, onCloseOnboarding, onOpenOnboarding, onOpenPalette }) => {
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
          { icon: <Info size={14} />, text: "Configure seus campos personalizados no Painel Administrativo." }
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
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-all ${isOpen ? 'bg-ink text-white' : 'bg-accent text-white animate-pulse-soft'}`}
        >
          {isOpen ? <X size={24} /> : <HelpCircle size={24} />}
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20, x: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20, x: 20 }}
              className="absolute bottom-16 right-0 z-[998] w-72 bg-white/90 backdrop-blur-xl border border-border rounded-[2rem] shadow-2xl p-6 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-accent/10" />
              
              <div className="flex items-center space-x-2 mb-4">
                <Sparkles className="text-accent" size={18} />
                <h3 className="text-[10px] font-black text-ink uppercase tracking-[0.2em]">Dicas de Governança</h3>
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
                    <div className="mt-0.5 text-accent">{tip.icon}</div>
                    <p className="text-[11px] text-ink-muted leading-relaxed">{tip.text}</p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border flex flex-col space-y-3">
                <button 
                  onClick={() => {
                    onOpenOnboarding();
                    setIsOpen(false);
                  }}
                  className="w-full py-3 bg-accent/10 text-accent rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center justify-center space-x-2"
                >
                  <Zap size={12} />
                  <span>Ver Onboarding Completo</span>
                </button>

                <button 
                  onClick={() => {
                    onOpenPalette();
                    setIsOpen(false);
                  }}
                  className="w-full py-3 bg-bg-main border border-border text-ink-muted rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-accent hover:text-accent transition-all flex items-center justify-center space-x-2"
                >
                  <Palette size={12} />
                  <span>Guia de Cores</span>
                </button>

                <button 
                  onClick={() => {
                    onCloseOnboarding();
                    setIsOpen(false);
                  }}
                  className="text-[9px] font-bold text-ink-muted uppercase tracking-widest hover:text-accent transition-colors text-center"
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
