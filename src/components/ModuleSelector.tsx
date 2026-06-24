
import React from 'react';
import { AppModule, UserRole } from '../types';
import { 
  ClipboardCheck, 
  Calculator, 
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Database
} from 'lucide-react';

interface ModuleSelectorProps {
  onSelect: (module: AppModule) => void;
  onLogout: () => void;
  onOpenDatabaseManager?: () => void;
  onOpenDatabaseLoader?: () => void;
  username: string;
  userRole?: UserRole;
}

const ModuleSelector: React.FC<ModuleSelectorProps> = ({ onSelect, onLogout, onOpenDatabaseManager, onOpenDatabaseLoader, username, userRole }) => {
  const isAuditor = userRole === UserRole.AUDITOR;
  const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.MASTER;
  return (
    <div className="min-h-screen bg-bg-main flex flex-col p-6 animate-fadeIn overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center text-accent">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink tracking-tight">Auditoria <span className="text-accent">Inteligente</span></h1>
            <p className="text-[10px] font-medium text-ink-muted uppercase tracking-widest">SaaS Enterprise</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-10 h-10 bg-white border border-slate-100 rounded-xl text-slate-400 flex items-center justify-center active:scale-90 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <ArrowRight size={20} className="rotate-180" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full py-4">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-ink mb-2 tracking-tight">Bem-vindo, {username}</h2>
            <p className="text-ink-muted uppercase font-bold text-xs tracking-[0.2em]">Selecione o módulo de trabalho</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && onOpenDatabaseManager && (
              <button 
                onClick={onOpenDatabaseManager}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all border border-slate-200 active:scale-95 group"
                title="Gestor de Banco SQLite"
              >
                <Database size={16} className="group-hover:text-accent" />
                <span className="text-[10px] font-black uppercase tracking-widest">Gestor de Base</span>
              </button>
            )}

            {isAdmin && onOpenDatabaseLoader && (
              <button 
                onClick={onOpenDatabaseLoader}
                className="flex items-center space-x-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 rounded-xl text-amber-700 transition-all border border-amber-200 active:scale-95 group"
                title={sessionStorage.getItem('gbr_admin_scope') === 'TENANT_MASTER' ? "Carga Expert Master (Inquilinato Ativo)" : "Carga Expert Mestra"}
              >
                <Database size={16} className="text-amber-500 group-hover:text-amber-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {sessionStorage.getItem('gbr_admin_scope') === 'TENANT_MASTER' ? "Carga Master" : "Carga Expert"}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Módulo Inventariador */}
          <button 
            onClick={() => onSelect(AppModule.INVENTORY)}
            className="group relative bg-white rounded-[2rem] p-8 text-left transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] overflow-hidden"
          >
            <div className="relative z-10">
              <div className="w-16 h-16 bg-accent-soft rounded-2xl flex items-center justify-center text-accent mb-6 group-hover:bg-accent group-hover:text-white transition-all">
                <ClipboardCheck size={32} />
              </div>
              
              <h3 className="text-2xl font-bold text-ink mb-3 tracking-tight">INVENTARIADOR</h3>
              <p className="text-ink-muted text-sm mb-8 leading-relaxed">
                Controle físico, etiquetagem, geolocalização e auditoria de campo em tempo real.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  {['GPS', 'QR', 'IMG'].map(tag => (
                    <div key={tag} className="px-3 py-1 rounded-full border-2 border-white bg-slate-50 text-[9px] font-bold text-ink-muted uppercase tracking-widest">
                      {tag}
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
              className="group relative bg-white rounded-[2rem] p-8 text-left transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] overflow-hidden"
            >
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 mb-6 group-hover:bg-ink group-hover:text-white transition-all">
                  <Calculator size={32} />
                </div>
                
                <h3 className="text-2xl font-bold text-ink mb-3 tracking-tight">CONTROLE DE ATIVO</h3>
                <p className="text-ink-muted text-sm mb-8 leading-relaxed">
                  Gestão contábil, cálculos de depreciação, correção monetária e relatórios fiscais.
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex space-x-3">
                    <TrendingUp size={16} className="text-slate-300" />
                    <BarChart3 size={16} className="text-slate-300" />
                  </div>
                  <div className="flex items-center space-x-2 text-ink font-bold text-xs uppercase tracking-widest">
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
      <div className="mt-auto pt-8 text-center border-t border-slate-50">
        <p className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">
          Auditoria Inteligente • SaaS Enterprise • 2026
        </p>
      </div>
    </div>
  );
};

export default ModuleSelector;
