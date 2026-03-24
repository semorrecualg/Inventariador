
import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  Database, 
  Cloud, 
  FileSpreadsheet, 
  CheckCircle2,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Bem-vindo ao GBR v25",
      subtitle: "A solução definitiva para o controle de Ativo Imobilizado.",
      description: "Estamos prontos para transformar a forma como sua empresa gerencia o patrimônio. Vamos configurar seu primeiro acesso.",
      icon: <ShieldCheck size={48} className="text-accent" />,
      color: "bg-accent"
    },
    {
      title: "Modo INTERNO (Básico)",
      subtitle: "Ideal para o primeiro contato e testes.",
      description: "Nesta versão, você atua como um único auditor em campo. Todos os dados são salvos localmente no seu dispositivo. Perfeito para validar a usabilidade e o scanner.",
      features: [
        "1 Usuário Inventariador",
        "Armazenamento Local",
        "Carga Expert de Dados",
        "Relatórios em Excel"
      ],
      icon: <Database size={48} className="text-blue-500" />,
      color: "bg-blue-500"
    },
    {
      title: "O Pulo do Gato: SUPABASE",
      subtitle: "Colaboração em Tempo Real.",
      description: "A versão PLUS libera o poder da nuvem. Vários auditores trabalhando de forma independente, mas com total integração dos dados em tempo real.",
      features: [
        "Multi-usuários (Auditores Auxiliares)",
        "Sincronização em Nuvem",
        "Dashboard Centralizado",
        "Segurança de Nível Bancário"
      ],
      icon: <Cloud size={48} className="text-emerald-500" />,
      color: "bg-emerald-500"
    },
    {
      title: "Carga Expert de Dados",
      subtitle: "Sua base de dados em segundos.",
      description: "Para começar, você precisará de uma planilha Excel seguindo nosso modelo padrão. O Tenant ID (ID do locatário) será gerado automaticamente para sua empresa.",
      icon: <FileSpreadsheet size={48} className="text-amber-500" />,
      color: "bg-amber-500"
    },
    {
      title: "Tudo Pronto!",
      subtitle: "Você começará na versão INTERNO.",
      description: "Como administrador, você terá total controle. Explore as funcionalidades e, quando estiver pronto para escalar, ative o módulo SUPABASE.",
      icon: <CheckCircle2 size={48} className="text-accent" />,
      color: "bg-accent"
    }
  ];

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
    <div className="fixed inset-0 z-[1000] bg-bg-main flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-border">
        <motion.div 
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="w-full max-w-md flex flex-col items-center text-center"
        >
          <div className={`w-24 h-24 rounded-[2rem] ${current.color} bg-opacity-10 flex items-center justify-center mb-8 shadow-xl shadow-current/10 border border-current/20`}>
            {current.icon}
          </div>

          <h1 className="text-3xl font-black text-ink uppercase tracking-tighter mb-2 leading-none">
            {current.title}
          </h1>
          <p className="text-xs font-bold text-accent uppercase tracking-[0.2em] mb-6">
            {current.subtitle}
          </p>
          
          <div className="bg-white border border-border rounded-[2rem] p-8 shadow-sm mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 blur-3xl" />
            <p className="text-sm text-ink-muted leading-relaxed relative z-10">
              {current.description}
            </p>

            {current.features && (
              <div className="mt-6 space-y-3 text-left">
                {current.features.map((f, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className={`w-5 h-5 rounded-full ${current.color} bg-opacity-20 flex items-center justify-center`}>
                      <CheckCircle2 size={12} className={current.color.replace('bg-', 'text-')} />
                    </div>
                    <span className="text-[10px] font-bold text-ink uppercase tracking-widest">{f}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center space-x-4 w-full max-w-md mt-4">
        {step > 0 && (
          <div className="flex items-center space-x-3">
            <button 
              onClick={prevStep}
              className="p-5 bg-white border border-border text-ink rounded-2xl active:scale-95 transition-all flex items-center space-x-2"
            >
              <ChevronLeft size={20} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Voltar</span>
            </button>
          </div>
        )}
        <button 
          onClick={nextStep}
          className="flex-1 py-5 bg-accent text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center space-x-3"
        >
          <span>{step === steps.length - 1 ? 'Começar Agora' : 'Avançar'}</span>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-12 flex items-center space-x-2">
        <Zap size={12} className="text-amber-500" />
        <p className="text-[8px] font-bold text-ink-muted uppercase tracking-[0.3em]">
          GBR v25 • Enterprise Asset Intelligence
        </p>
      </div>
    </div>
  );
};

export default OnboardingWizard;
