import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Building2, Lock, Zap } from 'lucide-react';

interface LoginWelcomeProps {
  onGetStarted: () => void;
  onDemoMode: () => void;
  isLoading?: boolean;
  appLogo?: string;
}

export const LoginWelcome: React.FC<LoginWelcomeProps> = ({ 
  onGetStarted, 
  onDemoMode,
  isLoading = false,
  appLogo = 'https://imgs.search.brave.com/4F5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5KA/rs:fit:200:200:1/g:ce/aHR0cHM6Ly9jZG4tY29udGVudC5pY29u/cHJvcHMuY29tL2ljb25zL3NhbGVzLzM2L2pz/b24tZmlsZS1pY29uLmljby5wbmc'
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-50 flex flex-col items-center justify-center px-6 py-8">
      {/* Logo Section */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="w-24 h-24 bg-white rounded-3xl shadow-lg shadow-blue-200/40 flex items-center justify-center p-2 border border-blue-100">
          <img 
            src={appLogo}
            alt="Logo"
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%232563EB" width="100" height="100" rx="20"/><text x="50" y="60" font-size="40" font-weight="bold" fill="white" text-anchor="middle">GBR</text></svg>';
            }}
          />
        </div>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="text-4xl font-bold text-slate-900 text-center mb-3 leading-tight"
      >
        Bem-vindo ao
        <br />
        <span className="text-blue-600">Inventariador</span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="text-lg text-slate-600 text-center mb-12 max-w-xs leading-relaxed"
      >
        Sistema inteligente de gestão de ativos e inventário em tempo real
      </motion.p>

      {/* Features */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="w-full max-w-xs mb-12 space-y-4"
      >
        {[
          { icon: Building2, title: 'Gestão Completa', desc: 'Controle total de ativos' },
          { icon: Lock, title: 'Segurança', desc: 'Autenticação biométrica' },
          { icon: Zap, title: 'Rápido', desc: 'Sem necessidade de internet' }
        ].map((feature, idx) => (
          <motion.div
            key={idx}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 + idx * 0.1 }}
            className="flex items-start gap-3 p-3 rounded-xl bg-white/60 backdrop-blur-sm border border-blue-100/50"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <feature.icon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900">{feature.title}</div>
              <div className="text-sm text-slate-600">{feature.desc}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="w-full max-w-xs space-y-3"
      >
        <button
          onClick={onGetStarted}
          disabled={isLoading}
          className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              Continuar
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        <button
          onClick={onDemoMode}
          disabled={isLoading}
          className="w-full py-4 px-6 bg-white border-2 border-slate-200 text-slate-900 font-bold rounded-2xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Modo Demonstração
        </button>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="text-xs text-slate-500 text-center mt-8 px-4"
      >
        Versão 2.6.0 | GBR Auditoria © 2024
      </motion.p>
    </div>
  );
};

export default LoginWelcome;
