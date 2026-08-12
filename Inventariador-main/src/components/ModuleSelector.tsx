
import React, { useState, useEffect } from 'react';
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
import { sqliteService } from '../services/sqliteService';
import { readVirtualSnapshot } from '../services/localDbService';
import { Capacitor } from '@capacitor/core';
import { logger } from '../utils/logger';

interface ModuleSelectorProps {
  onSelect: (module: AppModule) => void;
  onLogout: () => void;
  onOpenDatabaseManager?: () => void;
  username: string;
  userRole?: UserRole;
  isDatabaseEmpty?: boolean;
  /** Tenant do usuário logado — usado para escopar a checagem de dados (SRE: isolamento por contrato). */
  tenantid?: string;
  /** Proprietário global (admin): nunca é barrado pelo gate de primeira carga. */
  isOwner?: boolean;
}

const ModuleSelector: React.FC<ModuleSelectorProps> = ({ onSelect, onLogout, onOpenDatabaseManager, username, userRole, isDatabaseEmpty = false, tenantid = '', isOwner = false }) => {
  const [canAccessModules, setCanAccessModules] = useState<boolean>(!isDatabaseEmpty);

  useEffect(() => {
    setCanAccessModules(!isDatabaseEmpty);
  }, [isDatabaseEmpty]);

  useEffect(() => {
    let active = true;
    const runCheck = async () => {
      try {
        const dbMode = localStorage.getItem('app_database_mode') || 'INTERNAL';
        const isOnlineSession = dbMode === 'SUPABASE';
        // SRE ISOLAMENTO: a checagem é escopada ao tenant do usuário — nunca
        // pela contagem global (que poderia conter dados de outro contrato em
        // cache local, ex.: CICOPAL para um MASTER de CLIENTETESTE).
        let count = 0;
        if (tenantid) {
          count = await sqliteService.countAtivosByTenant(tenantid);
        } else {
          count = await sqliteService.getAssetCount();
          const isIframe = typeof window !== 'undefined' && window.self !== window.top;
          if (count === 0 && isIframe) {
            // Lê o snapshot virtual com fallback (localStorage → IndexedDB) para
            // cobrir cargas grandes cujo espelho foi persistido em IndexedDB.
            const virtualData = await readVirtualSnapshot();
            if (Array.isArray(virtualData)) count = virtualData.length;
          }
        }
        if (active) {
          // Módulos liberados apenas se o tenant tem dados locais OU a nuvem já
          // populou o inventário deste tenant (isDatabaseEmpty reflete o
          // inventário pós-sync).
          setCanAccessModules(count > 0 || (isOnlineSession && !isDatabaseEmpty));
        }
      } catch (e) {
        logger.error("Error checking asset count in ModuleSelector:", e);
      }
    };
    runCheck();
    return () => {
      active = false;
    };
  }, [tenantid, isDatabaseEmpty]);

  const isAuditor = userRole === UserRole.AUDITOR;
  const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.MASTER;

  // v24.50.8 - Interceptador SRE: acesso ao Gestor de Base.
  // WEB: navega direto para o Gestor (o vínculo de pasta é opcional e feito
  // dentro do Gestor, em "Vincular Pasta e Ver Planilhas") — sem exigir a
  // seleção de pasta antes, como o usuário espera ao abrir a gestão de base.
  // NATIVO (Android): mantém a barreira de vínculo físico existente.
  const handleDatabaseManagerClick = async () => {
    const isNative = Capacitor.isNativePlatform();

    if (!isNative) {
      if (onOpenDatabaseManager) {
        onOpenDatabaseManager();
      }
      return;
    }

    const hasFolderLinked = !!sessionStorage.getItem('gbr_physical_folder_name');
    if (!hasFolderLinked) {
      logger.warn(">>> [SRE-GUARD] Tentativa de acessar Gestor de Base sem pasta vinculada no Android. Forçando Picker...");
      try {
        const directoryHandle = await (window as any).showDirectoryPicker({ // eslint-disable-line @typescript-eslint/no-explicit-any
          mode: 'readwrite'
        });
        if (directoryHandle) {
          sessionStorage.setItem('gbr_physical_folder_name', directoryHandle.name);
          localStorage.setItem('gbr_physical_link_active', 'true');
          logger.info(`>>> [SRE-GUARD] Vínculo dinâmico estabelecido em trânsito: ${directoryHandle.name}`);
        } else {
          return; // Aborta navegação se o usuário cancelar
        }
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        logger.error(">>> [SRE-GUARD] Seletor cancelado ou bloqueado pelo sistema operacional.", err);
        return; // Bloqueia a navegação para evitar tela com erro
      }
    }

    // Se passou na barreira ou se for plataforma nativa, executa a rota canônica
    if (onOpenDatabaseManager) {
      onOpenDatabaseManager();
    }
  };

  // SRE ISOLAMENTO + PRIMEIRA CARGA: qualquer perfil não-dono cujo TENANT não
  // tenha dados (local ou nuvem) é bloqueado aqui — jamais vê dados de outro
  // contrato — e é direcionado à carga inicial (ADMIN/MASTER) ou a aguardar o
  // provisionamento (auditor/operador).
  if (!canAccessModules && !isOwner) {
    const canLoad = isAdmin && onOpenDatabaseManager;
    return (
      <div className="min-h-screen bg-bg-main flex flex-col p-6 animate-fadeIn justify-center items-center text-center">
        <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-[2rem] flex items-center justify-center mb-6 border border-indigo-100">
          <Database size={40} />
        </div>
        <h2 className="text-2xl font-black text-ink uppercase tracking-tight mb-2">
          {canLoad ? "Primeira Carga de Dados" : "Acesso Impeditivo"}
        </h2>
        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">
          {canLoad ? "SRE · Isolamento por Tenant" : "Base de dados do contrato vazia"}
        </p>
        <p className="text-ink-muted text-xs max-w-md mb-8 leading-relaxed font-bold uppercase">
          {canLoad
            ? "Nenhum dado foi encontrado para o seu contrato (tenantid). Para começar a operar, realize a primeira carga da base de dados através do Gestor de Base."
            : "O banco de dados do seu contrato está vazio. Solicite ao administrador para realizar a carga de dados inicial antes de prosseguir com o inventário."}
        </p>
        {canLoad && (
          <button
            onClick={onOpenDatabaseManager}
            className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Database size={16} />
            <span>GESTOR DE BASE — PRIMEIRA CARGA</span>
          </button>
        )}
        <button 
          onClick={onLogout}
          className="mt-4 px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all hover:bg-slate-50 cursor-pointer"
        >
          Sair do Sistema
        </button>
      </div>
    );
  }

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
                onClick={handleDatabaseManagerClick}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all border border-slate-200 active:scale-95 group"
                title="Gestor de Banco SQLite"
              >
                <Database size={16} className="group-hover:text-accent" />
                <span className="text-[10px] font-black uppercase tracking-widest">Gestor de Base</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Módulo Inventariador */}
          <button 
            disabled={!canAccessModules}
            onClick={() => canAccessModules && onSelect(AppModule.INVENTORY)}
            className={`group relative bg-white rounded-[2rem] p-8 text-left transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] overflow-hidden ${!canAccessModules ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98]'}`}
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
              disabled={!canAccessModules}
              onClick={() => canAccessModules && onSelect(AppModule.ASSET_CONTROL)}
              className={`group relative bg-white rounded-[2rem] p-8 text-left transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] overflow-hidden ${!canAccessModules ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98]'}`}
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
