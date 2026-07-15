// src/components/DatabaseProgressBar.tsx
import React from 'react';
import { Loader2, CheckCircle2, Database, ShieldCheck, HardDrive, Cpu } from 'lucide-react';

interface DatabaseProgressBarProps {
  totalAssets: number;
  currentProcessed: number;
  currentStep: 'DOWNLOAD' | 'BATCH_WRITE' | 'PROJECTION' | 'DISK_SAVE';
}

export const DatabaseProgressBar: React.FC<DatabaseProgressBarProps> = ({
  totalAssets,
  currentProcessed,
  currentStep
}) => {
  // Cálculo exato do progresso com base na Regra dos 200 Itens
  const progressPercent = totalAssets > 0 
    ? Math.min(Math.max(Math.round((currentProcessed / totalAssets) * 100), 0), 100) 
    : 0;

  // Mapeamento amigável das 4 etapas de engenharia local
  const steps = [
    { id: 'DOWNLOAD', label: 'Baixando dados da nuvem Supabase', icon: Database },
    { id: 'BATCH_WRITE', label: `Formatando lotes de I/O (${currentProcessed}/${totalAssets} ativos)`, icon: Cpu },
    { id: 'PROJECTION', label: 'Calculando chaves de malha e geocerca', icon: ShieldCheck },
    { id: 'DISK_SAVE', label: 'Gravando banco físico local de forma segura', icon: HardDrive },
  ] as const;

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 flex flex-col gap-6">
        
        {/* Cabeçalho */}
        <div className="text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center animate-bounce mb-3">
            <Database className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-tight">
            Preparando Banco Local
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Por favor, mantenha o aplicativo aberto e o celular ligado.
          </p>
        </div>

        {/* 📊 Painel Gráfico de Progresso */}
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Progresso do Disco
            </span>
            <span className="text-sm font-black text-gray-800 tabular-nums">
              {progressPercent}%
            </span>
          </div>
          
          {/* Trilha e Preenchimento da Barra */}
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300 ease-out shadow-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 📝 Checklist do Pipeline das 4 Etapas */}
        <div className="flex flex-col gap-3">
          {steps.map((step, idx) => {
            const StepIcon = step.icon;
            const isCompleted = idx < steps.findIndex(s => s.id === currentStep);
            const isActive = step.id === currentStep;

            return (
              <div 
                key={step.id} 
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isActive 
                    ? 'bg-blue-50/50 border-blue-200 text-blue-900 font-semibold' 
                    : isCompleted 
                      ? 'bg-gray-50/30 border-transparent text-gray-400' 
                      : 'bg-transparent border-transparent text-gray-400 opacity-50'
                }`}
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <StepIcon className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <span className="text-xs tracking-tight truncate">
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default DatabaseProgressBar;
