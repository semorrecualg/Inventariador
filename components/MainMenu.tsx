
import React, { useState } from 'react';
import { AppScreen, User, ScanFeedbackMode, DatabaseMode } from '../types';
import Modal from './Modal';
import BackButton from './BackButton';
import { 
  Search, 
  BarChart3, 
  LogOut, 
  ClipboardList, 
  Download, 
  Users,
  Settings,
  X,
  ShieldCheck,
  ChevronRight,
  DatabaseZap,
  Trash2,
  SlidersHorizontal,
  Tag,
  QrCode,
  ScanLine,
  Vibrate,
  Volume2,
  Battery,
  TrendingUp,
  ListChecks,
  Database,
  Cloud,
  Server
} from 'lucide-react';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  onClearDatabase: () => void;
  user: User | null;
  inventoryInfo: { count: number; totalDatabase: number; date: string | null };
  autoConfirmOnScan: boolean;
  onUpdateAutoConfirm: (val: boolean) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  scanFeedbackMode: ScanFeedbackMode;
  onUpdateScanFeedbackMode: (mode: ScanFeedbackMode) => void;
  initialDataMenuOpen?: boolean;
  databaseMode: DatabaseMode;
  onUpdateDatabaseMode: (mode: DatabaseMode) => void;
  selectedCompany: string | null;
}

