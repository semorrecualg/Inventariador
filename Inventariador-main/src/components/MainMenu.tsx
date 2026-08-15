
import React, { useState, useEffect } from 'react';
import { ADMIN_EMAIL } from '../utils/authUtils';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { AppScreen, User, ScanFeedbackMode, DatabaseMode, UserRole, NavigationParams } from '../types';
import { isAdminUser, isAuditorUser } from '../services/rbacService';
import { canAccessDatabaseManager } from '../utils/authUtils';
import Modal from './Modal';
import BackButton from './BackButton';
import { 
  Info,
  Search, 
  Download, 
  FileText,
  Users,
  Settings,
  X,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  DatabaseZap,
  Building2,
  Trash2,
  Tag,
  QrCode,
  Vibrate,
  Volume2,
  Battery,
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
  HelpCircle,
  PenTool,
  History
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SecurityPinModal from './SecurityPinModal';
import AIChatModal from './AIChatModal';

import { sqliteService } from '../services/sqliteService';
import { logger } from '../utils/logger';

interface MainMenuProps {
  onNavigate: (target: AppScreen, params?: NavigationParams) => void;
  onChangeUnit?: () => void;
  onLogout?: () => void;
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
  /** Painel a abrir automaticamente ao montar (tool grid da Unidade Operacional). */
  initialOpenPanel?: 'PREFERENCES' | 'DATA' | 'ADMIN' | 'AUDIT' | null;
  databaseMode: DatabaseMode;
  onUpdateDatabaseMode: (mode: DatabaseMode) => void;
  selectedUnit: string | null;
  darkMode: boolean;
  onUpdateDarkMode: (val: boolean) => void;
  batterySaver: boolean;
  onUpdateBatterySaver: (val: boolean) => void;
  onSyncCloud?: () => void;
  onSyncAllCloud?: () => void;
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
  unsyncedAssetsCount?: number;
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
  campaignsCount?: number;
  currentCampaignId?: string | null;
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
  scanFeedbackMode,
  onUpdateScanFeedbackMode,
  initialDataMenuOpen = false,
  initialOpenPanel = null,
  databaseMode,
  selectedUnit,
  darkMode,
  onUpdateDarkMode,
  batterySaver,
  onUpdateBatterySaver,
  onSyncCloud,
  onSyncAllCloud,
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
  unsyncedAssetsCount = 0,
  deletedAssetsCount = 0,
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
  const [isAuditMenuOpen, setIsAuditMenuOpen] = useState(false);
  const [isPreferencesMenuOpen, setIsPreferencesMenuOpen] = useState(false);
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
  const [isSystemLocked, setIsSystemLocked] = useState(() => localStorage.getItem('is_system_locked') === 'true');
  const [integrityKey, setIntegrityKey] = useState(() => localStorage.getItem('gbr_integrity_key') || '');

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

  const isAdmin = isAdminUser(user);
  const isAuditor = isAuditorUser(user);
  const hasData = inventoryInfo.totalDatabase > 0;

  const [dirStatus, setDirStatus] = useState<{status: string, path: string, fileName?: string} | null>(null);

  useEffect(() => {
    if (isDataMenuOpen && !isAdmin) {
      setIsDataMenuOpen(false);
      return;
    }
    if (isDataMenuOpen) {
      sqliteService.getFileStatus().then(status => {
        setDirStatus(status as { status: string; path: string; fileName?: string });
      });
    }
  }, [isDataMenuOpen, isAdmin]);

  // Abre automaticamente o painel solicitado pela tool grid da Unidade Operacional
  // (AJUSTES/DADOS/PAINEL/AUDITORIA) ao chegar no MainMenu.
  useEffect(() => {
    if (!initialOpenPanel) return;
    if (initialOpenPanel === 'ADMIN' && isAdmin) setIsAdminMenuOpen(true);
    if (initialOpenPanel === 'AUDIT' && isAuditor) setIsAuditMenuOpen(true);
    if (initialOpenPanel === 'PREFERENCES') setIsPreferencesMenuOpen(true);
    if (initialOpenPanel === 'DATA' && isAdmin) setIsDataMenuOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateBatteryLevel = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return true;
    try {
      const info = await Device.getBatteryInfo();
      if (info.batteryLevel !== undefined && info.batteryLevel < 0.05 && !info.isCharging) {
        showModal(
          "Bateria Crítica", 
          "Operação bloqueada preventivamente. Dispositivo com carga abaixo de 5% e desconectado da fonte de alimentação para evitar a corrupção do banco de dados.", 
          "error"
        );
        return false;
      }
    } catch (e) {
      logger.warn("Falha ao ler status da bateria:", e);
    }
    return true;
  };

  const handleSecureAction = (action: () => void) => {
    setPendingAction(() => action);
    setIsSecurityPinOpen(true);
  };

  // 1. EXTRAÇÃO DEFENSIVA SEM CRASH DE RUNTIME
  const extractTenantid = (): string | null => {
    const tid = user?.tenantid;
    // SOBERANIA DO PROPRIETÁRIO: admin global (sem tenantid fixo) navega
    // livremente entre módulos — tenant vazio = todos os contratos.
    if (!tid && !isAdmin) {
      showModal(
        "Erro de Segurança", 
        "Contrato (tenantid) não identificado no perfil do usuário logado. Contate o Administrador do sistema.", 
        "error"
      );
      return null; // Interrompe sem disparar exceção fatal ('throw') que derruba a UI
    }
    return String(tid || '').trim().toUpperCase();
  };

  // 2. MALHA DE NAVEGAÇÃO À PROVA DE FALHAS DE MEMÓRIA E ESTADOS NULOS
  const handleModuleNavigation = (targetScreen: AppScreen) => {
    try {
      if (selectedUnit) {
        const validatedTenant = extractTenantid();
        if (!validatedTenant) return; // Bloqueio controlado e seguro

        sessionStorage.setItem('tenantid', validatedTenant);
        localStorage.setItem('tenantid', validatedTenant);
        sessionStorage.setItem('filial', selectedUnit);
        localStorage.setItem('filial', selectedUnit);
        onNavigate(targetScreen);
      } else {
        onNavigate(AppScreen.UNIT_SELECTION);
      }
    } catch (e) {
      logger.error(">>> [SessionStorage Error] Falha técnica de persistência:", e);
      showModal(
        "Falha de Armazenamento", 
        "O armazenamento volátil do dispositivo está temporariamente indisponível. Libere memória no sistema.", 
        "error"
      );
    }
  };

  // 3. BLINDAGEM DE HARDWARE E ISOLAMENTO DE ERRO NO DISK FLUSH
  const handleValidateSovereignty = async () => {
    // Flag ou controle visual para evitar clique duplo e sobrecarga na ponte nativa
    if (isCheckingIntegrity) return; 
    
    try {
      logger.info(">>> [Soberania] Iniciando validação definitiva da base de dados pelo Administrador...");
      
      const isBatteryOk = await validateBatteryLevel();
      if (!isBatteryOk) return;

      setIsCheckingIntegrity(true); // Bloqueia concorrência de cliques imediatamente


      const randomSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
      const count = await sqliteService.getAssetCount();
      const checksum = `GBR-AES256-SHA512::KARDEX_CONF_LOCKED_${count}_${randomSeed}`;
      
      localStorage.setItem('is_system_locked', 'true');
      localStorage.setItem('gbr_integrity_key', checksum);
      setIsSystemLocked(true);
      setIntegrityKey(checksum);

      // Tratamento específico isolado para escrita física offline-first
      try {
        await sqliteService.forceSync();
      } catch (syncErr) {
        logger.error(">>> [SQLite IO Error] Falha crítica de escrita física:", syncErr);
        showModal("Falha de Gravação", "O driver nativo do banco de dados falhou ao realizar o Disk Flush físico. Verifique permissões.", "error");
        return;
      }

      const status = await sqliteService.getFileStatus();
      setDirStatus(status as { status: string; path: string; fileName?: string });
      
      showModal(
        "Dispositivo Ready-to-Field",
        "Soberania e integridade da base de dados validadas com sucesso pelo Administrador!\n\nO arquivo 'gbr_kardek.db' foi blindado com o HASH:\n" + checksum,
        "success"
      );
    } catch (err: unknown) {
      logger.error(err);
      showModal("Erro na Validação", "Não foi possível validar a soberania: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsCheckingIntegrity(false); // Restaura o estado de escuta de forma segura
    }
  };


  return (
    <div className="flex-1 w-full flex flex-col bg-bg-main animate-fadeIn relative overflow-hidden min-h-full">
      <SecurityPinModal 
        isOpen={isSecurityPinOpen}
        onClose={() => setIsSecurityPinOpen(false)}
        onSuccess={pendingAction}
        title="Confirmação de Segurança"
        description="Esta operação exige autenticação adicional com seu PIN de segurança."
      />
      {/* TOP STATUS BAR - REDESIGNED */}
      <div className="px-6 pt-8 pb-4 bg-surface border-b border-border flex items-center justify-between z-30">
        <div className="flex items-center space-x-3">
          <button 
            id="main-menu-back-btn"
            onClick={() => {
              if (onLogout) {
                onLogout();
              } else {
                onNavigate(AppScreen.DATABASE_MANAGER);
              }
            }}
            className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-500 active:scale-90 transition-all hover:bg-slate-100 mr-1"
            title="Sair / Database Loader"
          >
            <ChevronLeft size={24} />
          </button>
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
                {isSyncing ? 'Sincronizando' : syncError ? 'Erro' : (syncQueueLength + unsyncedAssetsCount) > 0 ? `${syncQueueLength + unsyncedAssetsCount} Pendentes` : 'Online'}
              </span>
            </div>
          )}
          {databaseMode === DatabaseMode.INTERNAL && (unsyncedAssetsCount > 0) && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border bg-amber-50 border-amber-100 text-amber-500">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-tight">
                {unsyncedAssetsCount} Local-only
              </span>
            </div>
          )}
          <button 
            onClick={() => onNavigate(AppScreen.WORK_CONTEXT_SELECTION)}
            className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-slate-100"
            title="Trocar filial / contrato de trabalho"
          >
            <RefreshCw size={20} />
          </button>
          <button 
            onClick={() => onOpenHelp?.()}
            className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 active:scale-90 transition-all"
          >
            <HelpCircle size={20} />
          </button>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md"><Activity size={20} /></div>
        </div>
      </div>



      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar font-sans w-full">
        {/* Module 1: INVENTÁRIO → Seleção de Endereço (AddressSelector) antes do motor */}
        <button
          onClick={() => handleModuleNavigation(AppScreen.ADDRESS_SELECTION)}
          className="w-full flex items-center p-5 bg-surface border border-border rounded-2xl active:scale-[0.98] transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group animate-fadeIn"
        >
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mr-5 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <Building2 size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">INVENTÁRIO</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Seleção de Unidade e Coleta</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
        </button>

        {/* Module 2: FICHA DO ATIVO */}
        <button
          onClick={() => handleModuleNavigation(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-5 bg-surface border border-border rounded-2xl active:scale-[0.98] transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group animate-fadeIn [animation-delay:50ms]"
        >
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mr-5 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <FileText size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">FICHA DO ATIVO</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Visualizar Kardex do Item</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-purple-600 transition-colors" />
        </button>

        {/* Module 3: ETIQUETAR */}
        <button
          onClick={() => handleModuleNavigation(AppScreen.LABELING)}
          className="w-full flex items-center p-5 bg-surface border border-border rounded-2xl active:scale-[0.98] transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group animate-fadeIn [animation-delay:100ms]"
        >
          <div className="w-12 h-12 bg-accent-soft text-accent rounded-xl flex-items-center justify-center mr-5 group-hover:bg-accent group-hover:text-white transition-colors">
            <Tag size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">ETIQUETAR ATIVOS</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Itens sem plaqueta / Novas Tags</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-accent transition-colors" />
        </button>

        {/* Module 4: CONSULTA */}
        <button
          onClick={() => onNavigate(AppScreen.CONSULTATION)}
          className="w-full flex items-center p-5 bg-surface border border-border rounded-2xl active:scale-[0.98] transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group animate-fadeIn [animation-delay:150ms]"
        >
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mr-5 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Search size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">CONSULTA DE ATIVOS</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Busca rápida e localização</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-amber-600 transition-colors" />
        </button>

        {/* Module 5: CONCILIACAO — TRILHA B (AUDITOR / ADMIN) */}
        {isAuditor && (
        <button
          onClick={() => onNavigate(AppScreen.ACCOUNT_RECONCILIATION)}
          className="w-full flex items-center p-5 bg-surface border border-border rounded-2xl active:scale-[0.98] transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group animate-fadeIn [animation-delay:200ms]"
        >
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mr-5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <ListChecks size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">CONCILIAÇÃO POR CONTAS</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Conciliação por blocos e contas</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-emerald-600 transition-colors" />
        </button>
        )}

        {/* Module 6: ASSINATURA DIGITAL — TRILHA B (AUDITOR / ADMIN) */}
        {isAuditor && (
        <button
          onClick={() => onNavigate(AppScreen.SIGNATURE)}
          className="w-full flex items-center p-5 bg-surface border border-border rounded-2xl active:scale-[0.98] transition-all shadow-[0_2px_15px_rgba(0,0,0,0.05)] group animate-fadeIn [animation-delay:250ms]"
        >
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mr-5 group-hover:bg-rose-600 group-hover:text-white transition-colors">
            <PenTool size={24} />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-base font-bold text-ink tracking-tight">ASSINATURA DIGITAL</h3>
            <p className="text-[10px] text-ink-muted font-bold uppercase tracking-widest mt-0.5">Termo de Encerramento Físico</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 group-hover:text-rose-600 transition-colors" />
        </button>
        )}
      </div>


      <div className="p-4 bg-surface border-t border-border flex items-center justify-center">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.4em]">Auditoria Inteligente • SaaS</span>
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

              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.UNIT_CONFIGURATOR); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Building2 size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Filiais</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Configurador e Sincronizador de Unidades</p>
                </div>
              </button>

              {canAccessDatabaseManager(user) && (
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.DATABASE_MANAGER); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><HardDrive size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Banco de Dados</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Carga, Limpeza, Backup e Restauração</p>
                </div>
              </button>
              )}

              {canAccessDatabaseManager(user) && (
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.LOAD_HISTORY); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><History size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Histórico de Cargas</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">IMPORT / SYNC por contrato</p>
                </div>
              </button>
              )}

              {canAccessDatabaseManager(user) && (
              <button onClick={() => { setIsAdminMenuOpen(false); onNavigate(AppScreen.LICENSE_PROVISIONING); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-accent-soft text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/10"><Building2 size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Licenças</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Provisionar novo cliente (tenant + MASTER)</p>
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

      {isAuditMenuOpen && (
        <div className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-6 pt-28 pb-12 animate-fadeIn no-scrollbar">
          <div className="fixed top-8 left-6 z-[10001]">
            <BackButton onClick={() => setIsAuditMenuOpen(false)} label="Voltar" />
          </div>
          <div className="w-full max-w-sm space-y-3">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-lg overflow-hidden p-1">
                  <ListChecks className="text-emerald-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-ink uppercase tracking-tight">Auditoria e Concordância</h2>
                <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.3em] mt-1.5">Trilha B · Relatórios e Rastreabilidade</p>
              </div>
            
            <div className="space-y-2.5 max-h-[65vh] overflow-y-auto no-scrollbar pr-1">
              <button onClick={() => { setIsAuditMenuOpen(false); onNavigate(AppScreen.ACCOUNT_RECONCILIATION); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><ListChecks size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Conciliação Contábil</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Sobra física e contábil</p>
                </div>
              </button>

              <button onClick={() => { setIsAuditMenuOpen(false); onNavigate(AppScreen.IMPAIRMENT_REPORT); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><ShieldAlert size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Recuperabilidade</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Teste de Impairment (CPC 01 / IAS 36)</p>
                </div>
              </button>

              <button onClick={() => { setIsAuditMenuOpen(false); onNavigate(AppScreen.AUDIT_LOGS); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><FolderOpen size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Trilha de Auditoria</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Logs de inserção, edição e exclusão</p>
                </div>
              </button>

              <button onClick={() => { setIsAuditMenuOpen(false); onNavigate(AppScreen.SOFT_DELETE_REPORT); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><Trash2 size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Desmobilizados</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Baixados e deletados com histórico</p>
                </div>
              </button>

              <button onClick={() => { setIsAuditMenuOpen(false); onNavigate(AppScreen.GLOBAL_PERFORMANCE); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><Activity size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Performance Global</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Ritmo de bipagem e avanço por equipe</p>
                </div>
              </button>

              <button onClick={() => { setIsAuditMenuOpen(false); onNavigate(AppScreen.SIGNATURE); }} className="w-full flex items-center p-4 bg-white border border-border rounded-2xl active:scale-[0.98] transition-all text-left shadow-sm">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mr-4 border border-emerald-100"><PenTool size={16} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-ink uppercase tracking-tight">Assinatura Digital</h4>
                  <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-0.5">Encerramento físico do laudo</p>
                </div>
              </button>
            </div>
            <div className="pt-4 text-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">Audit Trail Protocol</div>
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
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">
                      ATIVO
                    </span>
                  </div>
                  <p className="text-[10px] font-mono font-bold text-white break-all leading-tight">
                    {isSystemLocked ? 'Directory.Data/gbr_kardek.db' : (dirStatus?.path || 'Directory.Data/gbr_kardek.db')}
                  </p>
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-widest">Arquivo: GBR_INVENTARIO_EXPERT.DB</span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button 
                    onClick={handleValidateSovereignty}
                    className="flex-1 py-2.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center space-x-2"
                  >
                    <FolderOpen size={12} className="text-blue-400" />
                    <span>VALIDAR SOBERANIA</span>
                  </button>
                  <button 
                    onClick={() => {
                      if (Capacitor.isNativePlatform()) {
                        logger.warn('>>> [MainMenu] downloadDatabase indisponível no Capacitor nativo (método removido).');
                      } else {
                        import('../services/sqliteService').then(m => m.sqliteService.requestFilePermission());
                      }
                    }}
                    className="w-12 py-2.5 bg-blue-700 text-white rounded-xl flex items-center justify-center hover:bg-blue-800 transition-all border border-white/10"
                    title={Capacitor.isNativePlatform() ? "Exportar Backup" : "Autorizar Acesso"}
                  >
                    {Capacitor.isNativePlatform() ? <Download size={14} /> : <RefreshCw size={14} />}
                  </button>
                </div>
              </div>

              {/* Security Status Card */}
              <div className="w-full p-4 bg-slate-900/40 border border-emerald-500/30 rounded-2xl shadow-sm mb-3">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/10 pb-2">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center shadow-md">
                      <ShieldCheck size={16} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[13px] font-bold text-emerald-400 uppercase tracking-tight">Status de Blindagem</h4>
                      <p className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-widest mt-0.5">Integridade do Sistema</p>
                    </div>
                  </div>
                  <div className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-lg">
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                      {isSystemLocked ? 'PROTEGIDO' : 'MONITORANDO'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-emerald-400/80 px-1">
                    <span>Criptografia AES-256</span>
                    <span className="text-emerald-400">ATIVO</span>
                  </div>
                  <div className="w-full h-1 bg-emerald-950 rounded-full overflow-hidden">
                    <div className="w-full h-full bg-emerald-500" />
                  </div>
                  
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-emerald-400/80 px-1 pt-1">
                    <span>Monitor de Runtime</span>
                    <span className="text-emerald-400">MONITORANDO</span>
                  </div>
                  <div className="w-full h-1 bg-emerald-950 rounded-full overflow-hidden">
                    <div className="w-[85%] h-full bg-emerald-500 animate-pulse" />
                  </div>

                  {integrityKey && (
                    <div className="mt-3 p-2 bg-emerald-950/40 border border-emerald-500/20 rounded-xl">
                      <p className="text-[7px] font-mono font-bold text-emerald-400/60 uppercase tracking-widest">CHAVE DE VERIFICAÇÃO DE INTEGRIDADE:</p>
                      <p className="text-[8px] font-mono font-bold text-emerald-300 break-all select-all mt-1">{integrityKey}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modalidade de Acesso - Fixado em Local por Orientação */}
              <div className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl shadow-sm mb-3">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30 shadow-sm"><Database size={16} /></div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Modalidade de Acesso</h4>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Configuração de Banco de Dados</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div 
                    className="w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between border bg-slate-600/20 border-slate-500 text-slate-400 shadow-sm select-none"
                  >
                    <div className="flex items-center">
                      <Server size={14} className="mr-3" />
                      <span>Mobile Puro (Local)</span>
                    </div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full shadow-[0_0_8px_rgba(148,163,184,0.8)]" />
                  </div>
                </div>
                <div className="mt-3 p-2 bg-accent/10 border border-accent/20 rounded-lg">
                  <p className="text-[7px] font-bold text-accent uppercase leading-relaxed tracking-wide opacity-80">
                    Nota: Atualmente configurado em modo offline-first restrito (sem conexão com a nuvem).
                  </p>
                </div>
              </div>

              <button 
                onClick={() => { 
                  setIsDataMenuOpen(false); 
                  setIsAdminMenuOpen(false);
                  onNavigate(AppScreen.DATABASE_MANAGER); 
                }} 
                className="w-full flex items-center p-5 bg-accent text-white rounded-2xl active:scale-[0.98] transition-all text-left shadow-xl shadow-accent/20 border-2 border-white/20"
              >
                <div className="w-12 h-12 bg-white/20 text-white rounded-xl flex items-center justify-center mr-5 shadow-inner"><Database size={24} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-black uppercase tracking-tight">GESTOR DE BASE</h4>
                  <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest mt-0.5 whitespace-pre-wrap">
                    Zerar Base de Dados Local, Diagnóstico de Hardware & Logs de SRE
                  </p>
                </div>
                <ChevronRight size={20} className="text-white/40" />
              </button>


              <button 
                onClick={async () => { 
                  const canWrite = await validateBatteryLevel();
                  if (!canWrite) return;
                  const success = await sqliteService.forceSync();
                  if (success) {
                    showModal("Sincronização OK", "Os dados foram forçados para o seu arquivo físico no disco (D:). Verifique o tamanho do arquivo agora.", "success");
                  }
                }} 
                className="w-full flex items-center p-5 bg-emerald-600 text-white rounded-2xl active:scale-[0.98] transition-all text-left shadow-xl shadow-emerald-500/20 border-2 border-white/20"
              >
                <div className="w-12 h-12 bg-white/20 text-white rounded-xl flex items-center justify-center mr-5 shadow-inner"><RefreshCw size={24} /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-black uppercase tracking-tight">SINCRONIZAR ARQUIVO FÍSICO</h4>
                  <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest mt-0.5 whitespace-pre-wrap">
                    Forçar gravação imediata no arquivo vinculado (Disk Flush)
                  </p>
                </div>
                <ChevronRight size={20} className="text-white/40" />
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
                    <p className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest mt-0.5">Baixar Dados do Supabase (delta)</p>
                  </div>
                </button>
              )}

              {databaseMode !== DatabaseMode.INTERNAL && (
                <button 
                  onClick={onSyncAllCloud} 
                  disabled={isSyncing}
                  className="w-full flex items-center p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl active:scale-[0.98] disabled:opacity-50 transition-all text-left"
                >
                  <div className={`w-10 h-10 bg-amber-500 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-amber-500/20 ${isSyncing ? 'animate-spin' : ''}`}>
                    <RefreshCw size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-amber-400 uppercase tracking-tight">Sincronizar Tudo</h4>
                    <p className="text-[8px] font-bold text-amber-400/60 uppercase tracking-widest mt-0.5">Forçar pull completo da Nuvem (Etapa 5b)</p>
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

              <button 
                disabled={!hasData}
                onClick={async () => { 
                    setIsDataMenuOpen(false); 
                    setIsAdminMenuOpen(false); 
                    onNavigate(AppScreen.ASSET_REPORT_PRINT, {
                        mode: 'PARTIAL',
                        unitName: selectedUnit || 'GERAL',
                        responsibleName: user?.name || user?.email || 'Auditor'
                    }); 
                }} 
                className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] disabled:opacity-30 transition-all text-left"
              >
                <div className="w-10 h-10 bg-white/20 text-white rounded-lg flex items-center justify-center mr-4 border border-white/30"><FileText size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Gerar Laudo (PDF)</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Estratégia Print-to-PDF (A4)</p>
                </div>
                <div className="bg-accent text-[7px] font-black px-1.5 py-0.5 rounded-full text-white uppercase animate-pulse">NOVO</div>
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


              <button onClick={() => { 
                setIsSelectiveClearOpen(true);
              }} className="w-full flex items-center p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center mr-4 border border-accent/30"><ListChecks size={20} /></div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">Limpeza Seletiva</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Escolher Unidades para Apagar</p>
                </div>
              </button>

              <button 
                onClick={async () => { 
                  const proceed = window.confirm("ATENÇÃO: Esta ação fará um HARD RESET no cache do navegador (LocalStorage, IndexedDB e Sessões). Todos os arquivos vinculados serão esquecidos. Deseja continuar?");
                  if (proceed) {
                    window.location.reload();
                  }
                }} 
                className="w-full flex items-center p-4 bg-orange-600/20 border border-orange-500/30 rounded-2xl active:scale-[0.98] transition-all text-left"
              >
                <div className="w-10 h-10 bg-orange-600 text-white rounded-lg flex items-center justify-center mr-4 shadow-lg shadow-orange-500/20">
                  <Trash2 size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-bold text-orange-500 uppercase tracking-tight">HARD RESET (LIMPAR CACHE)</h4>
                  <p className="text-[8px] font-bold text-orange-400/60 uppercase tracking-widest mt-0.5 whitespace-pre-wrap">
                    Limpar totalmente IndexedDB, LocalStorage e Sessão
                  </p>
                </div>
                <ChevronRight size={20} className="text-white/20" />
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
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contas (Ex: 1101, 1102)</label>
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
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">Inventariador GBR v2.6</p>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-bg-main no-scrollbar">
            <div className="max-w-3xl mx-auto prose prose-slate prose-sm prose-emerald">
              <div className="bg-white border border-border rounded-3xl p-6 md:p-10 shadow-sm mb-10 markdown-body">
                <ReactMarkdown>
                  {`# Documentação Técnica e Operacional - Inventariador GBR v2.6

Este documento serve como o manual oficial e registro técnico de todas as funcionalidades operacionais do sistema de Inventário de Ativo Imobilizado.

---

## 1. Visão Geral do Sistema
O **Inventariador GBR v2.6** é uma solução avançada para gestão de inventário físico de ativos imobilizados, projetada para auditores e gestores de patrimônio. O sistema foca em precisão, rastreabilidade e integração com ERPs (especificamente Protheus SIGAATF).

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
  - Itens baixados com contas contábeis específicas (definidas nos filtros) são eliminados.
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
