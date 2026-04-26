
import React, { useState } from 'react';
import { 
  Database, 
  Cloud, 
  FileSpreadsheet, 
  CheckCircle2,
  X,
  Palette,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingWizardProps {
  onComplete: () => void;
  onCancel?: () => void;
}

const steps = [
  {
    title: "Bem-vindo ao Futuro",
    subtitle: "AUDITORIA PATRIMONIAL 4.0",
    description: "Uma nova era na gestão de Ativo Imobilizado. Combinamos inteligência artificial com governança técnica para resultados precisos.",
    icon: <Sparkles size={48} className="text-white" />,
    gradient: "from-blue-600 to-indigo-700",
    lottiePlaceholder: "welcome"
  },
  {
    title: "Modo Mobile Puro",
    subtitle: "PADRÃO OFFLINE-FIRST",
    description: "Configuração padrão para auditores. Todos os seus dados permanecem seguros no SQLite local do dispositivo, garantindo velocidade máxima e zero dependência de internet.",
    features: [
      "100% Offline e Seguro",
      "Login Direto via Banco Local",
      "Scanner de Alta Precisão",
      "Processamento Instantâneo"
    ],
    icon: <Database size={48} className="text-white" />,
    gradient: "from-emerald-500 to-teal-600",
    lottiePlaceholder: "offline"
  },
  {
    title: "Infraestrutura Cloud",
    subtitle: "OPCIONAL PARA GESTORES",
    description: "Backup automático e colaboração multiusuário. Esta funcionalidade deve ser habilitada pelo administrador no painel de configurações avançadas.",
    features: [
      "Backup em Tempo Real",
      "Equipes Multiusuário",
      "Dashboard de Gestão",
      "Configurado pelo Gestor"
    ],
    icon: <Cloud size={48} className="text-white" />,
    gradient: "from-purple-600 to-pink-600",
    lottiePlaceholder: "cloud"
  },
  {
    title: "Carga Expert v25",
    subtitle: "INTELIGÊNCIA DE DADOS",
    description: "Importe milhares de ativos em segundos. Nosso motor de processamento valida e organiza sua base automaticamente.",
    icon: <FileSpreadsheet size={48} className="text-white" />,
    gradient: "from-amber-500 to-orange-600",
    lottiePlaceholder: "data"
  },
  {
    title: "Linguagem Visual",
    subtitle: "CÓDIGO DE CORES TÉCNICO",
    description: "Identifique o status de conservação e conferência instantaneamente através da nossa paleta semântica.",
    features: [
      "Verde: Ativo Conferido",
      "Vermelho: Divergência Crítica",
      "Amarelo: Pendente / Reparo",
      "Azul: Novo Item Detectado"
    ],
    icon: <Palette size={48} className="text-white" />,
    gradient: "from-cyan-500 to-blue-500",
    lottiePlaceholder: "design"
  },
  {
    title: "Tudo Configurado",
    subtitle: "PRONTO PARA O CAMPO",
    description: "Você está no comando. Explore as ferramentas e sinta o poder da auditoria inteligente nas suas mãos.",
    icon: <CheckCircle2 size={48} className="text-white" />,
    gradient: "from-indigo-600 to-violet-700",
    lottiePlaceholder: "ready"
  }
];

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(0);

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
      >
        {/* Close Button */}
        {onCancel && (
          <button 
            onClick={onCancel}
            className="absolute top-6 right-6 z-[1001] w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"
          >
            <X size={20} />
          </button>
        )}

        {/* Top Visual Area */}
        <div className={`h-64 sm:h-72 bg-gradient-to-br ${current.gradient} relative flex items-center justify-center overflow-hidden`}>
          {/* Animated Background Shapes */}
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-20 -left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              rotate: [0, -90, 0],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-20 -right-20 w-64 h-64 bg-black/10 rounded-full blur-3xl"
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.5, rotate: 10 }}
              className="relative z-10 flex flex-col items-center"
            >
              <div className="w-24 h-24 bg-white/20 backdrop-blur-xl rounded-[2.5rem] flex items-center justify-center shadow-2xl border border-white/30">
                {current.icon}
              </div>
              
              {/* Lottie-like Placeholder */}
              <div className="mt-4 flex space-x-1">
                {[1, 2, 3].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                    className="w-1 h-1 bg-white rounded-full"
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 sm:p-10 flex flex-col overflow-y-auto no-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col"
            >
              <div className="mb-2">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">
                  {current.subtitle}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-tight mb-4">
                {current.title}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-8">
                {current.description}
              </p>

              {current.features && (
                <div className="grid grid-cols-1 gap-3 mb-8">
                  {current.features.map((f, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center space-x-3 p-3 bg-slate-50 rounded-2xl border border-slate-100"
                    >
                      <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${current.gradient} flex items-center justify-center shadow-sm`}>
                        <CheckCircle2 size={12} className="text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{f}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Area */}
        <div className="p-8 border-t border-slate-100 flex flex-col space-y-6">
          {/* Progress Indicator */}
          <div className="flex justify-center space-x-2">
            {steps.map((_, i) => (
              <motion.div 
                key={i}
                animate={{ 
                  width: i === step ? 24 : 8,
                  backgroundColor: i === step ? '#2563eb' : '#e2e8f0'
                }}
                className="h-2 rounded-full"
              />
            ))}
          </div>

          <div className="flex items-center space-x-4">
            {step > 0 ? (
              <button 
                onClick={prevStep}
                className="px-6 py-4 bg-slate-50 text-slate-500 rounded-2xl font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all"
              >
                Voltar
              </button>
            ) : (
              <button 
                onClick={onCancel}
                className="px-6 py-4 bg-slate-50 text-slate-400 rounded-2xl font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all"
              >
                Pular
              </button>
            )}

            <button 
              onClick={nextStep}
              className={`flex-1 py-4 bg-gradient-to-r ${current.gradient} text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center space-x-3`}
            >
              <span>{step === steps.length - 1 ? 'Concluir' : 'Próximo'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingWizard;