const MainMenu: React.FC<MainMenuProps> = ({ 
  onNavigate, 
  onLogout, 
  onExport, 
  onClearDatabase, 
  user, 
  inventoryInfo, 
  autoConfirmOnScan, 
  onUpdateAutoConfirm, 
  isFullscreen, 
  onToggleFullscreen,
  scanFeedbackMode,
  onUpdateScanFeedbackMode,
  initialDataMenuOpen = false,
  databaseMode,
  onUpdateDatabaseMode,
  selectedCompany
}) => {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isAnalyticsMenuOpen, setIsAnalyticsMenuOpen] = useState(false);
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(initialDataMenuOpen);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const isAdmin = user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
  const hasData = inventoryInfo.totalDatabase > 0;

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn relative overflow-hidden">
      {/* TOP STATUS BAR */}
      <div className="px-5 pt-8 pb-2 bg-white flex items-center justify-between z-30">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center">
            <Database size={12} className="text-slate-400" />
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AUDITORIA</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-md flex items-center space-x-1">
            <ShieldCheck size={10} className="text-emerald-500" />
            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter">SAFE</span>
          </div>
          <div className="px-2 py-0.5 bg-accent-soft border border-accent/10 rounded-md">
            <span className="text-[8px] font-black text-accent uppercase tracking-tighter">v24.50 PRO</span>
          </div>
        </div>
      </div>

      {/* COMPANY NAME BAR */}
      <div className="px-5 py-2 bg-white border-b border-border z-30">
        <h2 className="text-[11px] font-black text-ink uppercase tracking-tight truncate">
          {selectedCompany || 'NENHUMA EMPRESA SELECIONADA'}
        </h2>
      </div>

      {/* USER PROFILE & IMMERSIVE TOGGLE (GREEN AREA MOVED UP) */}
      <div className="px-5 py-4 bg-white border-b border-border flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center p-1 border-2 border-emerald-500 rounded-2xl bg-white shadow-sm">
          <div className="w-12 h-12 bg-white border border-accent/10 rounded-xl flex items-center justify-center shadow-sm">
            <ShieldCheck size={24} className="text-accent" />
          </div>
          <div className="ml-3 pr-4">
            <p className="text-[8px] font-black text-accent uppercase tracking-[0.2em] mb-0.5">GBR Mobile</p>
            <h1 className="text-base font-black text-ink truncate max-w-[140px] tracking-tight uppercase">
              {user?.username || 'Operador'}
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* IMMERSIVE MODE "LIGHT" BUTTON */}
          <button 
            onClick={onToggleFullscreen}
            className="flex flex-col items-center group active:scale-95 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all shadow-lg ${isFullscreen ? 'bg-emerald-500 border-emerald-400 shadow-emerald-500/30' : 'bg-red-500 border-red-400 shadow-red-500/30'}`}>
              <ScanLine size={20} className="text-white" />
            </div>
            <span className={`text-[7px] font-black uppercase tracking-widest mt-1.5 ${isFullscreen ? 'text-emerald-600' : 'text-red-600'}`}>
              {isFullscreen ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="h-10 w-px bg-border mx-1" />

          <button 
            onClick={onLogout} 
            className="w-10 h-10 bg-red-50 border border-red-100 rounded-xl text-red-500 flex items-center justify-center active:scale-90 transition-all shadow-sm hover:bg-white"
            title="Sair do Sistema"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* ACTION BUTTONS BAR */}
      <div className="px-5 py-3 bg-bg-main border-b border-border flex items-center justify-between overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-2">
          {isAdmin && (
            <button 
              onClick={() => setIsDataMenuOpen(true)} 
              className="p-3 bg-white border border-border rounded-xl text-ink-muted active:scale-90 transition-all shadow-sm hover:text-accent hover:border-accent/20"
              title="Gestão e Manutenção de Dados"
            >
              <DatabaseZap size={20} />
            </button>
          )}
          <button 
            onClick={() => setIsAnalyticsMenuOpen(true)} 
            className="p-3 bg-white border border-border rounded-xl text-ink-muted active:scale-90 transition-all shadow-sm hover:text-accent hover:border-accent/20"
            title="Painéis e Rendimento"
          >
            <BarChart3 size={20} />
          </button>
          {isAdmin && (
            <button 
              onClick={() => setIsAdminMenuOpen(true)} 
              className="p-3 bg-white border border-border rounded-xl text-ink-muted active:scale-90 transition-all shadow-sm hover:text-accent hover:border-accent/20"
              title="Configurações do Sistema"
            >
              <Settings size={20} />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex flex-col items-end">
            <div className="flex items-center space-x-1.5">
              <div className={`w-2 h-2 rounded-full ${hasData ? 'bg-success shadow-sm shadow-success/20' : 'bg-slate-300'}`} />
              <span className="text-[10px] font-black text-ink uppercase tracking-widest">
                {hasData ? `${inventoryInfo.count} ATIVOS` : 'BASE VAZIA'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 no-scrollbar">
        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.INVENTORY)}
          className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-accent/20"
        >
          <div className="w-10 h-10 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-4 group-hover:bg-accent group-hover:text-white transition-colors">
            <ClipboardList size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[14px] font-bold text-ink uppercase tracking-tight">Inventário</h3>
            <p className="text-[9px] text-ink-muted uppercase font-bold tracking-widest mt-0.5">Conferência Física</p>
          </div>
          <ChevronRight size={16} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.LABELING)}
          className="w-full flex items-center p-4 bg-accent-soft border border-accent/10 rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-accent/20"
        >
          <div className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center mr-4 shadow-md">
            <Tag size={20} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[14px] font-bold text-accent uppercase tracking-tight">ETIQUETAR</h3>
            <p className="text-[9px] text-accent font-bold uppercase tracking-widest mt-0.5 italic">Itens sem plaqueta</p>
          </div>
          <ChevronRight size={16} className="text-accent group-hover:text-accent transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-3.5 bg-white border border-border rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-accent/20"
        >
          <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-4 group-hover:bg-accent group-hover:text-white transition-colors">
            <Search size={18} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[13px] font-bold text-ink uppercase tracking-tight">Consulta</h3>
            <p className="text-[8px] text-ink-muted uppercase font-bold tracking-widest mt-0.5">Busca de Ativo</p>
          </div>
          <ChevronRight size={14} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.ACCOUNT_RECONCILIATION)}
          className="w-full flex items-center p-3.5 bg-white border border-border rounded-2xl active:scale-[0.99] disabled:opacity-40 transition-all shadow-sm group hover:border-accent/20"
        >
          <div className="w-9 h-9 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-4 group-hover:bg-accent group-hover:text-white transition-colors">
            <ListChecks size={18} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[13px] font-bold text-ink uppercase tracking-tight">Conciliação por Conta</h3>
            <p className="text-[8px] text-ink-muted uppercase font-bold tracking-widest mt-0.5">Auditoria de Bens Não Etiquetáveis</p>
          </div>
          <ChevronRight size={14} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>
      </div>

      <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-center">
        <span className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.3em]">GBR Intelligent Systems</span>
      </div>

      {isAdminMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <div className="fixed top-8 left-6 z-[10001]">
            <BackButton onClick={() => setIsAdminMenuOpen(false)} label="Retornar" />
          </div>
          <div className="w-full max-w-sm space-y-3">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-accent-soft text-accent rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent/10 shadow-lg">
                  <ShieldCheck size={32} />
                </div>
                <h2 className="text-xl font-bold text-ink uppercase tracking-tight">Painel Administrativo</h2>
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.3em] mt-1.5">Protocolo de Segurança GBR</p>
              </div>
            
            <div className="space-y-2.5 max-h-[65vh] overflow-y-auto no-scrollbar pr-1">
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.FIELD_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><SlidersHorizontal size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Configurar Campos</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Controle de Edição</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.QR_CODE_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><QrCode size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Configurar QR Code</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Definir campos do QR</p>
                </div>
              </button>

              <div className="w-full p-4 bg-bg-main border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><ShieldCheck size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Auto-Conferência</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Registro Automático no Scan</p>
                  </div>
                </div>
                <div className="flex p-1 bg-white border border-slate-200 rounded-xl">
                  <button 
                    onClick={() => onUpdateAutoConfirm(true)}
                    className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${autoConfirmOnScan ? 'bg-accent text-white shadow-md' : 'text-slate-400'}`}
                  >
                    SIM
                  </button>
                  <button 
                    onClick={() => onUpdateAutoConfirm(false)}
                    className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${!autoConfirmOnScan ? 'bg-slate-400 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    NÃO
                  </button>
                </div>
              </div>
              

              <div className="w-full p-4 bg-bg-main border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Vibrate size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Feedback do Scanner</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Confirmação de Leitura</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-xl mb-2">
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.VIBRATE)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.VIBRATE ? 'bg-accent text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <Vibrate size={12} />
                    <span>Vibrar</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.SOUND)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.SOUND ? 'bg-accent text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <Volume2 size={12} />
                    <span>Som (Bip)</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.BOTH)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.BOTH ? 'bg-accent text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <div className="flex space-x-1">
                      <Vibrate size={10} />
                      <Volume2 size={10} />
                    </div>
                    <span>Ambos</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.NONE)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.NONE ? 'bg-slate-400 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    <X size={12} />
                    <span>Nenhum</span>
                  </button>
                </div>
                
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 flex items-start space-x-2">
                  <Battery size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[7px] font-bold text-amber-700 uppercase leading-relaxed tracking-wide">
                    Dica: O uso de <span className="text-amber-900">SOM</span> consome menos bateria que o <span className="text-amber-900">VIBRAR</span>.
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-4 text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Security Protocol</div>
          </div>
        </div>
      )}

      {isAnalyticsMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <button 
            onClick={() => setIsAnalyticsMenuOpen(false)} 
            className="fixed top-14 left-6 flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white font-bold uppercase text-[9px] tracking-widest active:scale-90 transition-all z-[10001] hover:bg-white/20"
          >
            <ChevronRight size={16} className="rotate-180" />
            Voltar
          </button>
          
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-accent text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent shadow-xl shadow-accent/20">
                <BarChart3 size={32} />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Análise e Painéis</h2>
              <p className="text-[9px] font-bold text-accent uppercase tracking-[0.3em] mt-1.5 opacity-70">Indicadores de Performance</p>
            </div>

            <div className="space-y-3">
              <button 
                disabled={!hasData} 
                onClick={() => { setIsAnalyticsMenuOpen(false); onNavigate(AppScreen.DASHBOARD); }} 
                className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left"
              >
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30">
                  <BarChart3 size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Painel de Progresso</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Acompanhamento Unitário</p>
                </div>
                <ChevronRight size={14} className="text-white/20" />
              </button>

              <button 
                disabled={!hasData} 
                onClick={() => { setIsAnalyticsMenuOpen(false); onNavigate(AppScreen.GLOBAL_PERFORMANCE); }} 
                className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left"
              >
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30">
                  <TrendingUp size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Rendimento Global</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Análise Diária de Auditoria</p>
                </div>
                <ChevronRight size={14} className="text-white/20" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isDataMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <button 
            onClick={() => setIsDataMenuOpen(false)} 
            className="fixed top-10 left-6 flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white font-bold uppercase text-[9px] tracking-widest active:scale-90 transition-all z-[10001] hover:bg-white/20"
          >
            <ChevronRight size={16} className="rotate-180" />
            Voltar
          </button>
          
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-accent text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent shadow-xl shadow-accent/20">
                <DatabaseZap size={32} />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Gestão e Manutenção</h2>
              <p className="text-[9px] font-bold text-accent uppercase tracking-[0.3em] mt-1.5 opacity-70">Operações de Banco de Dados</p>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar pr-1">
              {/* Modalidade de Acesso movida para cá */}
              <div className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl shadow-sm mb-3">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30 shadow-sm"><Database size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Modalidade de Acesso</h4>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Configuração de Banco de Dados</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button 
                    onClick={() => onUpdateDatabaseMode(DatabaseMode.INTERNAL)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${databaseMode === DatabaseMode.INTERNAL ? 'bg-slate-600/20 border-slate-500 text-slate-400 shadow-sm' : 'bg-white/5 border-white/10 text-white/40'}`}
                  >
                    <div className="flex items-center">
                      <Server size={14} className="mr-3" />
                      <span>1) Banco Interno Independente</span>
                    </div>
                    {databaseMode === DatabaseMode.INTERNAL && <div className="w-2 h-2 bg-slate-400 rounded-full shadow-[0_0_8px_rgba(148,163,184,0.8)]" />}
                  </button>
                  
                  <button 
                    onClick={() => onUpdateDatabaseMode(DatabaseMode.SUPABASE)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${databaseMode === DatabaseMode.SUPABASE ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-sm' : 'bg-white/5 border-white/10 text-white/40'}`}
                  >
                    <div className="flex items-center">
                      <Cloud size={14} className="mr-3" />
                      <span>2) Banco Externo - Supabase</span>
                    </div>
                    {databaseMode === DatabaseMode.SUPABASE && <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />}
                  </button>

                  <button 
                    onClick={() => onUpdateDatabaseMode(DatabaseMode.PROTHEUS_SUPABASE)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${databaseMode === DatabaseMode.PROTHEUS_SUPABASE ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 shadow-sm' : 'bg-white/5 border-white/10 text-white/40'}`}
                  >
                    <div className="flex items-center">
                      <ShieldCheck size={14} className="mr-3" />
                      <span>3) Protheus + Supabase</span>
                    </div>
                    {databaseMode === DatabaseMode.PROTHEUS_SUPABASE && <div className="w-2 h-2 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.8)]" />}
                  </button>
                </div>
                <div className="mt-3 p-2 bg-accent/10 border border-accent/20 rounded-lg">
                  <p className="text-[7px] font-bold text-accent uppercase leading-relaxed tracking-wide opacity-80">
                    Nota: A alteração da modalidade afeta o método de login e a sincronização de dados.
                  </p>
                </div>
              </div>

              <button onClick={() => { setIsDataMenuOpen(false); setIsAdminMenuOpen(false); onNavigate(AppScreen.USER_MANAGEMENT); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Users size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Acessos</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Gerir Usuários</p>
                </div>
              </button>

              <button disabled={!hasData} onClick={() => { setIsDataMenuOpen(false); setIsAdminMenuOpen(false); onExport(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Download size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Baixar base de dados</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Exportar XLS</p>
                </div>
              </button>

              <button onClick={() => { 
                setIsDataMenuOpen(false); 
                setIsAdminMenuOpen(false);
                onNavigate(AppScreen.LOAD_DATABASE); 
              }} className="w-full flex items-center p-4 bg-accent text-white rounded-2xl active:scale-[0.98] transition-all text-left shadow-xl shadow-accent/20">
                <div className="w-10 h-10 bg-white/20 text-white rounded-lg flex items-center justify-center mr-4"><DatabaseZap size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold uppercase tracking-tight">Carga Expert</h4>
                  <p className="text-[8px] font-bold text-white/70 uppercase tracking-widest mt-0.5">Importar Base Master</p>
                </div>
              </button>

              <button onClick={() => { 
                setIsClearConfirmOpen(true);
              }} className="w-full flex items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-red-500/20"><Trash2 size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-red-500 uppercase tracking-tight">Limpar Banco de Dados</h4>
                  <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-widest mt-0.5">Apagar Ativos do App</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={() => {
          setIsDataMenuOpen(false); 
          setIsAdminMenuOpen(false);
          onClearDatabase();
        }}
        title="Limpar Banco de Dados"
        message="ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário. Deseja continuar?"
        type="confirm"
        confirmText="Sim, Apagar Tudo"
        cancelText="Cancelar"
      />
    </div>
  );
};

export default MainMenu;
