
import React from 'react';
import { AppModule, UserRole } from '../types';
import { 
  ClipboardCheck, 
  Calculator, 
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface ModuleSelectorProps {
  onSelect: (module: AppModule) => void;
  onLogout: () => void;
  username: string;
  userRole?: UserRole;
}

const ModuleSelector: React.FC<ModuleSelectorProps> = ({ onSelect, onLogout, username, userRole }) => {
  const isAuditor = userRole === UserRole.AUDITOR;
  return (
    <div className="min-h-screen bg-bg-main flex flex-col p-4 sm:p-6 animate-fadeIn overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-12">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink tracking-tight uppercase">GBR Audit <span className="text-accent">v24</span></h1>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Enterprise Asset Management</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="px-4 py-2 bg-white border border-border rounded-xl text-[10px] font-bold text-ink-muted uppercase tracking-widest hover:bg-danger/5 hover:text-danger hover:border-danger/20 transition-all active:scale-95"
        >
          Sair
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full py-4">
        <div className="mb-6 sm:mb-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-1 sm:mb-2 tracking-tight">Bem-vindo, {username}</h2>
          <p className="text-ink-muted uppercase font-bold text-[10px] sm:text-xs tracking-[0.2em]">Selecione o módulo de trabalho</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Módulo Inventariador */}
          <button 
            onClick={() => onSelect(AppModule.INVENTORY)}
            className="group relative bg-white border border-border rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 text-left transition-all hover:border-mod-inventory hover:shadow-2xl hover:shadow-mod-inventory/10 active:scale-[0.98] overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-mod-inventory/5 rounded-full -mr-16 -mt-16 sm:-mr-24 sm:-mt-24 blur-3xl group-hover:bg-mod-inventory/10 transition-colors" />
            
            <div className="relative z-10">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-mod-inventory/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-mod-inventory mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <ClipboardCheck size={28} className="sm:w-8 sm:h-8" />
              </div>
              
              <h3 className="text-xl sm:text-2xl font-bold text-ink mb-2 sm:mb-3 tracking-tight uppercase">Inventariador</h3>
              <p className="text-ink-muted text-xs sm:text-sm mb-4 sm:mb-8 leading-relaxed">
                Controle físico, etiquetagem, geolocalização e auditoria de campo em tempo real.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-bg-main flex items-center justify-center text-[10px] font-bold text-ink-muted">
                      {i === 1 ? 'GPS' : i === 2 ? 'QR' : 'IMG'}
                    </div>
                  ))}
                </div>
                <div className="flex items-center space-x-2 text-accent font-bold text-xs uppercase tracking-widest">
                  <span>Acessar</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>
          </button>

          {/* Módulo Controle de Ativo Imobilizado */}
          {!isAuditor && (
            <button 
              onClick={() => onSelect(AppModule.ASSET_CONTROL)}
            className="group relative bg-slate-900 border border-slate-800 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 text-left transition-all hover:border-mod-control/50 hover:shadow-2xl hover:shadow-mod-control/10 active:scale-[0.98] overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-mod-control/10 rounded-full -mr-16 -mt-16 sm:-mr-24 sm:-mt-24 blur-3xl group-hover:bg-mod-control/20 transition-colors" />
            
            <div className="relative z-10">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-mod-control/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-mod-control mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <Calculator size={28} className="sm:w-8 sm:h-8" />
              </div>
              
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3 tracking-tight uppercase">Controle de Ativo</h3>
              <p className="text-slate-400 text-xs sm:text-sm mb-4 sm:mb-8 leading-relaxed">
                Gestão contábil, cálculos de depreciação, correção monetária e relatórios fiscais.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex space-x-3">
                  <TrendingUp size={16} className="text-emerald-500/50" />
                  <BarChart3 size={16} className="text-emerald-500/50" />
                </div>
                <div className="flex items-center space-x-2 text-emerald-500 font-bold text-xs uppercase tracking-widest">
                  <span>Acessar</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>
          </button>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-auto pt-8 text-center border-t border-border/50">
        <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.3em]">
          GBR Audit System • Gestão de Ativos Imobilizados • 2026
        </p>
      </div>
    </div>
  );
};

export default ModuleSelector;
