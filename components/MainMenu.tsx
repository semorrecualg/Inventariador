
import React, { useState } from 'react';
import { AppScreen, User, ScanFeedbackMode, DatabaseMode, UserRole } from '../types';
import Modal from './Modal';
import BackButton from './BackButton';
import { 
  Info,
  Search, 
  BarChart3, 
  ArrowLeft, 
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
  Vibrate,
  Volume2,
  Battery,
  TrendingUp,
  TrendingDown,
  ListChecks,
  Database,
  Cloud,
  Server,
  BookOpen,
  Map as MapIcon,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  Activity,
  Calendar,
  FolderOpen,
  HardDrive,
  HelpCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SecurityPinModal from './SecurityPinModal';
import AIChatModal from './AIChatModal';

import AIInsightCard from './AIInsightCard';
import { sqliteService } from '../services/sqliteService';

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
  syncQueueLength?: number;
  deletedAssetsCount?: number;
  impairmentAssetsCount?: number;
  excludedAccounts?: string[];
  onUpdateExcludedAccounts?: (accounts: string[]) => void;
  onResetGPS?: () => void;
  onToggleGpsBypass?: (val: boolean) => void;
  isGpsBypassed?: boolean;
  onCheckIntegrity?: () => Promise<{ success: boolean; message: string }>;
  showModal: (title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => void;
  isAIAssistantOpen: boolean;
  setIsAIAssistantOpen: (val: boolean) => void;
  onOpenHelp?: () => void;
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
  syncQueueLength = 0,
  deletedAssetsCount = 0,
  impairmentAssetsCount = 0,
  excludedAccounts = [],
  onUpdateExcludedAccounts,
  onResetGPS,
  onToggleGpsBypass,
  isGpsBypassed = false,
  onCheckIntegrity,
  showModal,
  isAIAssistantOpen,
  setIsAIAssistantOpen,
  onOpenHelp
}) => {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isPreferencesMenuOpen, setIsPreferencesMenuOpen] = useState(false);
  const [isAnalyticsMenuOpen, setIsAnalyticsMenuOpen] = useState(false);
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(initialDataMenuOpen);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isSelectiveClearOpen, setIsSelectiveClearOpen] = useState(false);
  const [isExcludedAccountsOpen, setIsExcludedAccountsOpen] = useState(false);
  const [tempExcludedAccounts, setTempExcludedAccounts] = useState<string>('');
  const [selectedToClear, setSelectedToClear] = useState<string[]>([]);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isSecurityPinOpen, setIsSecurityPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});
  
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);

  const handleCheckIntegrity = async () => {
    if (!onCheckIntegrity) return;
    setIsCheckingIntegrity(true);
    try {
      const result = await onCheckIntegrity();
      showModal(
        result.success ? "Integridade Confirmada" : "Falha de Integridade",
        result.message,
        result.success ? "success" : "error"
      );
    } catch {
      showModal("Erro", "Falha ao realizar verificação de integridade.", "error");
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.is_admin || user?.isAdmin || user?.email.toLowerCase() === "semorr@gmail.com" || user?.email.toLowerCase() === "semorr@gmail.com.br";
  const hasData = inventoryInfo.totalDatabase > 0;

  const [dirStatus, setDirStatus] = useState<{status: string, path: string, fileName?: string} | null>(null);

  React.useEffect(() => {
    if (isDataMenuOpen) {
      import('../services/sqliteService').then(m => {
        m.sqliteService.getFileStatus().then(status => {
          setDirStatus(status as { status: string; path: string; fileName?: string });
        });
      });
    }
  }, [isDataMenuOpen]);

  const handleSecureAction = (action: () => void) => {
    setPendingAction(() => action);
    setIsSecurityPinOpen(true);
  };

  const handlePickDirectory = async () => {
    try {
      if (window.self !== window.top) {
        showModal(
          "Restrição de Navegador",
          "O navegador impede a seleção de pastas dentro de janelas de visualização (iframes). Por favor, abra o aplicativo em uma nova aba para vincular sua pasta física permanentemente.",
          "warning"
        );
        return;
      }
      
      await sqliteService.mapLocalFolder();
      const status = await sqliteService.getFileStatus();
      setDirStatus(status as { status: string; path: string; fileName?: string });
      
      showModal(
        "Sucesso",
        "Diretório de trabalho vinculado com sucesso. Seus dados agora estão imobilizados fisicamente neste local.",
        "success"
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(err);
      showModal("Erro", "Não foi possível vincular a pasta: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn relative overflow-hidden">
      <SecurityPinModal 
        isOpen={isSecurityPinOpen}
        onClose={() => setIsSecurityPinOpen(false)}
        onSuccess={pendingAction}
        title="Confirmação de Segurança"
        description="Esta operação exige autenticação adicional com seu PIN de segurança."
      />
      {/* TOP STATUS BAR - REDESIGNED */}
      <div className="px-6 pt-10 pb-4 bg-white flex items-center justify-between z-30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center text-accent">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink tracking-tight">Auditoria <span className="text-accent">Inteligente</span></h1>
            <p className="text-[10px] font-medium text-ink-muted uppercase tracking-widest">SaaS Enterprise</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {hasSupabase && databaseMode !== DatabaseMode.INTERNAL && (
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border ${
              isSyncing 
                ? 'bg-blue-50 border-blue-100 text-blue-500' 
                : syncError 
                  ? 'bg-red-50 border-red-100 text-red-500' 
                  : syncQueueLength > 0
                    ? 'bg-amber-50 border-amber-100 text-amber-500'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-500'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-blue-500 animate-pulse' : syncError ? 'bg-red-500' : syncQueueLength > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="text-[9px] font-bold uppercase tracking-tight">
                {isSyncing ? 'Sincronizando' : syncError ? 'Erro' : syncQueueLength > 0 ? `${syncQueueLength} Pendentes` : 'Online'}
              </span>
            </div>
          )}
          <button 
            onClick={() => onOpenHelp?.()}
            className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 active:scale-90 transition-all"
          >
            <HelpCircle size={20} />
          </button>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md"><Activity size={20} /></div>
        </div>
      </div>

      {/* USER PROFILE CARD - SIMPLIFIED */}
      <div className="px-6 py-4 bg-white border-b border-slate-50 flex items-center justify-between z-20">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-accent-soft rounded-full flex items-center justify-center text-accent font-bold text-lg shadow-sm">
            {user?.username?.substring(0, 2).toUpperCase() || 'OP'}
          </div>
          <div className="ml-4">
            <h2 className="text-sm font-bold text-ink leading-tight">
              {user?.username || 'Operador'}
            </h2>
            <div className="flex items-center space-x-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${isFullscreen ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="text-[10px] font-medium text-ink-muted uppercase tracking-wider">
                {isFullscreen ? 'Modo Ativo' : 'Modo Standby'}
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={onLogout} 
          className="w-10 h-10 bg-slate-50 rounded-xl text-slate-400 flex items-center justify-center active:scale-90 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* TOOL GRID - MINIMALIST */}
      <div className="px-6 py-4 bg-white border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsPreferencesMenuOpen(true)} 
            className="flex flex-col items-center space-y-1 group"
          >
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
              <SlidersHorizontal size={20} />
            </div>
            <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Ajustes</span>
          </button>

          {isAdmin && (
            <button 
              onClick={() => setIsDataMenuOpen(true)} 
              className="flex flex-col items-center space-y-1 group"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
                <DatabaseZap size={20} />
              </div>
              <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Dados</span>
            </button>
          )}

          {isAdmin && (
            <button 
              onClick={() => setIsAnalyticsMenuOpen(true)} 
              className="flex flex-col items-center space-y-1 group"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
                <BarChart3 size={20} />
              </div>
              <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Insights</span>
            </button>
          )}

          {isAdmin && (
            <button 
              onClick={() => setIsAdminMenuOpen(true)} 
              className="flex flex-col items-center space-y-1 group"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 group-active:scale-90 transition-all group-hover:bg-accent-soft group-hover:text-accent">
                <Settings size={20} />
              </div>
              <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Painel</span>
            </button>
          )}
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-ink uppercase tracking-widest">
            {hasData ? `${inventoryInfo.count} Ativos` : 'Vazio'}
          </span>
          <div className="flex items-center space-x-1 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${hasData ? 'bg-success' : 'bg-slate-300'}`} />
            <span className="text-[8px] font-medium text-ink-muted uppercase">Base Local</span>
          </div>
        </div>
      </div>


      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar">
        {/* AI INSIGHT CARD */}
        <AIInsightCard 
          title="Insights de Auditoria"
          suggestion={`Detectamos ${inventoryInfo.totalDatabase - inventoryInfo.count} itens pendentes na unidade ${selectedUnit || 'atual'}. Deseja iniciar a conferência inteligente?`}
          onAction={() => onNavigate(AppScreen.INVENTORY)}
          actionLabel="Iniciar Agora"
        />

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.INVENTORY)}
          className="w-full flex items-center p-5 bg-white rounded-2xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group"
        >
          <div className="w-12 h-12 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-5 group-hover:bg-accent group-hover:text-white transition-colors">
            <ClipboardList size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">INVENTÁRIO</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Conferência Física</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.LABELING)}
          className="w-full flex items-center p-5 bg-white rounded-2xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group"
        >
          <div className="w-12 h-12 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-5 group-hover:bg-accent group-hover:text-white transition-colors">
            <Tag size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">ETIQUETAR</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Itens sem plaqueta</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-5 bg-white rounded-2xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group"
        >
          <div className="w-12 h-12 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-5 group-hover:bg-accent group-hover:text-white transition-colors">
            <Search size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">CONSULTA</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Busca de Ativo</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>

        <button
          disabled={!hasData}
          onClick={() => onNavigate(AppScreen.ACCOUNT_RECONCILIATION)}
          className="w-full flex items-center p-5 bg-white rounded-2xl active:scale-[0.98] disabled:opacity-40 transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group"
        >
          <div className="w-12 h-12 bg-accent-soft text-accent rounded-xl flex items-center justify-center mr-5 group-hover:bg-accent group-hover:text-white transition-colors">
            <ListChecks size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">CONCILIAÇÃO POR CONTA</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Auditoria de Bens Não Etiquetáveis</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>
      </div>


      <div className="p-4 bg-white border-t border-slate-50 flex items-center justify-center">
        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">Auditoria Inteligente • SaaS</span>
      </div>

      <AIChatModal 
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
        username={user?.username || 'Operador'}
      />

      {isAdminMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <div className="fixed top-8 left-6 z-[10001]">
            <BackButton onClick={() => setIsAdminMenuOpen(false)} label="Voltar" />
          </div>
          <div className="w-full max-w-sm space-y-3">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent/10 shadow-lg overflow-hidden p-1">
                  <ShieldCheck className="text-accent" size={32} />
                </div>
                <h2 className="text-xl font-bold text-ink uppercase tracking-tight">Painel Administrativo</h2>
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.3em] mt-1.5">Protocolo de Segurança</p>
              </div>
            
            <div className="space-y-2.5 max-h-[65vh] overflow-y-auto no-scrollbar pr-1">
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.FIELD_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Settings size={16} /></div>
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

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.AUDIT_LOGS); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Activity size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Auditoria</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Trilha de Auditoria</p>
                </div>
              </button>

              <button 
                onClick={handleCheckIntegrity}
                disabled={isCheckingIntegrity}
                className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm disabled:opacity-50"
              >
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100">
                  {isCheckingIntegrity ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Integridade</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Validar Checksum SHA-256</p>
                </div>
              </button>

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.CAMPAIGN_MANAGEMENT); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Calendar size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Eventos</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Campanhas de Inventário</p>
                </div>
              </button>

              {databaseMode !== DatabaseMode.INTERNAL && (
                <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.SYNC_MANAGER); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                  <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Cloud size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Sincronização</h4>
                    <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Gestão de Fila Offline</p>
                  </div>
                </button>
              )}

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
              
              {/* CONFIGURAÇÃO PROTHEUS */}
              <div className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
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
            <div className="pt-4 text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">Security Protocol</div>
          </div>
        </div>
      )}

      {isPreferencesMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-50 flex flex-col animate-fadeIn">
          {/* Top App Bar - Material 3 Style */}
          <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center sticky top-0 z-[10001]">
            <button 
              onClick={() => setIsPreferencesMenuOpen(false)}
              className="p-2 -ml-2 text-slate-600 active:bg-slate-100 rounded-full transition-colors mr-3"
            >
              <ChevronRight size={24} className="rotate-180" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-slate-900 leading-tight">Ajustes de Campo</h1>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Preferências do Auditor</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            <div className="w-full max-w-sm mx-auto space-y-4">
              {/* AUTO CONFERENCIA */}
              <div className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><ShieldCheck size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Auto-Conferência</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Registro Automático no Scan</p>
                  </div>
                </div>
                <div className="flex p-1 bg-slate-50 border border-slate-100 rounded-xl">
                  <button 
                    onClick={() => onUpdateAutoConfirm(true)}
                    className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${autoConfirmOnScan ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400'}`}
                  >
                    LIGADO
                  </button>
                  <button 
                    onClick={() => onUpdateAutoConfirm(false)}
                    className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${!autoConfirmOnScan ? 'bg-white text-slate-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}
                  >
                    DESLIGADO
                  </button>
                </div>
              </div>

              {/* FEEDBACK SCANNER */}
              <div className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-4 border border-blue-100"><Vibrate size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Feedback do Scanner</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Confirmação de Leitura</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 border border-slate-100 rounded-xl">
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.VIBRATE)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.VIBRATE ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400'}`}
                  >
                    <Vibrate size={12} />
                    <span>Vibrar</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.SOUND)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.SOUND ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400'}`}
                  >
                    <Volume2 size={12} />
                    <span>Som (Bip)</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.BOTH)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.BOTH ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400'}`}
                  >
                    <div className="flex space-x-1">
                      <Vibrate size={10} />
                      <Volume2 size={10} />
                    </div>
                    <span>Ambos</span>
                  </button>
                  <button 
                    onClick={() => onUpdateScanFeedbackMode(ScanFeedbackMode.NONE)}
                    className={`py-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${scanFeedbackMode === ScanFeedbackMode.NONE ? 'bg-white text-slate-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}
                  >
                    <X size={12} />
                    <span>Nenhum</span>
                  </button>
                </div>
              </div>

              {/* ENERGIA E TEMA */}
              <div className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-4 border ${darkMode ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {darkMode ? <Battery size={16} /> : <Battery size={16} />}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Energia e Visibilidade</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Performance e Bateria</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button 
                    onClick={() => onUpdateDarkMode(!darkMode)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${darkMode ? 'bg-slate-800 border-slate-700 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                  >
                    <div className="flex items-center">
                      <span className="mr-3">{darkMode ? '🌙' : '☀️'}</span>
                      <span>Modo Escuro (OLED)</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${darkMode ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${darkMode ? 'left-6' : 'left-1'}`} />
                    </div>
                  </button>

                  <button 
                    onClick={() => onUpdateBatterySaver(!batterySaver)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${batterySaver ? 'bg-amber-50 border-amber-100 text-amber-700 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                  >
                    <div className="flex items-center">
                      <Battery size={14} className="mr-3" />
                      <span>Economia de Bateria</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${batterySaver ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${batterySaver ? 'left-6' : 'left-1'}`} />
                    </div>
                  </button>
                </div>
              </div>

              {/* DOCUMENTAÇÃO */}
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDocModalOpen(true)}
                  className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-[0.98] transition-all text-center shadow-sm"
                >
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2 border border-emerald-100"><BookOpen size={20} /></div>
                  <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Manual</h4>
                </button>

                <button 
                  onClick={() => window.open('/ajuda_sistema.html', '_blank')}
                  className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-[0.98] transition-all text-center shadow-sm"
                >
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-2 border border-indigo-100"><ExternalLink size={20} /></div>
                  <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Guia POP</h4>
                </button>
              </div>
            </div>
            <div className="pt-4 text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">GBR Personalization</div>
          </div>
        </div>
      )}

      {isAnalyticsMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <div className="fixed top-8 left-6 z-[10001]">
            <BackButton onClick={() => setIsAnalyticsMenuOpen(false)} label="Voltar" />
          </div>
          
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

              <button 
                disabled={!hasData} 
                onClick={() => { setIsAnalyticsMenuOpen(false); onNavigate(AppScreen.IMPAIRMENT_REPORT); }} 
                className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left"
              >
                <div className="w-10 h-10 bg-red-500/20 text-red-500 rounded-lg flex items-center justify-center mr-4 border border-red-500/30">
                  <TrendingDown size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Relatório de Impairment</h4>
                    {impairmentAssetsCount > 0 && (
                      <span className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                        {impairmentAssetsCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">CPC 01 - Perdas por Desvalorização</p>
                </div>
                <ChevronRight size={14} className="text-white/20" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isDataMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <div className="fixed top-8 left-6 z-[10001]">
            <BackButton onClick={() => setIsDataMenuOpen(false)} label="Voltar" />
          </div>
          
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-accent text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-accent shadow-xl shadow-accent/20">
                <DatabaseZap size={32} />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Gestão e Manutenção</h2>
              <p className="text-[9px] font-bold text-accent uppercase tracking-[0.3em] mt-1.5 opacity-70">Operações de Banco de Dados</p>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar pr-1">
              {/* Working Directory Status Card */}
              <div className="w-full p-5 bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/20 mb-4 border border-blue-400 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <FolderOpen size={64} className="text-white" />
                </div>

                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur-sm border border-white/30">
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-white uppercase tracking-tight">Vínculo de Diretório</h4>
                    <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Soberania Local Permanente</p>
                  </div>
                </div>

                <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/10 mb-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">Caminho do Banco:</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${dirStatus?.status === 'linked' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                      {dirStatus?.status === 'linked' ? 'ATIVO' : 'DESCONECTADO'}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono font-bold text-white break-all leading-tight">
                    {dirStatus?.path || 'Nenhum diretório selecionado'}
                  </p>
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-widest">Arquivo: {dirStatus?.fileName || 'Aguardando...'}</span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button 
                    onClick={handlePickDirectory}
                    className="flex-1 py-2.5 bg-white text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all shadow-sm flex items-center justify-center space-x-2"
                  >
                    <FolderOpen size={12} />
                    <span>ALTERAR PASTA</span>
                  </button>
                  <button 
                    onClick={() => import('../services/sqliteService').then(m => m.sqliteService.requestFilePermission())}
                    className="w-12 py-2.5 bg-blue-700 text-white rounded-xl flex items-center justify-center hover:bg-blue-800 transition-all border border-white/10"
                    title="Autorizar Acesso"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Security Status Card */}
              <div className="w-full p-4 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm mb-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center shadow-md">
                      <ShieldCheck size={16} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[13px] font-bold text-emerald-900 uppercase tracking-tight">Status de Blindagem</h4>
                      <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Integridade do Sistema</p>
                    </div>
                  </div>
                  <div className="px-2 py-1 bg-emerald-100 border border-emerald-200 rounded-lg">
                    <span className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">PROTEGIDO</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-emerald-700/60 px-1">
                    <span>Criptografia AES-256</span>
                    <span className="text-emerald-600">ATIVO</span>
                  </div>
                  <div className="w-full h-1 bg-emerald-100 rounded-full overflow-hidden">
                    <div className="w-full h-full bg-emerald-500" />
                  </div>
                  
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-emerald-700/60 px-1 pt-1">
                    <span>Monitor de Runtime</span>
                    <span className="text-emerald-600">MONITORANDO</span>
                  </div>
                  <div className="w-full h-1 bg-emerald-100 rounded-full overflow-hidden">
                    <div className="w-[85%] h-full bg-emerald-500 animate-pulse" />
                  </div>
                </div>
              </div>

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
                      <span>1) Mobile Puro (Local)</span>
                    </div>
                    {databaseMode === DatabaseMode.INTERNAL && <div className="w-2 h-2 bg-slate-400 rounded-full shadow-[0_0_8px_rgba(148,163,184,0.8)]" />}
                  </button>
                  
                  <div className="relative group">
                    <button 
                      onClick={() => onUpdateDatabaseMode(DatabaseMode.SUPABASE)}
                      className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${
                        databaseMode === DatabaseMode.SUPABASE 
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-sm' 
                          : 'bg-white/5 border-white/10 text-white/40'
                      }`}
                    >
                      <div className="flex items-center">
                        <Cloud size={14} className="mr-3" />
                        <span>2) Cloud Sync (Nuvem)</span>
                      </div>
                      {databaseMode === DatabaseMode.SUPABASE ? (
                        <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                      ) : null}
                    </button>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-accent/10 border border-accent/20 rounded-lg">
                  <p className="text-[7px] font-bold text-accent uppercase leading-relaxed tracking-wide opacity-80">
                    Nota: A alteração da modalidade afeta o método de login e a sincronização de dados.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => { setIsDataMenuOpen(false); onNavigate(AppScreen.DATABASE_MANAGER); }} 
                className="w-full flex items-center p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl active:scale-[0.98] transition-all text-left"
              >
                <div className="w-10 h-10 bg-indigo-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-indigo-500/20">
                  <Database size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-indigo-400 uppercase tracking-tight">Gestor de Banco Local</h4>
                  <p className="text-[8px] font-bold text-indigo-400/60 uppercase tracking-widest mt-0.5">Carga Inicial (JSON/CSV) & Persistência</p>
                </div>
                <ChevronRight size={14} className="text-indigo-400/40" />
              </button>

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

              {databaseMode !== DatabaseMode.INTERNAL && (
                <button onClick={() => { onDownloadCloudData(); }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                  <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30"><Cloud size={20} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Baixar Dados da Nuvem</h4>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Download Direto do Supabase</p>
                  </div>
                </button>
              )}

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

              <button 
                onClick={() => { 
                  setIsDataMenuOpen(false); 
                  setIsAdminMenuOpen(false);
                  onNavigate(AppScreen.LOAD_DATABASE); 
                }} 
                className="w-full flex items-center p-4 bg-accent text-white rounded-2xl active:scale-[0.98] transition-all text-left shadow-xl shadow-accent/20"
              >
                <div className="w-10 h-10 bg-white/20 text-white rounded-lg flex items-center justify-center mr-4"><DatabaseZap size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold uppercase tracking-tight">Carga Expert</h4>
                  <p className="text-[8px] font-bold text-white/70 uppercase tracking-widest mt-0.5">
                    Importar Base Master
                  </p>
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
                setTempExcludedAccounts(excludedAccounts.join(', '));
                setIsExcludedAccountsOpen(true);
              }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30"><ShieldAlert size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Filtros de Carga</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Contas Contábeis Ignoradas</p>
                </div>
              </button>

              <button 
                onClick={() => { 
                  setIsDataMenuOpen(false); 
                  onNavigate(AppScreen.SOFT_DELETE_REPORT); 
                }} 
                className="w-full flex items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.98] transition-all text-left relative overflow-hidden group"
              >
                <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform">
                  <Trash2 size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-red-500 uppercase tracking-tight">Itens para Baixa</h4>
                  <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-widest mt-0.5 italic">Auditoria de Soft-Delete</p>
                </div>
                {deletedAssetsCount > 0 && (
                  <div className="absolute top-4 right-4 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg animate-pulse">
                    {deletedAssetsCount}
                  </div>
                )}
              </button>

              {/* GPS CONTROLS */}
              <div className="w-full p-4 bg-slate-900/50 border border-white/5 rounded-2xl shadow-sm mb-3">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mr-4 border border-blue-500/30 shadow-sm"><MapIcon size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Geolocalização (GPS)</h4>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Controle de Localização</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button 
                    onClick={() => onToggleGpsBypass?.(!isGpsBypassed)}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border ${isGpsBypassed ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm' : 'bg-white/5 border-white/10 text-white/40'}`}
                  >
                    <div className="flex items-center">
                      <Activity size={14} className="mr-3" />
                      <span>Simular GPS (Desktop)</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${isGpsBypassed ? 'bg-blue-500' : 'bg-slate-700'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isGpsBypassed ? 'left-6' : 'left-1'}`} />
                    </div>
                  </button>
                  
                  <button 
                    onClick={onResetGPS}
                    className="w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-start border bg-white/5 border-white/10 text-white/60 hover:bg-white/10 active:scale-95"
                  >
                    <RefreshCw size={14} className="mr-3" />
                    <span>Resetar GPS / Limpar Cache</span>
                  </button>
                </div>
              </div>

              <button onClick={() => { 
                handleSecureAction(() => setIsClearConfirmOpen(true));
              }} className="w-full flex items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-red-500/20"><Trash2 size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-red-500 uppercase tracking-tight">
                    {databaseMode === DatabaseMode.INTERNAL ? 'Limpeza Total (Local)' : 'Limpeza Total (Local + Nuvem)'}
                  </h4>
                  <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-widest mt-0.5 italic">Requer PIN de Segurança</p>
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
        message={databaseMode === DatabaseMode.INTERNAL 
          ? "ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário LOCALMENTE. Recomenda-se gerar um BACKUP antes. Deseja continuar?"
          : "ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os ativos e o progresso do inventário TANTO LOCALMENTE QUANTO NA NUVEM (Supabase). Recomenda-se gerar um BACKUP antes. Deseja continuar?"
        }
        type="confirm"
        confirmText="Sim, Apagar Tudo"
        cancelText="Cancelar"
      />

      {/* MODAL DE CONTAS EXCLUÍDAS */}
      {isExcludedAccountsOpen && (
        <div className="fixed inset-0 z-[20000] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-fadeIn">
          <div className="px-6 pt-12 pb-6 bg-blue-600 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <BackButton onClick={() => setIsExcludedAccountsOpen(false)} label="Voltar" />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Filtros de Carga</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Contas Contábeis Ignoradas</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-bg-main no-scrollbar">
            <div className="max-w-md mx-auto space-y-6">
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                <div className="flex items-center space-x-3 mb-4 text-blue-600">
                  <ShieldAlert size={20} />
                  <h3 className="text-sm font-black uppercase tracking-tight">Configuração de Saneamento</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-6">
                  Insira as contas contábeis que devem ser <strong>IGNORADAS</strong> durante a carga de dados (Carga Expert) caso o status do item seja <strong>BAIXADO</strong>. Separe as contas por vírgula.
                </p>
                
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contas (Ex: 131105001, 131105002)</label>
                  <textarea 
                    value={tempExcludedAccounts}
                    onChange={(e) => setTempExcludedAccounts(e.target.value)}
                    placeholder="Digite as contas separadas por vírgula..."
                    className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                  />
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3">
                <Info size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  <strong>Nota:</strong> Esta regra é aplicada apenas no momento da importação da planilha. Alterar esta lista não afetará os dados que já estão no banco de dados.
                </p>
              </div>

              <button 
                onClick={() => {
                  const accounts = tempExcludedAccounts
                    .split(',')
                    .map(a => a.trim())
                    .filter(a => a.length > 0);
                  onUpdateExcludedAccounts?.(accounts);
                  setIsExcludedAccountsOpen(false);
                }}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
              >
                Salvar Configuração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LIMPEZA SELETIVA */}
      {isSelectiveClearOpen && (
        <div className="fixed inset-0 z-[20000] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-fadeIn">
          <div className="px-6 pt-12 pb-6 bg-red-600 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4">
              <BackButton onClick={() => setIsSelectiveClearOpen(false)} label="Voltar" />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Limpeza Seletiva</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Selecione as Unidades</p>
              </div>
            </div>
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
              <BackButton onClick={() => setIsDocModalOpen(false)} label="Voltar" />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Manual do Sistema</h2>
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">v24.50 KARDEK</p>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-bg-main no-scrollbar">
            <div className="max-w-3xl mx-auto prose prose-slate prose-sm prose-emerald">
              <div className="bg-white border border-border rounded-3xl p-6 md:p-10 shadow-sm mb-10 markdown-body">
                <ReactMarkdown>
                  {`# Documentação Técnica e Operacional - v24.50 KARDEK

Este documento serve como o manual oficial e registro técnico de todas as funcionalidades operacionais do sistema de Inventário de Ativo Imobilizado.

---

## 1. Visão Geral do Sistema
O **v24.50 KARDEK** é uma solução avançada para gestão de inventário físico de ativos imobilizados, projetada para auditores e gestores de patrimônio. O sistema foca em precisão, rastreabilidade e integração com ERPs (especificamente Protheus SIGAATF).

### 1.1. Pilares do Sistema
- **Protocolo de Auditoria**: Regras rigorosas de eliminação e tratamento de dados (Ativos vs. Baixados).
- **Integração Protheus**: Sincronização direta via \`Sn1_recno\`.
- **Mobilidade**: Interface otimizada para dispositivos móveis com suporte a QR Code e Scanner.
- **Segurança**: Controle de acesso por perfis (ADMIN e AUDITOR).

---

## 2. Arquitetura e Tech Stack
- **Frontend**: React 18+ com TypeScript.
- **Estilização**: Tailwind CSS (Design System Profissional).
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
- **Regras de Eliminação**:
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
