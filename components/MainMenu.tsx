
import React, { useState } from 'react';
import { AppScreen, User, ScanFeedbackMode, DatabaseMode, UserRole } from '../types';
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
  Server,
  BookOpen,
  Map as MapIcon,
  RefreshCw,
  ShieldAlert,
  ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface MainMenuProps {
  onNavigate: (target: AppScreen) => void;
  onLogout: () => void;
  onExport: () => void;
  onBackup: () => void;
  onDownloadCloudData: () => void;
  onRestore: (file: File) => void;
  onClearDatabase: () => void;
  onClearMultipleUnits?: (units: string[]) => void;
  user: User | null;
  units: { name: string; hasData: boolean }[];
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
  selectedUnit: string | null;
  darkMode: boolean;
  onUpdateDarkMode: (val: boolean) => void;
  batterySaver: boolean;
  onUpdateBatterySaver: (val: boolean) => void;
  onSyncCloud?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string | null;
  syncError?: string | null;
  hasSupabase?: boolean;
  protheusIntegrationEnabled: boolean;
  onUpdateProtheusIntegration: (val: boolean) => void;
  protheusApiUrl: string;
  onUpdateProtheusApiUrl: (val: string) => void;
  mandatoryPhotoOnDivergence: boolean;
  onUpdateMandatoryPhotoOnDivergence: (val: boolean) => void;
  mandatoryPhotoOnNewItem: boolean;
  onUpdateMandatoryPhotoOnNewItem: (val: boolean) => void;
  pendingPhotosCount?: number;
  onProcessSyncQueue?: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ 
  onNavigate, 
  onLogout, 
  onExport, 
  onBackup,
  onDownloadCloudData,
  onRestore,
  onClearDatabase, 
  onClearMultipleUnits,
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
  selectedUnit,
  darkMode,
  onUpdateDarkMode,
  batterySaver,
  onUpdateBatterySaver,
  onSyncCloud,
  isSyncing = false,
  lastSyncTime,
  syncError,
  hasSupabase = false,
  protheusIntegrationEnabled,
  onUpdateProtheusIntegration,
  protheusApiUrl,
  onUpdateProtheusApiUrl,
  units,
  mandatoryPhotoOnDivergence,
  onUpdateMandatoryPhotoOnDivergence,
  mandatoryPhotoOnNewItem,
  onUpdateMandatoryPhotoOnNewItem,
  pendingPhotosCount = 0,
  onProcessSyncQueue
}) => {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isAnalyticsMenuOpen, setIsAnalyticsMenuOpen] = useState(false);
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(initialDataMenuOpen);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isSelectiveClearOpen, setIsSelectiveClearOpen] = useState(false);
  const [selectedToClear, setSelectedToClear] = useState<string[]>([]);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const isAdmin = user?.role === UserRole.ADMIN || user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com";
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
          {hasSupabase && (
            <div className={`px-2 py-0.5 rounded-md flex items-center space-x-1 border ${
              isSyncing 
                ? 'bg-blue-50 border-blue-100 text-blue-500 animate-pulse' 
                : syncError 
                  ? 'bg-red-50 border-red-100 text-red-500' 
                  : 'bg-emerald-50 border-emerald-100 text-emerald-500'
            }`}>
              {isSyncing ? (
                <Cloud size={10} className="animate-bounce" />
              ) : syncError ? (
                <X size={10} />
              ) : (
                <ShieldCheck size={10} />
              )}
              <span className="text-[8px] font-black uppercase tracking-tighter">
                {isSyncing ? 'SYNCING' : syncError ? 'ERROR' : 'SYNC OK'}
              </span>
            </div>
          )}
          {hasSupabase && (
            <button 
              onClick={onSyncCloud}
              disabled={isSyncing}
              className={`p-1 rounded-md transition-all active:scale-90 ${isSyncing ? 'opacity-50' : 'hover:bg-slate-100'}`}
              title="Sincronizar Agora"
            >
              <DatabaseZap size={12} className={`${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400'}`} />
            </button>
          )}
          {lastSyncTime && !isSyncing && !syncError && (
            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">
              {new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <div className="px-2 py-0.5 bg-accent-soft border border-accent/10 rounded-md">
            <span className="text-[8px] font-black text-accent uppercase tracking-tighter">v24.50 PRO</span>
          </div>
        </div>
      </div>

      {/* COMPANY NAME BAR */}
      <div className="px-5 py-2 bg-white border-b border-border z-30 flex items-center justify-between">
        <h2 className="text-[11px] font-black text-ink uppercase tracking-tight truncate">
          {selectedUnit || 'NENHUMA UNIDADE SELECIONADA'}
        </h2>
        <div className="flex items-center">
          <img 
            src="https://flagcdn.com/w40/br.png" 
            alt="Brasil" 
            className="h-6 w-auto rounded-sm shadow-sm"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* USER PROFILE & IMMERSIVE TOGGLE (GREEN AREA MOVED UP) */}
      <div className="px-5 py-4 bg-white border-b border-border flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center p-1 border-2 border-emerald-500 rounded-2xl bg-white shadow-sm">
          <div className="w-12 h-12 bg-white border border-accent/10 rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-1">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div className="ml-3 pr-4">
            <p className="text-[8px] font-black text-accent uppercase tracking-[0.2em] mb-0.5">GBR Mobile</p>
            <h1 className="text-base font-black text-ink truncate max-w-[140px] tracking-tight uppercase leading-tight">
              {user?.username || 'Operador'}
            </h1>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1 rounded border border-blue-100">
                UNIDADE: {user?.tenantId || 'default'}
              </span>
              {user?.role === UserRole.ADMIN && (
                <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1 rounded border border-emerald-100">
                  ADMIN
                </span>
              )}
            </div>
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
          {pendingPhotosCount > 0 && (
            <button 
              onClick={onProcessSyncQueue}
              className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-600 active:scale-90 transition-all shadow-sm hover:bg-amber-100 flex items-center space-x-2 animate-pulse"
              title="Sincronizar Fotos Pendentes"
            >
              <Cloud size={20} />
              <span className="text-[10px] font-black">{pendingPhotosCount}</span>
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

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 no-scrollbar">
        {/* CLOUD SYNC STATUS CARD */}
        {databaseMode !== DatabaseMode.INTERNAL && (
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isSyncing ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                  <Cloud size={12} />
                </div>
                <span className="text-[8px] font-black text-slate-900 uppercase tracking-widest">Status da Nuvem</span>
              </div>
              <div className="flex items-center space-x-2">
                {isSyncing && (
                  <span className="text-[7px] font-bold text-blue-500 uppercase animate-pulse">Sincronizando...</span>
                )}
                <button 
                  onClick={onSyncCloud}
                  disabled={isSyncing}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200 active:scale-90 transition-all shadow-sm"
                >
                  <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm">
                <p className="text-[6px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Unidade Ativa</p>
                <p className="text-[9px] font-black text-slate-900 truncate">{user?.tenantId || 'default'}</p>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm">
                <p className="text-[6px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Ativos na Nuvem</p>
                <p className="text-[9px] font-black text-slate-900">{inventoryInfo.totalDatabase}</p>
              </div>
            </div>

            {syncError && (
              <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-100 flex items-center space-x-2">
                <ShieldAlert size={10} className="text-red-500" />
                <p className="text-[7px] font-bold text-red-600 uppercase tracking-tight leading-tight">
                  {syncError}
                </p>
              </div>
            )}
          </div>
        )}

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
                <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent/10 shadow-lg overflow-hidden p-1">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
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

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.USER_MANAGEMENT); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Users size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Acessos</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Gerir Usuários</p>
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
                  <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Tag size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Evidência Fotográfica</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Obrigatoriedade de Foto</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button 
                    onClick={() => onUpdateMandatoryPhotoOnDivergence(!mandatoryPhotoOnDivergence)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${mandatoryPhotoOnDivergence ? 'bg-accent-soft border-accent/20 text-accent shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    <span>Obrigatório em Divergência</span>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${mandatoryPhotoOnDivergence ? 'bg-accent' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${mandatoryPhotoOnDivergence ? 'left-6' : 'left-1'}`} />
                    </div>
                  </button>
                  <button 
                    onClick={() => onUpdateMandatoryPhotoOnNewItem(!mandatoryPhotoOnNewItem)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${mandatoryPhotoOnNewItem ? 'bg-accent-soft border-accent/20 text-accent shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    <span>Obrigatório em Novo Item</span>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${mandatoryPhotoOnNewItem ? 'bg-accent' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${mandatoryPhotoOnNewItem ? 'left-6' : 'left-1'}`} />
                    </div>
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

                <div className="w-full p-4 bg-bg-main border border-slate-200 rounded-2xl shadow-sm">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Battery size={16} /></div>
                    <div className="flex-1">
                      <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Otimização de Energia</h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Performance e Bateria</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button 
                      onClick={() => onUpdateDarkMode(!darkMode)}
                      className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${darkMode ? 'bg-slate-800 border-slate-700 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      <div className="flex items-center">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center mr-3 ${darkMode ? 'bg-slate-700 text-yellow-400' : 'bg-slate-100 text-slate-400'}`}>
                          {darkMode ? '🌙' : '☀️'}
                        </div>
                        <span>Modo Escuro (OLED)</span>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${darkMode ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${darkMode ? 'left-6' : 'left-1'}`} />
                      </div>
                    </button>

                    <button 
                      onClick={() => onUpdateBatterySaver(!batterySaver)}
                      className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${batterySaver ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-md' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                      <div className="flex items-center">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center mr-3 ${batterySaver ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                          <Battery size={14} />
                        </div>
                        <span>Economia de Bateria</span>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${batterySaver ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${batterySaver ? 'left-6' : 'left-1'}`} />
                      </div>
                    </button>
                  </div>
                </div>

                {/* DOCUMENTAÇÃO */}
                <button 
                  onClick={() => setIsDocModalOpen(true)}
                  className="w-full flex items-center p-4 bg-emerald-50 border border-emerald-100 rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm mt-4"
                >
                  <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-md"><BookOpen size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-emerald-900 uppercase tracking-tight">Manual do Sistema</h4>
                    <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Documentação v24.50</p>
                  </div>
                  <ChevronRight size={14} className="text-emerald-300" />
                </button>

                <button 
                  onClick={() => window.open('/ajuda_sistema.html', '_blank')}
                  className="w-full flex items-center p-4 bg-indigo-50 border border-indigo-100 rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm mt-3"
                >
                  <div className="w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-md"><ExternalLink size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-indigo-900 uppercase tracking-tight">POP Interativo</h4>
                    <p className="text-[8px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5">Guia de Nova Arquitetura</p>
                  </div>
                  <ChevronRight size={14} className="text-indigo-300" />
                </button>
                
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 flex items-start space-x-2">
                  <Battery size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[7px] font-bold text-amber-700 uppercase leading-relaxed tracking-wide">
                    Dica: O uso de <span className="text-amber-900">SOM</span> consome menos bateria que o <span className="text-amber-900">VIBRAR</span>.
                  </p>
                </div>

                {/* CONFIGURAÇÃO PROTHEUS */}
                <div className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm mt-4">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-md"><ShieldCheck size={16} /></div>
                    <div className="flex-1">
                      <h4 className="text-[13px] font-bold text-indigo-900 uppercase tracking-tight">Módulo Protheus</h4>
                      <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Integração ERP SIGAATF</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-100">
                      <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-widest">Habilitar Módulo</span>
                      <button 
                        onClick={() => onUpdateProtheusIntegration(!protheusIntegrationEnabled)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${protheusIntegrationEnabled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${protheusIntegrationEnabled ? 'left-6' : 'left-1'}`}  />
                      </button>
                    </div>

                    {protheusIntegrationEnabled && (
                      <div className="space-y-1 animate-fadeIn">
                        <label className="block text-[8px] font-bold text-indigo-400 uppercase tracking-widest ml-1">VITE_PROTHEUS_API_URL</label>
                        <input 
                          type="text"
                          value={protheusApiUrl}
                          onChange={(e) => onUpdateProtheusApiUrl(e.target.value)}
                          placeholder="https://api.empresa.com.br"
                          className="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                        />
                      </div>
                    )}

                    <div className="p-2 bg-white/50 border border-indigo-100 rounded-lg">
                      <p className="text-[7px] font-bold text-indigo-600 uppercase leading-relaxed tracking-wide">
                        Atenção: A integração exige o campo <span className="text-indigo-900">Sn1_recno</span> na carga de dados.
                      </p>
                    </div>
                  </div>
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

              <button 
                disabled={!hasData} 
                onClick={() => { setIsAnalyticsMenuOpen(false); onNavigate(AppScreen.ASSET_MAP); }} 
                className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left"
              >
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30">
                  <MapIcon size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Mapa de Calor</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Geotagging de Ativos</p>
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
                </div>
                <div className="mt-3 p-2 bg-accent/10 border border-accent/20 rounded-lg">
                  <p className="text-[7px] font-bold text-accent uppercase leading-relaxed tracking-wide opacity-80">
                    Nota: A alteração da modalidade afeta o método de login e a sincronização de dados.
                  </p>
                </div>
              </div>

              {databaseMode !== DatabaseMode.INTERNAL && (
                <button 
                  onClick={onSyncCloud} 
                  disabled={isSyncing}
                  className="w-full flex items-center p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl active:scale-[0.98] disabled:opacity-50 transition-all text-left"
                >
                  <div className={`w-10 h-10 bg-emerald-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-emerald-500/20 ${isSyncing ? 'animate-spin' : ''}`}>
                    <Cloud size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-emerald-400 uppercase tracking-tight">Sincronizar Nuvem</h4>
                    <p className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest mt-0.5">Baixar Dados do Supabase</p>
                  </div>
                </button>
              )}

              <button onClick={() => { setIsDataMenuOpen(false); setIsAdminMenuOpen(false); onExport(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Download size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Baixar base de dados</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Exportar XLS</p>
                </div>
              </button>

              <button onClick={() => { onBackup(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Database size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Gerar Backup JSON (Local)</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Segurança de Dados Locais</p>
                </div>
              </button>

              <button onClick={() => { onDownloadCloudData(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30"><Cloud size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Baixar Dados da Nuvem</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Download Direto do Supabase</p>
                </div>
              </button>

              <div className="relative">
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onRestore(file);
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <button className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                  <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><Download size={20} className="rotate-180" /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Restaurar Backup</h4>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Recuperar dados de arquivo</p>
                  </div>
                </button>
              </div>

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
                setIsSelectiveClearOpen(true);
              }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><ListChecks size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Limpeza Seletiva</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Escolher Unidades para Apagar</p>
                </div>
              </button>

              <button onClick={() => { 
                setIsClearConfirmOpen(true);
              }} className="w-full flex items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-red-500/20"><Trash2 size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-red-500 uppercase tracking-tight">Limpeza Total (Local + Nuvem)</h4>
                  <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-widest mt-0.5">Apagar Tudo Permanentemente</p>
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
        title="Limpeza Total do Sistema"
        message="ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário TANTO LOCALMENTE QUANTO NA NUVEM (Supabase). Recomenda-se gerar um BACKUP antes. Deseja continuar?"
        type="confirm"
        confirmText="Sim, Apagar Tudo"
        cancelText="Cancelar"
      />

      {/* MODAL DE LIMPEZA SELETIVA */}
      {isSelectiveClearOpen && (
        <div className="fixed inset-0 z-[20000] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-fadeIn">
          <div className="px-6 pt-12 pb-6 bg-red-600 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/30">
                <Trash2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Limpeza Seletiva</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Selecione as Unidades</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSelectiveClearOpen(false)}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-bg-main no-scrollbar">
            <div className="max-w-md mx-auto space-y-3">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-ink-muted uppercase tracking-widest">
                  {selectedToClear.length} Unidades Selecionadas
                </p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setSelectedToClear(units.map(c => c.name))}
                    className="text-[9px] font-black text-accent uppercase tracking-widest hover:underline"
                  >
                    Marcar Todas
                  </button>
                  <button 
                    onClick={() => setSelectedToClear([])}
                    className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:underline"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {units.map(unit => (
                  <button
                    key={unit.name}
                    onClick={() => {
                      if (selectedToClear.includes(unit.name)) {
                        setSelectedToClear(prev => prev.filter(c => c !== unit.name));
                      } else {
                        setSelectedToClear(prev => [...prev, unit.name]);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      selectedToClear.includes(unit.name)
                        ? 'bg-red-50 border-red-200 shadow-sm'
                        : 'bg-white border-border'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        selectedToClear.includes(unit.name)
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white border-slate-300'
                      }`}>
                        {selectedToClear.includes(unit.name) && <ListChecks size={12} />}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className={`text-[11px] font-bold uppercase tracking-tight ${
                          selectedToClear.includes(unit.name) ? 'text-red-700' : 'text-ink'
                        }`}>
                          {unit.name}
                        </span>
                        {!unit.hasData && (
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                            Base Vazia
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border-t border-border">
            <button
              disabled={selectedToClear.length === 0}
              onClick={() => {
                if (onClearMultipleUnits) {
                  onClearMultipleUnits(selectedToClear);
                  setIsSelectiveClearOpen(false);
                  setIsDataMenuOpen(false);
                  setIsAdminMenuOpen(false);
                }
              }}
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-red-600/20 active:scale-[0.98] disabled:opacity-40 transition-all"
            >
              Apagar {selectedToClear.length} Unidades
            </button>
          </div>
        </div>
      )}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-[20000] bg-white flex flex-col animate-slideUp">
          <div className="px-6 pt-12 pb-6 bg-emerald-500 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/30">
                <BookOpen size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Manual do Sistema</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">GBR v24.50 KARDEK</p>
              </div>
            </div>
            <button 
              onClick={() => setIsDocModalOpen(false)}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-bg-main no-scrollbar">
            <div className="max-w-3xl mx-auto prose prose-slate prose-sm prose-emerald">
              <div className="bg-white border border-border rounded-3xl p-6 md:p-10 shadow-sm mb-10 markdown-body">
                <ReactMarkdown>
                  {`# Documentação Técnica e Operacional - GBR v24.50 KARDEK

Este documento serve como o manual oficial e registro técnico de todas as funcionalidades operacionais do sistema de Inventário de Ativo Imobilizado (GBR v24.50).

---

## 1. Visão Geral do Sistema
O **GBR v24.50 KARDEK** é uma solução avançada para gestão de inventário físico de ativos imobilizados, projetada para auditores e gestores de patrimônio. O sistema foca em precisão, rastreabilidade e integração com ERPs (especificamente Protheus SIGAATF).

### 1.1. Pilares do Sistema
- **Protocolo GBR v24**: Regras rigorosas de eliminação e tratamento de dados (Ativos vs. Baixados).
- **Integração Protheus**: Sincronização direta via \`Sn1_recno\`.
- **Mobilidade**: Interface otimizada para dispositivos móveis com suporte a QR Code e Scanner.
- **Segurança**: Controle de acesso por perfis (ADMIN e AUDITOR).

---

## 2. Arquitetura e Tech Stack
- **Frontend**: React 18+ com TypeScript.
- **Estilização**: Tailwind CSS (Design System GBR).
- **Ícones**: Lucide React.
- **Processamento de Dados**: XLSX (SheetJS) para carga de planilhas.
- **QR Code**: QRCode.react para geração dinâmica.
- **Backend/Sincronização**: Firebase (Firestore e Auth) para persistência em nuvem.

---

## 3. Perfis de Usuário e Permissões

| Perfil | Permissões |
| :--- | :--- |
| **ADMIN** | Gestão de usuários, configuração de campos editáveis, configuração de QR Code, carga de banco de dados, visualização de performance global. |
| **AUDITOR** | Realização de inventário, consulta de ativos, edição de campos permitidos, sincronização com Protheus. |

---

## 4. Módulos Operacionais

### 4.1. Carga de Dados (Database Loader)
- **Protocolo de Importação**: Suporta arquivos \`.xlsx\` e \`.csv\`.
- **Mapeamento v24**: Identifica automaticamente 18 colunas críticas (Empresa, Status, Etiqueta, etc.).
- **Sn1_recno**: Captura obrigatória do identificador do Protheus para integração.
- **Regras de Eliminação (GBR v24)**:
  - Itens baixados com contas contábeis específicas (131105001/002) são eliminados.
  - Itens baixados sem etiqueta são eliminados.
  - Itens baixados cuja etiqueta já existe em um registro ativo são eliminados para evitar duplicidade.

### 4.2. Inventário Físico
- **Seleção de Local**: O auditor seleciona a unidade e o endereço antes de iniciar.
- **Modos de Leitura**:
  - **Scanner**: Uso da câmera para leitura de QR Code/Código de Barras.
  - **Manual**: Digitação da etiqueta via teclado numérico otimizado.
- **Feedback Visual**: Cores indicativas de status (Pendente, Conferido, Divergência, Baixado).

### 4.3. Consulta e Busca Avançada
- Filtros múltiplos: Etiqueta, Descrição, Serial, CNPJ, NF, Endereço, Conta, Centro de Custo e **ID Protheus (RECNO)**.
- Busca por intervalo de data de aquisição.
- Modo de retorno ao inventário para itens localizados fora da rota original.

### 4.4. Detalhes do Ativo (Kardex)
- Visualização completa de 5 grupos de dados: Identificação, Localização, Aquisição, Controle Contábil e Dados do Inventário.
- **Edição Controlada**: Apenas campos configurados pelo ADMIN podem ser alterados pelo AUDITOR.
- **Geração de QR Code**: Baseado em campos configuráveis para etiquetas de campo.

---

## 5. Integração Protheus (SIGAATF)
O sistema possui um módulo dedicado para comunicação com o ERP TOTVS Protheus.

- **Identificador**: \`Sn1_recno\`.
- **Campos Sincronizados**: Filial (\`N1_FILIAL\`), Código Base (\`N1_CBASE\`), Local (\`N1_LOCAL\`), Centro de Custo (\`N3_CCUSTO\`), etc.
- **Operação**: O botão "Sincronizar Protheus" no detalhe do ativo envia as alterações realizadas no inventário diretamente para a API do ERP.

---

## 6. Configurações Administrativas
- **Campos Editáveis**: Define quais informações o auditor pode alterar no campo.
- **QR Code Configurator**: Define quais dados serão codificados na etiqueta QR.
- **User Management**: Criação e edição de credenciais de acesso.
- **Performance Global**: Gráficos de progresso (D3.js/Recharts) por empresa e status.

---

## 7. Procedimentos de Manutenção
- **Limpeza de Dados**: Realizada via menu "Dados" (Purge).
- **Sincronização Cloud**: O sistema detecta alterações locais e solicita sincronização com o Firebase para manter a base centralizada.

---
*Documentação atualizada em: 18 de Março de 2026*
*Versão do App: 24.50.03*`}
                </ReactMarkdown>
              </div>
            </div>
          </div>
          
          <div className="p-6 bg-white border-t border-border flex items-center justify-center">
            <button 
              onClick={() => setIsDocModalOpen(false)}
              className="w-full max-w-sm py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-lg active:scale-95 transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
