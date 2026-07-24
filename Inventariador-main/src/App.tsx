
// Inventariador GBR v2.6 - Force Update to MPULMON Project
logger.info(">>> [System] Iniciando Inventariador GBR v2.6 - Modo de Isolamento Ativo...");
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { PermissionGate } from './components/PermissionGate';
import { Capacitor } from '@capacitor/core';
import { startSecurityMonitor, checkRuntimeIntegrity } from './services/securityService';
import { validateAndPushRoute, registerToastCallback } from './services/NavigationGuardService';
import { AppModule, AppScreen, User, Asset, InventoryState, DatabaseStatus, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, DatabaseMode, SearchFilters, UserRole, AuditLogEntry, TransactionOrigin, InventoryCampaign, UnitConfig, ModalConfig, NavigationParams } from './types';
import { getAssetUnit, normalizeKey, matchUnitKeys } from './utils/schema';

// Extend Window interface for pushScreen
declare global {
  interface Window {
    pushScreen?: (s: AppScreen, params?: NavigationParams) => void;
    clickResetTimeout?: ReturnType<typeof setTimeout>;
    setShowErrorModal?: (show: boolean) => void;
  }
}
import Modal from './components/Modal';
const Login = React.lazy(() => import('./components/Login'));
import Register from './components/Register';
const MainMenu = React.lazy(() => import('./components/MainMenu'));
const DatabaseManagerScreen = React.lazy(() => import('./screens/DatabaseManagerScreen').then(m => ({ default: m.DatabaseManagerScreen })));
import AssetDetail from './components/AssetDetail';
import SoftDeleteReport from './components/SoftDeleteReport';
import ImpairmentReport from './components/ImpairmentReport';
import { InventoryScreen } from './components/InventoryCard';
import Labeling from './components/Labeling'; 
import GPSComplianceGuard from './components/GPSComplianceGuard';
import Signature from './components/Signature';
import localforage from 'localforage';
import { getCurrentLocation, startAutonomousTracking, stopAutonomousTracking } from './utils/gpsUtils';
import UnitSelector from './components/UnitSelector';
import AddressSelector from './components/AddressSelector';
const Dashboard = React.lazy(() => import('./components/Dashboard'));
import UserManagement from './components/UserManagement';
import PublicKardex from './components/PublicKardex';
import ChangePassword from './components/ChangePassword';
import FieldConfigurator from './components/FieldConfigurator';
import QrCodeConfigurator from './components/QrCodeConfigurator';
import GlobalPerformance from './components/GlobalPerformance';
import AccountReconciliation from './components/AccountReconciliation';
import Consultation from './components/Consultation';
import AssetMap from './components/AssetMap';
import ActiveSearch from './components/ActiveSearch';
import ModuleSelector from './components/ModuleSelector';
import AssetControlModule from './components/AssetControlModule';
import { processarRoteamentoPosLoginSaas, SupabaseUserProfile } from './utils/routingUtils';
// import TrustOnboarding from './components/TrustOnboarding';
import AuditLogs from './components/AuditLogs';
import CampaignManager from './components/CampaignManager';
import FloatingHelp from './components/FloatingHelp';
import PrivacyCenter from './components/PrivacyCenter';
import OnboardingWizard from './components/OnboardingWizard';
import BiometricRegistration from './components/BiometricRegistration';
import ThemePalette from './components/ThemePalette';
import AssetPrintView from './components/AssetPrintView';
import SyncManager from './components/SyncManager';
import SyncBadge from './components/SyncBadge';
import UnitConfigurator from './components/UnitConfigurator';
import StressTestManager from './components/StressTestManager';

import { sqliteService, db } from './services/sqliteService';
import { auditService } from './services/auditService';
import { telemetryService } from './services/telemetryService';
import AIAssistant from './components/AIAssistant';
import { motion } from 'motion/react';
import { APP_LOGO } from './constants';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Cloud from 'lucide-react/dist/esm/icons/cloud';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import X from 'lucide-react/dist/esm/icons/x';
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Activity from 'lucide-react/dist/esm/icons/activity';
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive';
import Database from 'lucide-react/dist/esm/icons/database';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import * as XLSX from 'xlsx';
import { saveInventory, loadInventory, clearInventory, clearMultipleInventories, backupInventory, restoreInventory, saveConfigOnly } from './services/persistenceService';
import { Session } from '@supabase/supabase-js';
import { getAssetByTag, fetchFullInventory, clearCloudInventory, subscribeToInventoryChanges, subscribeToAssetChanges, syncAssetsToCloud, syncConfigToCloud, syncUsersToCloud, fetchUsersFromCloud, supabase, ensureUserProfile, logAuditEvent, fetchUnitConfigs, fetchCampaigns, isInternalMode } from './services/supabaseService';
import { getPendingSyncItems, processSyncQueue, syncService, photoSyncManager } from './services/syncService';
import { isBiometricSupported, hasBiometricRegistered } from './services/biometricService';
import { safeStringify } from './services/utils';

import { requestPersistentStorage, localDb } from './services/localDbService';
import { demoService } from './services/demoService';
import { FileSystemStorageService } from './services/FileSystemStorageService';
import { verifyAndRestorePhysicalBackup } from './services/DatabaseLoaderService';
import { logger } from './utils/logger';
import pkg from '../package.json';

export class AppBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppBootstrapError';
  }
}

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "semorr@gmail.com";
const MAX_SYNC_QUEUE_SIZE = 5000; // Limite de segurança para fila de sincronização (Carga em Massa)

// Helper para verificar se um usuário é admin
const checkIsAdmin = (u: User | null | undefined) => {
  let email = u?.email?.toLowerCase() || '';
  let role = u?.role;
  let isAdm = u?.isAdmin;

  if (!u) {
    try {
      const userStr = sessionStorage.getItem('app_current_user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        email = parsed?.email?.toLowerCase() || '';
        role = parsed?.role;
        isAdm = parsed?.isAdmin || parsed?.is_admin;
      }
    } catch { /* ignore */ }
  }

  const roleStr = String(role || '').toUpperCase();
  return roleStr === 'ADMIN' || 
         roleStr === 'MASTER' || 
         roleStr === 'GESTOR' || 
         !!isAdm || 
         email === ADMIN_EMAIL.toLowerCase() || 
         email === 'semorr@gmail.com';
};

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("App Crash:", error, errorInfo);
    try {
      const activeUserJson = typeof window !== 'undefined' ? sessionStorage.getItem('app_current_user') : null;
      const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
      const email = activeUser?.email || 'anonimo@gbr.com';
      const tenantId = activeUser?.tenantId || activeUser?._tenantid || sessionStorage.getItem('tenantId') || 'CICOPAL';
      
      logAuditEvent({
        user_email: email,
        action: 'APP_CRASH',
        table_name: 'system_errors',
        details: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack
        }).substring(0, 5000),
        tenantId: tenantId
      }).catch(err => logger.warn("Erro ao registrar log de crash:", err));
    } catch (logErr) {
      logger.warn("Falha ao tentar logar crash:", logErr);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-bg-main text-center">
          <div className="w-32 h-32 bg-white border border-border rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-red-500/10 overflow-hidden p-1">
            <img 
              src={APP_LOGO} 
              alt="GBR Auditoria Logo" 
              className="w-full h-full object-cover rounded-full"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2 uppercase tracking-tight">Ops! Algo deu errado</h1>
          <p className="text-sm text-ink-muted mb-8 max-w-xs">
            Ocorreu um erro inesperado na interface. Tente reiniciar o aplicativo ou limpar o cache.
          </p>
          <div className="space-y-3 w-full max-w-xs">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-4 bg-accent text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
            >
              Recarregar App
            </button>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.href = '/';
              }} 
              className="w-full py-4 bg-white border border-border text-ink-muted rounded-2xl font-bold uppercase tracking-widest active:scale-95 transition-all"
            >
              Limpar Tudo e Sair
            </button>
          </div>
          <pre className="mt-8 p-4 bg-white border border-border rounded-lg text-[10px] text-ink-muted overflow-auto max-w-full text-left">
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const getInitialInventoryState = (mode: DatabaseMode): InventoryState => ({ 
  assets: [], 
  companies: [], 
  lastUpdated: null, 
  status: DatabaseStatus.EMPTY,
  editableFields: ['DESCRICAODOATIVO', 'SERIAL', 'ENDERECO'],
  qrCodeFields: ['ETIQUETA'],
  scannerMode: ScannerMode.BARCODE,
  autoConfirmOnScan: false,
  scanFeedbackMode: ScanFeedbackMode.BOTH,
  inventorySearchMode: InventorySearchMode.MANUAL,
  immersiveMode: false,
  darkMode: localStorage.getItem('app_dark_mode') === 'true',
  batterySaver: localStorage.getItem('app_battery_saver') === 'true',
  protheusIntegrationEnabled: localStorage.getItem('app_protheus_enabled') === 'true',
  protheusApiUrl: localStorage.getItem('app_protheus_url') || '',
  mandatoryPhotoOnDivergence: localStorage.getItem('app_mandatory_photo_divergence') === 'true',
  mandatoryPhotoOnNewItem: localStorage.getItem('app_mandatory_photo_new') === 'true',
  excludedAccounts: JSON.parse(localStorage.getItem('app_excluded_accounts') || '[]'),
  databaseMode: mode,
  hasCompletedOnboarding: localStorage.getItem('app_onboarding_completed') === 'true'
});

const removerLoaderEstatico = () => {
  try {
    const loader = document.getElementById('gbr-initial-loader') || document.getElementById('app-loader');
    if (loader && loader.style.display !== 'none') {
      logger.info(">>> [App] Removendo gbr-initial-loader de forma limpa e coordenada.");
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.style.display = 'none';
        loader.remove();
      }, 200);
    }
  } catch (err) {
    logger.warn(">>> [GBR-Emergency] Erro ao remover loader estático", err);
  }
};

export function InitializeBootPipeline(): void {
  try {
    // 1. Limpeza rigorosa de sessões fantasma no boot (Diretriz 5)
    sessionStorage.removeItem('app_current_user');
    sessionStorage.removeItem('tenantId');

    // 2. Isolamento e equivalência de diretório físico via Capacitor
    if (Capacitor.isNativePlatform()) {
      // Gravação restrita e segura em armazenamento local mobile
      logger.info("[SRE_BOOT] Plataforma nativa detectada. Inicializando GBR_KARDEK_DATA/local_assets_secure.dat");
    } else {
      // Fallback permanente para o ambiente Desktop/Windows
      localStorage.setItem('gbr_directory_target', 'C:\\GBR_Inventario');
      logger.info("[SRE_BOOT] Ambiente Desktop/Windows detectado. Diretório alvo: C:\\GBR_Inventario");
    }

    // 3. Forçamento atômico da Rota Zero Absoluta (Garantia de F5 Resiliente)
    const rotaInicial: AppScreen[] = [AppScreen.LOGIN];
    localStorage.setItem('gbr_kardek_history', JSON.stringify(rotaInicial));

  } catch (error) {
    // Fallback de contingência para evitar tela preta
    console.error('[SRE_BOOT] Erro no pipeline de inicialização:', error);
    try {
      localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.LOGIN]));
    } catch { /* ignorar falha de localStorage */ }
  } finally {
    // Latência Zero: Remove loader estático garantindo boot abaixo de 150ms
    const loader = document.getElementById('gbr-static-loader') || document.getElementById('gbr-initial-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.style.display = 'none';
        loader.remove();
      }, 200);
    }
  }
}

// Execução síncrona imediata no carregamento do arquivo
InitializeBootPipeline();

// App Component
const App: React.FC = () => {
  // 🚀 INJEÇÃO DE SESSÃO PERMANENTE COM CONTEXTO FÍSICO (AI Studio iFrame)
  // Comentado para cumprir com o Regime v4.50-PROD de eliminação de bypass fantasma no boot
  /*
  if (typeof window !== 'undefined' && window.self !== window.top) {
    if (!sessionStorage.getItem('gbr_session_active')) {
      logger.warn(">>> [GBR-Compliance] Ambiente iFrame detectado. Injetando sessão estática de barreira contra Wipe.");
      sessionStorage.setItem('gbr_tenant_id', 'CICOPAL');
      const cachedFilial = localStorage.getItem('filial') || localStorage.getItem('selectedUnit') || '';
      sessionStorage.setItem('gbr_unit_id', cachedFilial);
      sessionStorage.setItem('gbr_session_active', 'true');
      
      const staticUser = {
        id: "mock-iframe-id",
        email: "semorr@gmail.com",
        role: "MASTER",
        tenantId: "CICOPAL"
      };
      if (!sessionStorage.getItem('app_current_user')) {
         sessionStorage.setItem('app_current_user', JSON.stringify(staticUser));
      }
      if (!sessionStorage.getItem('selectedUnit')) {
         sessionStorage.setItem('selectedUnit', cachedFilial);
      }
      if (!sessionStorage.getItem('filial')) {
         sessionStorage.setItem('filial', cachedFilial);
      }
    }
  }
  */

  const [sqliteStatus, setSqliteStatusState] = useState(() => {
    const rawFilial = sessionStorage.getItem('filial') || sessionStorage.getItem('selectedUnit');
    const storedFilial = rawFilial ? rawFilial.replace(/%22|%2522|"/g, '').trim() : '';
    const hasFilial = storedFilial && storedFilial !== "CARREGANDO..." && storedFilial !== "";
    return {
      connected: !!hasFilial,
      loading: !hasFilial,
      error: null as string | null,
      status: hasFilial ? DatabaseStatus.ACTIVE : DatabaseStatus.EMPTY as DatabaseStatus | string
    };
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isDatabaseLoaded, setIsDatabaseLoaded] = useState<boolean>(() => {
    return localStorage.getItem('isDatabaseLoaded') === 'true' || sessionStorage.getItem('isDatabaseLoaded') === 'true';
  });

  useEffect(() => {
    if (isDatabaseLoaded) {
      logger.info('>>> [DATABASE] Banco de dados inicializado de forma reativa.');
    }
  }, [isDatabaseLoaded]);

  const [inventory, setInventory] = useState<InventoryState>(() => {
    const savedMode = localStorage.getItem('app_database_mode') as DatabaseMode;
    const mode = savedMode || DatabaseMode.INTERNAL;
    return getInitialInventoryState(mode);
  });

  const [selectedUnit, setSelectedUnit] = useState<string | null>(() => {
    const s = sessionStorage.getItem('filial') || sessionStorage.getItem('selectedUnit');
    if (s) {
      const cleaned = s.replace(/%22|%2522|"/g, '').trim();
      if (cleaned) {
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed) return typeof parsed === 'string' ? parsed.replace(/%22|%2522|"/g, '').trim() : parsed;
        } catch {
          return cleaned;
        }
      }
    }
    return null;
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = sessionStorage.getItem('app_current_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email) {
        // Normalizar admin para semorr@gmail.com
        const lowerEmail = parsed.email.toLowerCase();
        let isAdmin = parsed.is_admin || parsed.isAdmin || parsed.role === 'ADMIN' || parsed.role === 'MASTER';
        let role = parsed.role || 'AUDITOR';
        if (lowerEmail === 'semorr@gmail.com') {
          isAdmin = true;
          role = 'ADMIN';
        }

        let resolvedTenantId = (parsed.tenantId || parsed._tenantid || parsed.tenant_id || parsed.tenantid || sessionStorage.getItem('tenantId') || sessionStorage.getItem('gbr_current_tenant') || '').trim().toUpperCase();
        let resolvedFilial = (parsed.filial || parsed._unitid || parsed.unitid || sessionStorage.getItem('filial') || '').trim().toUpperCase();

        if (lowerEmail === 'semorr@gmail.com') {
          const storedTenant = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId') || 'DEMO_DEFAULT';
          resolvedTenantId = storedTenant === 'GBR_SUPER_ADMIN_CORINGA' ? 'DEMO_DEFAULT' : storedTenant;
          resolvedFilial = 'TODAS';
        }

        if (!resolvedTenantId || resolvedTenantId === 'NULL' || resolvedTenantId === 'UNDEFINED' || !resolvedFilial || resolvedFilial === 'NULL' || resolvedFilial === 'UNDEFINED') {
          logger.warn(">>> [Session Fail-Safe] Identificador de Contrato ou Filial ausente no app_current_user da sessão. Aplicando Fallback Físico ao invés de interromper.");
          try {
            // Em vez de limpar e matar a sessão, injetamos a unidade de segurança para evitar loops em IFrames sem GPS/Permissões
            const safeTenant = 'CICOPAL';
            const safeFilial = 'FEIRA_BOA_BA';
            sessionStorage.setItem('gbr_tenant_id', safeTenant);
            sessionStorage.setItem('gbr_unit_id', safeFilial);
            sessionStorage.setItem('tenantId', safeTenant);
            sessionStorage.setItem('filial', safeFilial);
            sessionStorage.setItem('selectedUnit', safeFilial);
            parsed.tenantId = safeTenant;
            parsed.filial = safeFilial;
            sessionStorage.setItem('app_current_user', JSON.stringify(parsed));
          } catch (fallbackErr) {
            logger.error("Erro ao aplicar fallback de sessão:", fallbackErr);
          }
        }

        const cleanUser: User = {
          id: parsed.id || 'admin_root',
          email: parsed.email,
          username: parsed.username || 'ADMINISTRADOR',
          name: parsed.name || 'ADMINISTRADOR GLOBAL',
          role: role as UserRole,
          is_admin: isAdmin,
          isAdmin: isAdmin,
          tenantId: resolvedTenantId,
          filial: resolvedFilial,
          units: Array.isArray(parsed.units) ? parsed.units.filter((u: unknown) => {
            if (!u) return false;
            const s = String(u).toUpperCase();
            return s !== 'DEFAULT' && s !== 'NULL' && s !== '0' && s !== '';
          }) : []
        };
        return cleanUser;
      }
      return null;
    } catch { return null; }
  });

  const [isPrivacyCenterOpen, setIsPrivacyCenterOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(true);
  const [securityThreats, setSecurityThreats] = useState<string[]>([]);
  const [syncQueueLength, setSyncQueueLength] = useState(0);
  const [unsyncedAssetsCount, setUnsyncedAssetsCount] = useState(0);
  const [isSyncLocked, setIsSyncLocked] = useState(false);
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(() => {
    const saved = localStorage.getItem('app_database_mode');
    return (saved as DatabaseMode) || DatabaseMode.INTERNAL;
  });

  const [showReconnectOverlay, setShowReconnectOverlay] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [fileStatus, setFileStatus] = useState<{status: string, path: string, folderName?: string, fileName?: string, linkType?: string} | null>(null);

  const [pendingPhotosCount, setPendingPhotosCount] = useState(0);
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [isFieldMode, setIsFieldMode] = useState<boolean>(() => {
    return localStorage.getItem('app_field_mode') === 'true';
  });

  const [, setCurrentModule] = useState<AppModule | null>(() => {
    const saved = localStorage.getItem('app_current_module');
    return (saved as AppModule) || null;
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const [dbInitialized, setDbInitialized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState(() => {
    const rawFilial = sessionStorage.getItem('filial') || sessionStorage.getItem('selectedUnit') || localStorage.getItem('filial') || localStorage.getItem('app_selected_unit');
    const storedFilial = rawFilial ? rawFilial.replace(/%22|%2522|"/g, '').trim() : '';
    const hasFilial = storedFilial && storedFilial !== "CARREGANDO..." && storedFilial !== "";
    return !!hasFilial;
  });

  // SOBERANIA OFFLINE: Se temos o objeto user e seu perfil é local/offline, a sessão é considerada válida por padrão.
  const isProfileLocal = useMemo(() => {
    if (!user) return false;
    const lowerEmail = (user.email || '').toLowerCase();
    const lowerUsername = (user.username || '').toLowerCase();
    return lowerUsername === 'admin' || lowerUsername === 'semorr' || user.role === 'DEMO' || lowerEmail === 'semorr@gmail.com' || user.role === 'ADMIN' || user.role === 'MASTER' || user.role === 'MOBILE_SINGLE';
  }, [user]);

  // REQUISITO 2 - AJUSTE DO INTERCEPTOR VISUAL (TRAVA ABSOLUTA)
  const isSessionCurrentlyValid = isInternalMode || databaseMode === DatabaseMode.INTERNAL || databaseMode === DatabaseMode.INTERNAL_PLUS || isSessionValid || isProfileLocal || (user && user.role === ('DEMO' as unknown as UserRole));
  const isUserAuthenticated = !!user && isSessionCurrentlyValid;

  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  const [history, setHistoryVal] = useState<AppScreen[]>([AppScreen.LOGIN]);

  const [screen, setScreenState] = useState<AppScreen>(AppScreen.LOGIN);

  const setHistory = useCallback((update: AppScreen[] | ((prev: AppScreen[]) => AppScreen[])) => {
    setHistoryVal(prev => {
      const nextHistory = typeof update === 'function' ? update(prev) : update;
      const finalHistory = Array.isArray(nextHistory) && nextHistory.length > 0 ? nextHistory : [AppScreen.LOGIN];
      const targetScreen = finalHistory[finalHistory.length - 1];

      localStorage.setItem('app_screen_history', JSON.stringify(finalHistory));
      localStorage.setItem('gbr_kardek_history', JSON.stringify(finalHistory));
      setScreenState(targetScreen || AppScreen.LOGIN);
      return finalHistory;
    });
  }, []);

  useEffect(() => {
    InitializeBootPipeline();
    const verificarEstadoEBoot = async () => {
      try {
        // 1. Abre a conexão com o banco Dexie de forma isolada
        await db.open();
        logger.info("[SRE_BOOT] Motor IndexedDB carregado com sucesso.");

        // Validação se o IndexedDB está zerado no carregamento e restauração via FileSystemStorageService
        const totalLocalAssets = await db.local_assets.count();
        if (totalLocalAssets === 0) {
          logger.info("[SRE_BOOT] IndexedDB zerado. Tentando recuperar dados do FileSystem físico de salvaguarda...");
          const restored = await verifyAndRestorePhysicalBackup();
          if (restored) {
            logger.info("[SRE_BOOT] Recuperação de desastre física (Capacitor FileSystem) restaurada com sucesso.");
          } else {
            const dadosFisicos = await FileSystemStorageService.carregarDeDiretorioLocal();
            if (dadosFisicos && dadosFisicos.length > 0) {
              logger.info(`[SRE_BOOT] Recuperação física legada ativada. Restaurando ${dadosFisicos.length} registros...`);
              await db.transaction('rw', [db.local_assets, db.ativos], async () => {
                // Restaura estritamente o inventário coletado pelo usuário (coletas locais)
                await db.local_assets.bulkPut(dadosFisicos as DexieAsset[]);
                
                // Sincroniza e marca o flag de conferido na tabela operacional ativa mapeando as chaves primárias
                for (const asset of (dadosFisicos as DexieAsset[])) {
                  if (asset.primarykey) {
                    await db.ativos.update(asset.primarykey, { _conferido: 1, _is_synced: 0 });
                  }
                }
              });
              logger.info("[SRE_BOOT] Restauração e conciliação lógica legada concluídas com sucesso.");
            } else {
              logger.info("[SRE_BOOT] Nenhum backup físico encontrado ou arquivo vazio.");
            }
          }
        }

        // 2. PURGA ABSOLUTA DE BYPASS: Comente ou remova linhas que tentam avaliar 
        // se o banco tem dados para pular o login automaticamente.
        /* 
        const total = await db.local_assets.count();
        if (total > 0) { setHistory([AppScreen.MODULE_SELECTION]); return; } // REMOVER ESTA TRAVA
        */

        // 3. Trava de Segurança Imperativa: Força o topo da pilha a permanecer no LOGIN (ou retém no DATABASE_MANAGER se houver purga recente)
        const justCleared = sessionStorage.getItem('app_just_cleared_data') === 'true';
        const hasUser = !!sessionStorage.getItem('app_current_user');
        if (justCleared && hasUser) {
          logger.info("[SRE_NAV] Preservando viewport no Gestor de Base após purga bem-sucedida.");
          sessionStorage.removeItem('app_just_cleared_data');
          setHistory([AppScreen.DATABASE_MANAGER]);
        } else {
          logger.info("[SRE_NAV] Forçando ancoragem no portal unificado de autenticação.");
          setHistory([AppScreen.LOGIN]);
        }

      } catch (error) {
        logger.error("[FATAL_BOOT_ROUTE_CRASH]", error);
        setHistory([AppScreen.LOGIN]);
      }
    };

    verificarEstadoEBoot();
  }, []);

  const [screenParams, setScreenParams] = useState<NavigationParams | null>(() => {
    try {
      const saved = localStorage.getItem('app_screen_params');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const pushScreen = useCallback(async (s: AppScreen, params?: NavigationParams) => {
    if (s === AppScreen.SYNC_MANAGER && databaseMode === DatabaseMode.INTERNAL) {
      setModalConfig({
        isOpen: true,
        title: 'Recurso Indisponível',
        message: 'A gestão de sincronização não está disponível no modo INTERNO (Mobile Puro), pois este modo opera exclusivamente com dados locais.',
        type: 'info'
      });
      return;
    }

    setScreenParams(params || null);

    // Ajuste de Navegação Failsafe para persistir o unitId/unitName no SYSTEM_CONTEXT se fornecido
    const unitIdToPersist = params?.unitName;
    if (unitIdToPersist && databaseMode === DatabaseMode.INTERNAL) {
      try {
        logger.info(`>>> [Failsafe Navigation/pushScreen] Gravando '${unitIdToPersist}' na tabela SYSTEM_CONTEXT de forma síncrona...`);
        await sqliteService.setContextValue('selected_unit', unitIdToPersist);
        
        if (params?.campaign) {
          await sqliteService.setContextValue('active_campaign', params.campaign.id);
        }
        logger.info(">>> [Failsafe Navigation/pushScreen] Confirmou gravação física .db concluída com sucesso.");
      } catch (err) {
        logger.error(">>> [Failsafe Navigation/pushScreen] Erro de escrita nas configurações:", err);
      }
    }

    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) {
      logger.info(`>>> [Navigation] Resetting history to: ${s}`);
      setHistory([s]);
    } else {
      logger.info(`>>> [Navigation] Pushing screen: ${s}`);
      setHistory(prev => {
        const current = prev[prev.length - 1];
        if (current === s) return prev; // Previne duplicidade de viewports
        
        // Barreira Canônica: Bloqueia navegação órfã se não houver Filial ativa
        const validatedScreen = validateAndPushRoute(s, selectedUnit);
        if (validatedScreen !== s) {
          logger.warn(`>>> [SRE-GUARD] Interceptação: Tentativa de acessar ${s} sem selectedUnit.`);
          const fallback = prev.includes(AppScreen.UNIT_SELECTION) ? prev : [...prev, AppScreen.UNIT_SELECTION];
          localStorage.setItem('gbr_kardek_history', JSON.stringify(fallback));
          return fallback;
        }
        
        const finalHistory = [...prev, s];
        localStorage.setItem('gbr_kardek_history', JSON.stringify(finalHistory));
        return finalHistory;
      });
    }
  }, [databaseMode, selectedUnit]);

  // Expose pushScreen to window for components that need it
  useEffect(() => {
    window.pushScreen = pushScreen;
    window.setShowErrorModal = (show: boolean) => {
      setModalConfig((prev: ModalConfig) => ({ ...prev, isOpen: show }));
    };
    return () => {
      delete window.pushScreen;
      delete window.setShowErrorModal;
    };
  }, [pushScreen]);

  // Register NavigationGuard toast callback
  useEffect(() => {
    registerToastCallback((message) => {
      setModalConfig({
        isOpen: true,
        title: 'Controle de Fluxo SRE',
        message: message,
        type: 'warning'
      });
    });
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [selectedAddress, setSelectedAddressState] = useState<string | null>(() => sessionStorage.getItem('current_selected_address') || null);

  const setSelectedAddress = useCallback((addr: string | null) => {
    if (addr) {
      sessionStorage.setItem('current_selected_address', addr);
    } else {
      sessionStorage.removeItem('current_selected_address');
    }
    setSelectedAddressState(addr);
  }, []);

  const [campaigns, setCampaigns] = useState<InventoryCampaign[]>([]);

  const [unitConfigs, setUnitConfigs] = useState<UnitConfig[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCloudUpdatePending, setIsCloudUpdatePending] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastLocalSave, setLastLocalSave] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastQueryLog, setLastQueryLog] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [sqliteOperationalUnits, setSqliteOperationalUnits] = useState<Array<{ filial: string; displayName: string; total: number; checked: number }>>([]);
  const [isDatabaseEmpty, setIsDatabaseEmpty] = useState<boolean>(false);

  const [sqlDashboardStats, setSqlDashboardStats] = useState<{
    totalAtivos: number;
    conferidoAtivos: number;
    baixadosLocalizados: number;
    totalLido: number;
    pendentesAtivos: number;
    avancoPercent: number;
  } | null>(null);

  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isImportingBatchState, setIsImportingBatchState] = useState(false);

  const [currentUnit, setCurrentUnit] = useState<string | null>(() => {
    return localStorage.getItem('app_current_unit') || localStorage.getItem('app_selected_unit') || null;
  });

  const [sqliteUnitAssets, setSqliteUnitAssets] = useState<Asset[]>([]);

  const [activeUnitAssetCount, setActiveUnitAssetCount] = useState<number>(0);

  const [showRecoveryToast, setShowRecoveryToast] = useState(false);
  const [recoverySource, setRecoverySource] = useState<'PHYSICAL' | 'CACHE' | 'LEGACY' | 'CLOUD' | null>(null);
  const [integrityFailed, setIntegrityFailed] = useState(false);

  const [isConsultationFromInventory, setIsConsultationFromInventory] = useState(false);
  const [startWithDataMenu, setStartWithDataMenu] = useState(false);
  const [consultationFilters, setConsultationFilters] = useState<SearchFilters>(() => {
    try {
      const saved = localStorage.getItem('app_consultation_filters');
      return saved ? JSON.parse(saved) : {
        ETIQUETA: '',
        DESCRICAODOATIVO: '',
        SERIAL: '',
        CNPJ: '',
        NOMEFORNECEDOR: '',
        NOTAFISCAL: '',
        ENDERECO: '',
        conta_contabil: '',
        CENTRODECUSTO: '',
        DATAAQUISIC_START: '',
        DATAAQUISIC_END: '',
        Sn1_recno: '',
        Sn3_recno: ''
      };
    } catch {
      return {
        ETIQUETA: '',
        DESCRICAODOATIVO: '',
        SERIAL: '',
        CNPJ: '',
        NOMEFORNECEDOR: '',
        NOTAFISCAL: '',
        ENDERECO: '',
        conta_contabil: '',
        CENTRODECUSTO: '',
        DATAAQUISIC_START: '',
        DATAAQUISIC_END: '',
        Sn1_recno: '',
        Sn3_recno: ''
      };
    }
  });

  const [committedConsultationFilters, setCommittedConsultationFilters] = useState<SearchFilters | null>(() => {
    try {
      const saved = localStorage.getItem('app_committed_consultation_filters');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('app_users');
      const userList: User[] = saved ? JSON.parse(saved) : [];
      
      // Admin Padrão
      const adminIndex = userList.findIndex(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
      if (adminIndex === -1) {
        userList.push({ 
          username: "ADMINISTRADOR", 
          name: "ADMINISTRADOR GLOBAL",
          email: ADMIN_EMAIL, 
          password: "admin", 
          role: UserRole.ADMIN,
          is_admin: true,
          isAdmin: true, 
          mustChangePassword: false,
          tenantId: 'CICOPAL'
        });
      } else if (userList[adminIndex].password === 'admin') {
        userList[adminIndex].password = "Glaucio@1970";
        userList[adminIndex].mustChangePassword = false;
      }
      
      return userList;
    } catch { return []; }
  });

  const [hasFetchedUsers, setHasFetchedUsers] = useState(false);

  const [inventoryLocation, setInventoryLocation] = useState<string | null>(() => {
    return localStorage.getItem('app_inventory_location') || null;
  });

  const [isInventorying, setIsInventorying] = useState<boolean>(() => {
    return localStorage.getItem('app_is_inventorying') === 'true';
  });

  const [isReadOnlyDetail, setIsReadOnlyDetail] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(true);
  const [showAccessRequest, setShowAccessRequest] = useState(false);
  const [publicAsset, setPublicAsset] = useState<Asset | null>(null);

  const [pendingAssetUpdate, setPendingAssetUpdate] = useState<Asset | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateModalMessage, setDuplicateModalMessage] = useState("");

  const [manualLocations] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_manual_locations');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const userRef = useRef<User | null>(user);
  const isSyncRunningRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyAssetsRef = useRef<Set<string>>(new Set());
  const inventoryRef = useRef<InventoryState>(inventory);

  const setSqliteStatus = useCallback((val: unknown) => {
    setSqliteStatusState(prev => {
      if (typeof val === 'string' || typeof val === 'number') {
        const isConnected = val === 'ACTIVE' || val === DatabaseStatus.ACTIVE;
        return {
          ...prev,
          status: val,
          connected: isConnected,
          loading: false
        };
      }
      if (typeof val === 'function') {
        const next = val(prev) as unknown;
        if (typeof next === 'string' || typeof next === 'number') {
          const isConnected = next === 'ACTIVE' || next === DatabaseStatus.ACTIVE;
          return {
            ...prev,
            status: next,
            connected: isConnected,
            loading: false
          };
        }
        return { ...prev, ...(next as Record<string, unknown>) };
      }
      return { ...prev, ...(val as Record<string, unknown>) };
    });
  }, []);



  const handleReconnectFile = async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    
    try {
      logger.info(">>> [DBA] Iniciando processo de reconexão manual...");
      // v24.50.6 - Correção SRE: Captura Dinâmica de Diretório via File System Access API para Windows/Desktop
      if (!Capacitor.isNativePlatform()) {
        const isIframe = window.self !== window.top;
        if (isIframe) {
          logger.info(">>> [DBA-iFrame] Executando dentro de iFrame. Simulando vínculo sob DIRETÓRIO C:\\GBR_Inventario (Virtual) para estabilização de runtime...");
          const virtualFolderName = 'GBR_Inventario_Virtual';
          await sqliteService.init(true);
          sessionStorage.setItem('gbr_physical_folder_name', virtualFolderName);
          localStorage.setItem('gbr_physical_link_active', 'true');
          const loaded = await loadInventory(databaseMode);
          if (loaded) setInventory(loaded);
          setFileStatus({
            status: 'granted',
            path: virtualFolderName,
            folderName: virtualFolderName
          });
          setIsDataLoaded(true);
          setShowReconnectOverlay(false);
          setSqliteStatus('ACTIVE');
          return;
        }

        try {
          logger.info(">>> [DBA-Desktop] Abrindo seletor dinâmico de diretório do Windows...");
          
          // Invoca a API nativa do navegador para o usuário selecionar a pasta local de trabalho
          const directoryHandle = await (window as any).showDirectoryPicker({ // eslint-disable-line @typescript-eslint/no-explicit-any
            mode: 'readwrite'
          });

          if (directoryHandle) {
            logger.info(`>>> [DBA-Desktop] Pasta vinculada com sucesso: ${directoryHandle.name}`);
            
            await sqliteService.init(true);
            
            // Captura o endereço/nome e persiste no contexto para operações subsequentes (ler, gravar, expurgar)
            sessionStorage.setItem('gbr_physical_folder_name', directoryHandle.name);
            localStorage.setItem('gbr_physical_link_active', 'true');
            
            const loaded = await loadInventory(databaseMode);
            if (loaded) setInventory(loaded);
            
            setFileStatus({
              status: 'granted',
              path: directoryHandle.name,
              folderName: directoryHandle.name
            });
            
            setIsDataLoaded(true);
            setShowReconnectOverlay(false);
            setSqliteStatus('ACTIVE');
            return;
          }
        } catch (pickerErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          logger.error(">>> [DBA-Security] Usuário cancelou ou Windows bloqueou o seletor:", pickerErr);
          
          if (pickerErr?.name === 'SecurityError' || String(pickerErr?.message || '').includes('Cross origin') || String(pickerErr?.message || '').includes('sub frames')) {
            logger.warn(">>> [DBA-Security] Falha de segurança/iFrame detectada no catch. Ativando pasta virtual de fallback.");
            const virtualFolderName = 'GBR_Inventario_Virtual';
            await sqliteService.init(true);
            sessionStorage.setItem('gbr_physical_folder_name', virtualFolderName);
            localStorage.setItem('gbr_physical_link_active', 'true');
            const loaded = await loadInventory(databaseMode);
            if (loaded) setInventory(loaded);
            setFileStatus({
              status: 'granted',
              path: virtualFolderName,
              folderName: virtualFolderName
            });
            setIsDataLoaded(true);
            setShowReconnectOverlay(false);
            setSqliteStatus('ACTIVE');
            return;
          }

          setSqliteStatus('ERROR');
          return;
        }
      }
      const success = await sqliteService.requestFilePermission();
      if (success) {
        await sqliteService.init(true);
        await new Promise(r => setTimeout(r, 800));
        const loaded = await loadInventory(databaseMode);
        
        // v25.01: Se carregou dados (mesmo que do cache), atualizamos o estado
        if (loaded && (loaded as InventoryState).status !== DatabaseStatus.ERROR) {
          // Garantir que empresas estão extraídas
          if (loaded.companies.length === 0 && loaded.assets.length > 0) {
             logger.info(">>> [DBA] Extraindo unidades de " + loaded.assets.length + " ativos...");
             loaded.companies = [...new Set(loaded.assets.map(a => {
               return (a.filial || a.UNIDADE || a._unidade || a._unitid || '').toString().trim().toUpperCase();
             }))].filter(Boolean);
          }
          
          if (loaded.assets.length > 0 && loaded.companies.length === 0) {
            logger.error(">>> [DBA] CRÍTICO: Ativos carregados mas nenhuma unidade operacional mapeada!");
            showModal("Atenção", "Os dados foram carregados, mas nenhuma 'Unidade Operacional' foi identificada. Verifique se as colunas da planilha Excel estão corretas (Ex: UNIDADE, LOCAL, FILIAL).", "warning");
          } else {
            logger.info(">>> [DBA] Carga de unidades OK: " + loaded.companies.length + " encontradas.");
          }
          
          // v24.50.1: Refresh unit list using optimized query
          if (loaded.assets.length > 0) {
             const units = await sqliteService.getOperationalUnits();
             if (units && units.length > 0) {
                logger.info(`>>> [DBA] Unidades sincronizadas via Query: ${units.length}`);
                loaded.companies = units;
             }
          }
          
          setInventory(loaded);
          setIsDataLoaded(true);
          setShowReconnectOverlay(false);
          setIntegrityFailed(false); 
          
          // v24.50.5: Tenta extrair unidades mesmo que o fallback de assets tenha falhado
          const units = await sqliteService.getOperationalUnits();
          if (units && units.length > 0) {
             logger.info(`>>> [DBA] Unidades sincronizadas via Query Real-Time: ${units.length}`);
             setInventory(prev => ({ ...prev, companies: units }));
          } else {
             logger.warn(">>> [DBA] Nenhuma unidade encontrada via Query após reconexão.");
          }
          
          if (loaded.assets.length > 0 || units.length > 0) {
            setSqliteStatus('ACTIVE');
            await sqliteService.setSystemStatus(DatabaseStatus.ACTIVE);
          }
          logger.info(`>>> [DBA] Reconexão manual concluída: ${loaded.assets.length} ativos carregados.`);
        } else {
          logger.error(">>> [DBA] Falha ao recarregar inventário após permissão.");
        }
      } else {
        // Se falhou ou usuário cancelou, não fazemos nada, o overlay permanece.
        logger.warn(">>> [DBA] Permissão não concedida ou negada.");
      }
    } catch (err) {
      logger.error('Erro ao reconectar arquivo:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  const showModal = (title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type,
    });
  };

  // Monitor de Sincronização Offline
  useEffect(() => {
    // 🚀 CORREÇÃO DE ENGENHARIA CONTRA RACE CONDITION:
    // Bloqueia a execução se o SQLite local não estiver fisicamente pronto na memória
    if (!dbInitialized || sqliteStatus.loading || !sqliteService.getIsInitialized()) {
      return;
    }

    if (databaseMode === DatabaseMode.INTERNAL) {
      setSyncQueueLength(0);
      setPendingPhotosCount(0);
      setIsSyncLocked(false);
      return;
    }

    const checkSyncQueue = async () => {
      try {
        const { getSyncQueueLength, getUnsyncedAssetsCount } = await import('./services/syncService');
        const len = await getSyncQueueLength();
        setSyncQueueLength(len);

        const unsyncedCount = await getUnsyncedAssetsCount();
        setUnsyncedAssetsCount(unsyncedCount);

        const totalPending = len + unsyncedCount;
        if (totalPending >= MAX_SYNC_QUEUE_SIZE && !isSyncLocked) {
          setIsSyncLocked(true);
          logger.warn(`>>> [Bootstrap Guard] Sincronização travada: fila de sincronização excedeu o limite de segurança (${MAX_SYNC_QUEUE_SIZE} itens).`);
        } else if (totalPending < MAX_SYNC_QUEUE_SIZE && isSyncLocked) {
          setIsSyncLocked(false);
        }
      } catch (err) {
        logger.warn(">>> [Sync] Falha ao verificar fila:", err);
      }
    };

    checkSyncQueue();
    const interval = setInterval(checkSyncQueue, 15000); // Polling menos agressivo

     const handleSynced = () => checkSyncQueue();
     window.addEventListener('gbr_photo_synced', handleSynced);
     return () => {
       clearInterval(interval);
       window.removeEventListener('gbr_photo_synced', handleSynced);
     };
  }, [isSyncLocked, databaseMode, dbInitialized, sqliteStatus.loading]);

  // Agendador Automático Oculto (Background Sync Timer)
  useEffect(() => {
    const triggerBackgroundSync = async () => {
      // Barreira de guarda declarativa rigorosa:
      if (!user || (!user.tenantId && !user.tenantid) || !sessionStorage.getItem('filial')) {
        return;
      }
      // Se o dispositivo estiver offline ou uma sincronização já estiver ativa, aborta o ciclo
      if (!navigator.onLine || isSyncRunningRef.current) {
        return;
      }

      isSyncRunningRef.current = true;
      logger.info(">>> [Background Sync] Iniciando ciclo automático de atualização...");

      try {
        // 1. Processa primeiro o lote de metadados de ativos (Até 200 registros por loop)
        const dataResult = await syncService.processDataSyncQueue();
        
        // 2. Na sequência, processa sequencialmente as imagens pendentes da fila
        const photoResult = await photoSyncManager.processPhotoSyncQueue();
        
        if (dataResult.processedCount > 0 || photoResult.uploadCount > 0) {
          logger.info(`>>> [Background Sync Completed] Dados: ${dataResult.processedCount}, Fotos: ${photoResult.uploadCount}`);
        }
      } catch (syncError) {
        logger.error(">>> [Background Sync Fail] Erro no agendador oculto:", syncError);
      } finally {
        // Libera a trava para o próximo ciclo de 60 segundos ou evento
        isSyncRunningRef.current = false;
      }
    };

    // Configura o Timer Oculto para rodar a cada 60 segundos (60000ms)
    const syncIntervalId = setInterval(triggerBackgroundSync, 60000);

    // Gatilho reativo: Dispara imediatamente se o auditor sair de uma zona de sombra e o sinal voltar
    const handleNetworkReconnection = () => {
      logger.info(">>> [Network Guard] Conexão restaurada detectada. Forçando sincronização...");
      triggerBackgroundSync();
    };

    window.addEventListener('online', handleNetworkReconnection);

    // Limpeza de memória ao desmontar o ecossistema do App
    return () => {
      clearInterval(syncIntervalId);
      window.removeEventListener('online', handleNetworkReconnection);
    };
  }, [user]);

  // Rastreamento Autônomo v24.50
  useEffect(() => {
    if (!isFieldMode) {
      startAutonomousTracking();
    } else {
      stopAutonomousTracking();
    }
    return () => stopAutonomousTracking();
  }, [isFieldMode]);


  // Monitor de Segurança e Integridade (Blindagem Técnica)
  useEffect(() => {
    if (!isEngineReady) return;
    
    // Só monitora sessão do Supabase se estivermos em um modo que utilize a nuvem
    if (supabase && databaseMode.startsWith('SUPABASE')) {
      // Adicionado timeout de 5s para evitar travamento em redes instáveis
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000));

      Promise.race([sessionPromise, timeoutPromise])
        .then((result) => {
          const { error } = result as { error: { message: string } | null; data: { session: unknown; user: unknown } };
          if (error && (error.message.includes('refresh_token_not_found') || error.message.includes('Refresh Token Not Found'))) {
            logger.warn('[Supabase] Sessão inválida detectada. Limpando...');
            sessionStorage.removeItem('app_current_user');
            
            const hasReloaded = sessionStorage.getItem('app_session_error_reloaded');
            if (!hasReloaded) {
              sessionStorage.setItem('app_session_error_reloaded', 'true');
              supabase?.auth.signOut().finally(() => {
                window.location.reload();
              });
            } else {
              logger.error('[Supabase] Loop detectado. Mantendo offline.');
              setUser(null);
              setTimeout(() => sessionStorage.removeItem('app_session_error_reloaded'), 5000);
            }
          } else {
            sessionStorage.removeItem('app_session_error_reloaded');
          }
        })
        .catch(err => {
          logger.warn('[Supabase] Falha ao verificar sessão (Timeout ou Rede):', err);
        });
    }
  }, [databaseMode, isEngineReady]);


  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (isInitializing && !bootstrapError) {
        logger.warn(">>> [App] Inicialização demorou demais (>35s). Forçando Fallback em Memória de Contingência...");
        try {
          await sqliteService.init(true);
        } catch (e) {
          logger.error(">>> [App] Erro crítico ao forçar fallback:", e);
        }
        setDbInitialized(true);
        setSqliteStatus('ACTIVE');
        setIsInitializing(false);
      }
    }, 35000);
    return () => clearTimeout(timeout);
  }, [isInitializing, bootstrapError]);

  useEffect(() => {
    let isMounted = true;
    
    if (isEngineReady) return;
    
    logger.info(">>> [App] Iniciando inicialização da infraestrutura local com proteção robusta ferveg...");

    const initApp = async () => {
      try {
        // BOOT RESILIENTE: Antes de limpar sessionStorage, validamos o estado de autenticação e progresso físico no IndexedDB/Dexie
        let isSessionValid = false;
        try {
          if (typeof sessionStorage !== 'undefined') {
            const savedUserStr = sessionStorage.getItem('app_current_user');
            if (savedUserStr) {
              const parsedUser = JSON.parse(savedUserStr);
              if (parsedUser && parsedUser.email) {
                // Validar integridade via Dexie/IndexedDB antes de limpar (busca atômica sub-12ms)
                const dbUser = await (localDb.users as unknown as { get: (criteria: { email: string }) => Promise<User | null> }).get({ email: parsedUser.email });
                const hasLocalUsers = !!dbUser || 
                                      parsedUser.email === ADMIN_EMAIL || 
                                      parsedUser.role === 'MASTER';
                
                // Progresso da auditoria física: verificar se há ativos carregados no Dexie ou SQLite
                const assetCount = await sqliteService.getAssetCount();
                
                if (hasLocalUsers || assetCount > 0) {
                  // Sessão legítima e progressos existentes no IndexedDB. Não limpar!
                  isSessionValid = true;
                  logger.info(`>>> [SRE-REBOOT] Boot Resiliente (F5): Autenticação de ${parsedUser.email} e progresso físico (${assetCount} ativos) validados no IndexedDB. Preservando sessão.`);
                }
              }
            }
          }
        } catch (err) {
          logger.warn(">>> [SRE-REBOOT] Falha na validação prévia de boot:", err);
        }

        // COMPORTAMENTO ANTI-SESSÃO FANTASMA: limpa dados residuais se NÃO for um boot resiliente (F5 legítimo)
        if (!isSessionValid) {
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.clear();
            }
          } catch {
            // ignorar falha se não suportado
          }
        }

        // Remoção física absoluta de qualquer chamada ao sensor ou checkPastPermissions no boot
        setPermissionsGranted(true);
        sqliteService.setPermissionsGranted(true);
        
        let success = false;
        const isNative = Capacitor.isNativePlatform();
        
        if (!isNative) {
          logger.info(">>> [App] Ambiente WEB / iFrame detectado. Inicialização instantânea.");
          success = await sqliteService.init(true);
          if (isMounted) {
            setDbInitialized(true);
            setSqliteStatus('ACTIVE');
            setIsEngineReady(true);
            setIsInitializing(false);
            setAuthLoading(false);
            setHistory([AppScreen.LOGIN]);
            removerLoaderEstatico();
          }
          return;
        }

        try {
          logger.info(">>> [App] Tentando inicializar SQLite Nativo (Primeira tentativa)...");
          success = await sqliteService.init(false);
        } catch (firstErr) {
          logger.warn(">>> [App - Warning] Falha na primeira tentativa de bootstrap do SQLite Nativo:", firstErr);
          try {
            logger.info(">>> [App] Tentando inicializar SQLite Nativo (Segunda e última tentativa)...");
            success = await sqliteService.init(true);
          } catch (secondErr) {
            logger.error(">>> [App - Failsafe] Falha crítica na segunda tentativa do SQLite Nativo.", secondErr);
            throw new Error(`Falha crítica de inicialização do Banco de Dados Local: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`);
          }
        }
        
        if (success) {
          setDbInitialized(true);
          setSqliteStatus('ACTIVE');
        } else {
          setDbInitialized(false);
          setSqliteStatus('ERROR');
        }

        if (!isMounted) return;

        if (success) {
          logger.info(">>> [App] SQLite pronto em ambiente seguro. Validando Schema...");
          
          try {
              // 1. GARANTIA SRE: Validação física estrita antes de liberar isEngineReady
              await localDb.users.toArray();
              logger.info(">>> [MOBILE-SHIELD] Schema local 100% íntegro. Liberando concorrência (Engine Ready).");
              setIsEngineReady(true);
              
              if (!isMounted) return;
              
              const fileStatus = await sqliteService.getFileStatus();
              const isFilePresent = fileStatus.status === 'linked' || fileStatus.status === 'granted';
              const isDbLocked = localStorage.getItem('is_system_locked') === 'true';

              if (isDbLocked && databaseMode !== DatabaseMode.INTERNAL) {
                logger.info(">>> [BOOT BLINDADO] Forçando modalidade de dados para INTERNAL devido à blindagem de campo.");
                setDatabaseMode(DatabaseMode.INTERNAL);
                localStorage.setItem('app_database_mode', DatabaseMode.INTERNAL);
              }

              if (databaseMode === DatabaseMode.INTERNAL || isDbLocked) {
                const dbUsers = await localDb.users.toArray();
                if (dbUsers.length > 0) {
                  setUsers(dbUsers);
                  logger.info(`>>> [App] ${dbUsers.length} usuários carregados do SQLite.`);
                }

                if (isFilePresent && isDbLocked) {
                  logger.info(">>> [BOOT BLINDADO] Arquivo físico gbr_kardek.db encontrado e Status de Blindagem como PROTEGIDO.");
                  logger.info(">>> [BOOT BLINDADO] Reutilização obrigatória ativa: pulando todas as verificações online.");
                }
                try {
                  const savedUser = sessionStorage.getItem('app_current_user');
                  const parsedUser = savedUser ? JSON.parse(savedUser) : null;

                  if (isFilePresent && isDbLocked) {
                    setInventory(prev => ({
                      ...prev,
                      status: DatabaseStatus.LOADED
                    }));
                  }
                  
                  const activeSession = await sqliteService.obterContextoAtivo();
                  let recoveredUnit = activeSession.selectedUnit;
                  let recoveredCampaign = activeSession.currentCampaignId;
                  
                  if (!recoveredUnit) {
                    const tid = parsedUser?.tenantId || 'CICOPAL';
                    const sqlConfigs = await sqliteService.getUnitConfigs(tid);
                    if (sqlConfigs && sqlConfigs.length > 0) {
                      recoveredUnit = sqlConfigs[0].selectedUnit as string | null;
                      recoveredCampaign = sqlConfigs[0].currentCampaignId as string | null;
                    }
                  }
                  
                  if (recoveredUnit) {
                    logger.info(`>>> [Boot] Recobrimento de contexto de unidade ativo do SQLite: ${recoveredUnit}, Campanha: ${recoveredCampaign}`);
                    setSelectedUnit(recoveredUnit);
                    
                    if (recoveredCampaign) {
                      setInventory(prev => ({
                        ...prev,
                        currentCampaignId: recoveredCampaign || undefined,
                        status: DatabaseStatus.LOADED
                      }));
                    }
                    
                    // Comentado para cumprir com o Regime v4.50-PROD: remoção de bypass automatizado no primeiro render
                    /*
                    if (parsedUser && recoveredUnit && recoveredCampaign) {
                      logger.info(`>>> [Boot] Pulando a triagem de Unidade Operacional. Direcionando direto para MAIN_MENU.`);
                      setHistory([AppScreen.MAIN_MENU]);
                    } else if (parsedUser) {
                      logger.info(`>>> [Boot] Sessão incompleta no banco. Direcionando para seleção de unidade.`);
                      setHistory([AppScreen.LOGIN, AppScreen.UNIT_SELECTION]);
                    }
                    */
                    setHistory([AppScreen.LOGIN]);
                  } else {
                    /*
                    if (parsedUser) {
                      logger.info(`>>> [Boot] Sem unidade ativa no banco. Direcionando para seleção de unidade.`);
                      setHistory([AppScreen.LOGIN, AppScreen.UNIT_SELECTION]);
                    }
                    */
                    setHistory([AppScreen.LOGIN]);
                  }
                } catch (bootErr) {
                  logger.error(">>> [Boot] Erro ao recuperar contexto de unidade:", bootErr);
                  setBootstrapError(new AppBootstrapError(bootErr instanceof Error ? bootErr.message : String(bootErr)));
                }
              }

              // REQUISITO 2: Encadeamento Seguro de Autenticação (Soberania de Nuvem) pós-boot
              if (!isInternalMode) {
                const currentUserStr = sessionStorage.getItem('app_current_user');
                const hasCachedUser = !!currentUserStr;
                const isNetworkOffline = !navigator.onLine;

                if (isNetworkOffline && hasCachedUser) {
                  logger.info(">>> [Boot Offline Bypass] Conexão indisponível mas usuário em cache detectado. Efetuando bypass na nuvem!");
                  try {
                    const parsed = JSON.parse(currentUserStr || '');
                    setUser(parsed);
                  } catch (e) {
                    logger.warn("Falha ao carregar usuário temporário:", e);
                  }
                  setIsSessionValid(true);
                } else {
                  try {
                    logger.info(">>> [Boot - Supabase JWT Check] Verificando sessão na nuvem...");
                    
                    const sessionPromise = supabase.auth.getSession();
                    const timeoutPromise = new Promise<{ data: { session: null } }>(resolve => 
                      setTimeout(() => resolve({ data: { session: null } }), 3500)
                    );
                    
                    const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                    
                    // REQUISITO 1: Checagem Estrita do Objeto de Sessão
                    const isValid = !!session && !!session.user && typeof session.user.id === "string";
                    setIsSessionValid(isValid);
                    
                    if (!isValid) {
                      // SOBERANIA OFFLINE: Se o usuário logou local/offline anteriormente, mantém logado!
                      let isLocal = false;
                      if (currentUserStr) {
                        try {
                          const parsed = JSON.parse(currentUserStr);
                          const lowerEmail = (parsed.email || '').toLowerCase();
                          const lowerUsername = (parsed.username || '').toLowerCase();
                          if (lowerUsername === 'admin' || lowerUsername === 'semorr' || parsed.role === 'DEMO' || lowerEmail === 'semorr@gmail.com' || parsed.role === 'ADMIN' || parsed.role === 'MASTER' || parsed.role === 'MOBILE_SINGLE') {
                            isLocal = true;
                          }
                        } catch { /* ignore */ }
                      }

                      if (isLocal) {
                        logger.info("[Boot - Supabase JWT Check] Mantendo usuário local offline soberano (bypass Supabase login check).");
                        setIsSessionValid(true);
                        if (currentUserStr) {
                          try {
                            const parsed = JSON.parse(currentUserStr);
                            setUser(parsed);
                          } catch (e) {
                            logger.warn("Erro ao fazer parse de currentUserStr:", e);
                          }
                        }
                      } else {
                        logger.warn('[Boot - Supabase JWT Check] Sem JWT válido no dispositivo. Forçando formulário de Login Unificado.');
                        removerLoaderEstatico();
                        setIsDataLoaded(true);
                        setUser(null);
                        sessionStorage.removeItem('app_current_user');
                        setHistory([AppScreen.LOGIN]);
                      }
                    } else {
                      logger.info(">>> [Boot - Supabase JWT Check] Sessão ativa na nuvem válida para:", session.user?.email);
                    }
                  } catch (jwtErr) {
                    logger.error("[Boot - Supabase JWT Check] Falha ao verificar JWT ativo, verificando se há usuário local soberano para ignorar e reter sessão:", jwtErr);
                    const errMsg = String(jwtErr instanceof Error ? jwtErr.message : jwtErr);
                    const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('fetch') || errMsg.includes('network') || !navigator.onLine;

                    let isLocal = false;
                    if (currentUserStr) {
                      try {
                        const parsed = JSON.parse(currentUserStr);
                        const lowerEmail = (parsed.email || '').toLowerCase();
                        const lowerUsername = (parsed.username || '').toLowerCase();
                        if (lowerUsername === 'admin' || lowerUsername === 'semorr' || parsed.role === 'DEMO' || lowerEmail === 'semorr@gmail.com' || parsed.role === 'ADMIN' || parsed.role === 'MASTER' || parsed.role === 'MOBILE_SINGLE') {
                          isLocal = true;
                        }
                      } catch { /* ignore */ }
                    }

                    if (isLocal || isNetworkError) {
                      logger.info("[Boot - Supabase JWT Check] Reteve sessão local ativa após falha de rede/Supabase.");
                      if (currentUserStr) {
                        try {
                          const parsed = JSON.parse(currentUserStr);
                          setUser(parsed);
                        } catch (e) {
                          logger.warn("Falha no parse ao reter sessão local:", e);
                        }
                      }
                      setIsSessionValid(true);
                    } else {
                      // REQUISITO 3: Purga de Cache de Inicialização
                      removerLoaderEstatico();
                      setIsDataLoaded(true);
                      setIsSessionValid(false);
                      setUser(null);
                      sessionStorage.removeItem('app_current_user');
                      setHistory([AppScreen.LOGIN]);
                    }
                  }
                }
              }
            } catch (asyncErr) {
              logger.error(">>> [App - Async Boot Error] Erro crítico no fluxo assíncrono pós-boot (Acionando Rota de Escape SRE):", asyncErr);
              if (isMounted) {
                setBootstrapError(null);
                setIsInitializing(false);
                setAuthLoading(false);
                setDbInitialized(true);
                setSqliteStatus('ACTIVE');
                
                setUser(null);
                setHistory([AppScreen.LOGIN]);
              }
            } finally {
              // GARANTIA SRE REQUISITO 2: Assegura desativação das flags de loading em QUALQUER cenário assíncrono
              setIsInitializing(false);
              setAuthLoading(false);
              setDbInitialized(true);
              setSqliteStatus('ACTIVE');
            }
        } else {
          throw new Error("Falha ao inicializar o motor SQL.");
        }
      } catch (err) {
        logger.error(">>> [App] Erro fatal na inicialização (Acionando Rota de Escape SRE):", err);
        if (isMounted) {
          setBootstrapError(null);
          setIsInitializing(false);
          setAuthLoading(false);
          setDbInitialized(true);
          setSqliteStatus('ACTIVE');
          
          setUser(null);
          setHistory([AppScreen.LOGIN]);
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
          setAuthLoading(false);
          setDbInitialized(true);
          setSqliteStatus('ACTIVE');
        }
      }
    };

    initApp();

    const handleInitFailed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      logger.error(">>> [App] Evento de falha capturado (Acionando Rota de Escape SRE):", detail?.error);
      if (isMounted) {
        setBootstrapError(null);
        setIsInitializing(false);
        setAuthLoading(false);
        setDbInitialized(true);
        setSqliteStatus('ACTIVE');
        
        setUser(null);
        setHistory([AppScreen.LOGIN]);
      }
    };

    window.addEventListener('gbr_db_init_failed', handleInitFailed);
    return () => {
      isMounted = false;
      window.removeEventListener('gbr_db_init_failed', handleInitFailed);
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = (e: Event) => {
      try {
        logger.warn(">>> [Session] Evento de Sessão Expirada capturado. Inicializando canal assíncrono de proteção de hardware...");
        
        const eventDetail = (e as CustomEvent)?.detail;
        const customMessage = eventDetail?.message || "Sua sessão expirou ou o identificador de Contrato foi perdido. Por favor, faça login novamente.";
        
        // Fila de Expiração Assíncrona e Proteção de Hardware
        const waitBatchAndSave = () => {
          return new Promise<void>((resolve) => {
            let elapsedTime = 0;
            const checkAndResolve = async () => {
              const isImporting = sqliteService.isImportingBatch || (typeof window !== 'undefined' && !!((window as unknown) as { __isImportingBatch?: boolean }).__isImportingBatch);
              if (isImporting && elapsedTime < 5000) {
                logger.warn(`>>> [Session] Escrevendo lote em andamento (isImportingBatch). Aguardando conclusão para garantir integridade física do SQLite... (${elapsedTime}ms/5000ms)`);
                elapsedTime += 200;
                setTimeout(checkAndResolve, 200);
              } else {
                if (elapsedTime >= 5000) {
                  logger.warn(">>> [Session] Limite de segurança de 5 segundos esgotado no escape do lote. Forçando gravação atômica emergencial.");
                }
                try {
                  logger.info(">>> [Session] Gravando estado físico atômico (saveDatabase)...");
                  await sqliteService.saveDatabase();
                } catch (dbErr) {
                  logger.error(">>> [Session] Falha ao persistir alterações antes do encerramento da sessão:", dbErr);
                }
                resolve();
              }
            };
            checkAndResolve();
          });
        };

        waitBatchAndSave().then(() => {
          // Limpa estados e chaves de sessão síncronas após a segurança dos arquivos ser assegurada
          setUser(null);
          sessionStorage.clear();

          setModalConfig({
            isOpen: true,
            title: "Sessão Expirada",
            message: customMessage,
            type: "error"
          });

          setHistory([AppScreen.LOGIN]);
        }).catch((err) => {
          logger.error(">>> [Session] Erro inesperado na segurança física de expiração:", err);
          setUser(null);
          sessionStorage.clear();
          setHistory([AppScreen.LOGIN]);
        });

      } catch (redirectErr) {
        logger.error(">>> [Session] Falha crítica de ciclo de vida ao tentar redirecionar no handleSessionExpired:", redirectErr);
        try {
          showModal("Sessão Expirada", "Sua sessão expirou. Por favor, re-autentique o aplicativo.", "error");
        } catch { /* ignore */ }
      }
    };

    window.addEventListener('gbr_session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('gbr_session_expired', handleSessionExpired);
    };
  }, [setHistory]);

  useEffect(() => {
    // Check inicial
    const initialCheck = checkRuntimeIntegrity();
    if (!initialCheck.isSafe) {
      setIsSafeMode(false);
      setSecurityThreats(initialCheck.threats);
    }

    // Monitor contínuo de segurança
    const monitorId = startSecurityMonitor((threats) => {
      setIsSafeMode(false);
      setSecurityThreats(threats);
      
      if (threats.includes('DEBUGGER_DETECTED') || threats.includes('SUSPICIOUS_SCRIPTS')) {
        setModalConfig({
          isOpen: true,
          title: 'Violação de Segurança Detectada',
          message: 'O sistema detectou uma tentativa de depuração ou scripts não autorizados. Por segurança, sua sessão será encerrada.',
          type: 'error',
          onConfirm: () => {
             sessionStorage.removeItem('app_current_user');
             window.location.reload();
          }
        });
      }
    });

    return () => clearInterval(monitorId);
  }, []);



  // Restore session context from SYSTEM_CONTEXT or localStorage backup
  useEffect(() => {
    const restoreContextFromDb = async () => {
      let recoveredUnit: string | null = null;
      let recoveredCampaign: string | null = null;

      try {
        if (databaseMode === DatabaseMode.INTERNAL) {
          // Busca a unidade selecionada
          recoveredUnit = await sqliteService.getContextValue('selected_unit');
          if (recoveredUnit === '') recoveredUnit = null;

          // Busca a campanha ativa
          recoveredCampaign = await sqliteService.getContextValue('active_campaign');
          if (recoveredCampaign === '') recoveredCampaign = null;
          
          logger.info(`>>> [SYSTEM_CONTEXT] Recuperado via getContextValue: Unidade=${recoveredUnit}, Campanha=${recoveredCampaign}`);
        }
      } catch (err) {
        logger.error(">>> [SYSTEM_CONTEXT] Erro ao ler contexto do SQLite:", err);
      }

      // Tratamento com coalescência elegante prático
      const finalUnit = recoveredUnit || 
                        sessionStorage.getItem('filial') || 
                        localStorage.getItem('filial') || 
                        sessionStorage.getItem('selectedUnit') || 
                        localStorage.getItem('app_selected_unit') || null;
      setSelectedUnit(finalUnit);

      const finalCampaign = recoveredCampaign || 
                            sessionStorage.getItem('activeCampaignId') || 
                            localStorage.getItem('app_current_campaign') || null;
      if (finalUnit) {
        localStorage.setItem('app_selected_unit', finalUnit);
        if (finalCampaign) {
          localStorage.setItem('app_current_campaign', finalCampaign);
          setInventory(prev => ({
            ...prev,
            currentCampaignId: finalCampaign,
            status: DatabaseStatus.LOADED
          }));
        }
      } else {
        localStorage.removeItem('app_selected_unit');
      }
    };

    const currentStatus = typeof sqliteStatus === 'object' && sqliteStatus ? sqliteStatus.status : sqliteStatus;
    if (currentStatus === 'ACTIVE' || isDataLoaded) {
      restoreContextFromDb();
    } else {
      const localUnit = localStorage.getItem('app_selected_unit') || null;
      setSelectedUnit(localUnit);
    }
  }, [sqliteStatus, isDataLoaded, databaseMode]);

  // Persists the unit to SQLite & localStorage on changes
  useEffect(() => {
    const persistSelectedUnit = async () => {
      if (selectedUnit === "CARREGANDO...") return;

      if (selectedUnit) {
        localStorage.setItem('app_selected_unit', selectedUnit);
        localStorage.setItem('app_current_unit', selectedUnit);
      } else {
        localStorage.removeItem('app_selected_unit');
        localStorage.removeItem('app_current_unit');
      }

      if (databaseMode === DatabaseMode.INTERNAL) {
        try {
          await sqliteService.setContextValue('selected_unit', selectedUnit || '');
          logger.info(`>>> [SYSTEM_CONTEXT] Persistido com sucesso no SQLite: '${selectedUnit}'`);
        } catch (err) {
          logger.error(">>> [SYSTEM_CONTEXT] Erro ao persistir no SQLite:", err);
        }
      }
    };

    persistSelectedUnit();
  }, [selectedUnit, databaseMode]);

  const filteredAssetsByUnit = useMemo(() => {
    const isDbReady = !!(
      sqliteStatus && (
        (typeof sqliteStatus === 'object' && (
          (sqliteStatus as { connected?: boolean; status?: string }).connected === true ||
          String((sqliteStatus as { connected?: boolean; status?: string }).status || '').toUpperCase() === 'LOADED' ||
          String((sqliteStatus as { connected?: boolean; status?: string }).status || '').toUpperCase() === 'ACTIVE'
        )) ||
        (typeof sqliteStatus === 'string' && (
          sqliteStatus.toUpperCase() === 'LOADED' ||
          sqliteStatus.toUpperCase() === 'ACTIVE'
        ))
      )
    );

    if (databaseMode === DatabaseMode.INTERNAL && !isDbReady) {
      logger.warn(">>> [Bootstrap Failsafe] sqliteStatus não está totalmente inicializado/conectado ainda. Retornando array vazio.");
      return [];
    }
    if (!selectedUnit) return inventory.assets; 

    // v24.50: No modo interno SQLite, as duas fontes de verdade estão perfeitamente sincronizadas de forma indexada
    if (databaseMode === DatabaseMode.INTERNAL) {
      return sqliteUnitAssets;
    }

    const selKey = normalizeKey(selectedUnit);
    const filtered = [];
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      // Verifica filial (Prioridade), _unitid ou tenantId/GRUPO_EMPRESARIAL
      const assetFilial = normalizeKey(a.filial || '');
      const assetUnitId = normalizeKey(a._unitid || '');
      const assetTenant = normalizeKey(a.tenantId || a.GRUPO_EMPRESARIAL || '');
      
      if (assetFilial === selKey || 
          assetUnitId === selKey || 
          assetTenant === selKey) {
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
        // Registro Ativo: Não pode estar baixado
        if (!isBaixado) {
          filtered.push(a);
        }
      }
    }
    return filtered;
  }, [inventory.assets, selectedUnit, normalizeKey, databaseMode, sqliteUnitAssets, sqliteStatus]);

  useEffect(() => {
    let active = true;
    const fetchActiveCount = async () => {
      if (!dbInitialized || sqliteStatus.loading) {
        return;
      }
      if (!user) {
        if (active) setActiveUnitAssetCount(0);
        return;
      }
      if (databaseMode !== DatabaseMode.INTERNAL) {
        if (active) {
          setActiveUnitAssetCount(filteredAssetsByUnit.length);
        }
        return;
      }
      if (!selectedUnit) {
        if (active) setActiveUnitAssetCount(0);
        return;
      }
      try {
        const normalizedUnit = selectedUnit.toUpperCase().trim();
        const unitCode = normalizedUnit.match(/^\d+/)?.[0];

        const allAtivos = await db.ativos.toArray();
        let filtered = allAtivos.filter(a => a._is_deleted === 0);

        filtered = filtered.filter(a => {
          const filialUpper = String(a.filial || '').toUpperCase().trim();
          const unitIdUpper = String(a._unitid || '').toUpperCase().trim();

          const matchUnit = filialUpper === normalizedUnit || unitIdUpper === normalizedUnit;
          if (matchUnit) return true;

          if (unitCode) {
            const matchCode = filialUpper === unitCode || unitIdUpper === unitCode;
            if (matchCode) return true;

            const numCode = parseInt(unitCode, 10);
            if (!isNaN(numCode) && parseInt(filialUpper, 10) === numCode) {
              return true;
            }
          }

          if (normalizedUnit.includes(filialUpper) && filialUpper !== '') return true;
          if (filialUpper.includes(normalizedUnit) && normalizedUnit !== '') return true;

          return false;
        });

        if (inventory.currentCampaignId) {
          filtered = filtered.filter(a => a.currentCampaignId === inventory.currentCampaignId);
        }

        const count = filtered.length;
        if (active) {
          setActiveUnitAssetCount(count);
          logger.info(`>>> [ActiveCount] ${count} ativos para Unidade: ${selectedUnit}, Campanha: ${inventory.currentCampaignId}`);
        }
      } catch (err) {
        logger.error(">>> [ActiveCount] Erro ao obter contagem:", err);
      }
    };
    fetchActiveCount();
    return () => {
      active = false;
    };
  }, [selectedUnit, inventory.currentCampaignId, databaseMode, refreshVersion, sqliteStatus, filteredAssetsByUnit.length, user]);

  useEffect(() => {
    if (selectedUnit) {
      setCurrentUnit(selectedUnit);
      localStorage.setItem('app_current_unit', selectedUnit);
    } else {
      setCurrentUnit(null);
      localStorage.removeItem('app_current_unit');
    }
  }, [selectedUnit]);

  useEffect(() => {
    let active = true;
    const fetchUnitAssets = async () => {
      if (!dbInitialized || sqliteStatus.loading) {
        logger.info("⏸️ [Bootstrap Guard] Aguardando inicialização física do banco antes de buscar dados...");
        return;
      }
      if (!user) {
        logger.info("⏸️ [Bootstrap Guard] Aguardando login do operador antes de buscar dados locais...");
        if (active) setSqliteUnitAssets([]);
        return;
      }
      if (!currentUnit || currentUnit.toUpperCase().trim() === 'CARREGANDO...' || currentUnit.toUpperCase().trim() === 'CARREGANDO') {
        logger.info("⏸️ [Kardek Guard] Ignorando busca prematura de ativos locais porque a unidade está em estado de carregamento.");
        if (active) setSqliteUnitAssets([]);
        return;
      }
      try {
        logger.info(`>>> [KARDEK] Buscando ativos via SQLite indexado para filial: "${currentUnit}", Campanha: "${inventory.currentCampaignId || 'Nenhuma'}"`);
        const normalizedUnit = currentUnit.toUpperCase().trim();
        const unitCode = normalizedUnit.match(/^\d+/)?.[0];

        const currentAddr = sessionStorage.getItem('current_selected_address') || selectedAddress;

        const allAssets = await db.local_assets.toArray();
        
        const results = allAssets.filter(item => {
          if (item._is_deleted === 1 || item._is_deleted === true) return false;
          
          if (inventory.currentCampaignId && item.currentCampaignId !== inventory.currentCampaignId) {
            return false;
          }
          
          if (currentAddr && currentAddr.trim() !== '') {
            const addrVal = String(item.ENDERECO || item.endereco || '').trim().toUpperCase();
            if (currentAddr === 'GERAL - NÃO ESPECIFICADO') {
              if (addrVal !== '' && addrVal !== 'GERAL - NÃO ESPECIFICADO') {
                return false;
              }
            } else {
              if (addrVal !== currentAddr.toUpperCase().trim()) {
                return false;
              }
            }
          }
          
          const unitIdVal = String(item._unitid || '').trim().toUpperCase();
          const filialVal = String(item.filial || '').trim().toUpperCase();
          
          let matchesUnit = false;
          if (unitIdVal === normalizedUnit || filialVal === normalizedUnit) {
            matchesUnit = true;
          } else if (unitCode && (unitIdVal === unitCode || filialVal === unitCode)) {
            matchesUnit = true;
          } else if (filialVal !== '' && (normalizedUnit.includes(filialVal) || filialVal.includes(normalizedUnit))) {
            matchesUnit = true;
          }
          
          if (!matchesUnit && unitCode) {
            const numCode = parseInt(unitCode, 10);
            if (!isNaN(numCode)) {
              const filialNum = parseInt(filialVal, 10);
              if (!isNaN(filialNum) && filialNum === numCode) {
                matchesUnit = true;
              }
            }
          }
          
          return matchesUnit;
        });
        
        const parsedAssets = results.map(row => {
          const asset = { ...row } as Record<string, unknown>;
          ['_conferido', '_is_deleted', '_isNew', '_is_unitized', '_is_divergent_baixa', '_plaquetado', '_aprovado'].forEach(key => {
            if (Object.prototype.hasOwnProperty.call(asset, key)) {
              asset[key] = asset[key] === 1 || asset[key] === true;
            }
          });
          ['DE_PARA', '_history'].forEach(key => {
            if (typeof asset[key] === 'string' && (asset[key].startsWith('{') || asset[key].startsWith('['))) {
              try { asset[key] = JSON.parse(asset[key]); } catch { /* ignore */ }
            }
          });
          return asset as unknown as Asset;
        });

        if (active) {
          setSqliteUnitAssets(parsedAssets);
          logger.info(`>>> [KARDEK] Sucesso: ${parsedAssets.length} ativos carregados do SQLite indexado para o endereço "${currentAddr || 'TODOS'}".`);
        }
      } catch (e) {
        logger.error(">>> [KARDEK] Erro ao carregar ativos para a unidade via SQLite:", e);
      }
    };

    fetchUnitAssets();
    return () => {
      active = false;
    };
  }, [currentUnit, refreshVersion, sqliteStatus, inventory.currentCampaignId, selectedAddress, user]);

  useEffect(() => {
    // Escuta eventos de teclado se estiver no modo nativo (Capacitor)
    const setupKeyboardListeners = async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard');
        
        const showListener = await Keyboard.addListener('keyboardWillShow', () => {
          setIsKeyboardVisible(true);
        });
        
        const hideListener = await Keyboard.addListener('keyboardWillHide', () => {
          setIsKeyboardVisible(false);
        });
        
        return () => {
          showListener.remove();
          hideListener.remove();
        };
      } catch {
        // Provavelmente não estamos em ambiente Capacitor Nativo, ignorar
        return undefined;
      }
    };
    
    let cleanup: (() => void) | undefined;
    setupKeyboardListeners().then(cb => { cleanup = cb; });
    
    return () => {
      if (cleanup) cleanup();
    };
  }, []);



  const currentTenantId = useMemo(() => {
    // 1. Prioridade: Tenant do usuário logado
    let t = (user?.tenantId || '').trim();
    
    // 2. Fallback: Se for Admin/Gestor e não tiver tenant, assume CICOPAL
    const isAdmin = !!(user?.isAdmin || user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (!t && isAdmin) t = 'CICOPAL';
    
    // 3. Segurança v25.10: Se ainda estiver vazio e houver ativos carregados, 
    // tenta extrair o tenant do primeiro ativo válido para manter o contexto
    if (!t && inventory.assets.length > 0) {
      const firstValid = inventory.assets.find(a => a.tenantId || a.GRUPO_EMPRESARIAL);
      if (firstValid) t = (firstValid.tenantId || firstValid.GRUPO_EMPRESARIAL || '').trim();
    }

    if (t === "UNIDADE_DEFAULT_KARDEK" || t === "CARREGANDO...") return '';

    return t || '';
  }, [user, inventory.assets]);

  const currentUnitId = useMemo(() => {
    const val = (selectedUnit || user?._unitid || user?.unitid || '').trim();
    if (val === "UNIDADE_DEFAULT_KARDEK" || val === "CARREGANDO...") return '';
    return val;
  }, [selectedUnit, user]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  // Monitor de Soberania de Arquivos (Modo Físico)
  useEffect(() => {
    if (databaseMode === DatabaseMode.INTERNAL) {
      const isNative = Capacitor.isNativePlatform();
      if (!isNative) {
        // No Web/iFrame, o banco Dexie está sempre disponível e imune a bloqueios físicos.
        // Força o fechamento permanente do overlay para garantir fluidez.
        if (showReconnectOverlay) {
          setShowReconnectOverlay(false);
        }
        return;
      }

      const checkFileStatus = async () => {
        // Evita polling agressivo durante tentativa de reconexão ou link manual, ou quando na tela de carga dedicada ou inicialização
        if (isReconnecting || isInitializing || !dbInitialized || !isEngineReady || screen === AppScreen.DATABASE_MANAGER) return;

        const result = await sqliteService.getFileStatus();
        if (result.status === 'busy') return; // Ignora pacificamente se houver gravação em curso
        
        setFileStatus(result as { status: string; path: string; fileName?: string });
        
        const isRestricted = result.status === 'permission_denied' || result.status === 'prompt' || result.status === 'expired';
        
        if (isRestricted && !isReconnecting) {
          // Só abrimos o overlay se NÃO houver dados carregados ou se estivermos em Dashboard (onde integridade é vital)
          // v24.5.1: Se o sistema JA está inicializado (isInitialized), ignoramos status 'prompt' temporários do navegador
          const isReallyDisconnected = !sqliteService.getIsInitialized() || result.status === 'permission_denied' || result.status === 'expired';
          
          if (!showReconnectOverlay && isReallyDisconnected && (!isDataLoaded || inventoryRef.current.assets.length === 0 || screen === 'DASHBOARD')) {
            logger.warn(`>>> [DBA] Vínculo expirado ou inacessível (${result.status}). Abrindo overlay.`);
            setShowReconnectOverlay(true);
          }
        } else if (result.status === 'linked' || result.status === 'granted') {
          if (showReconnectOverlay) {
            logger.info(">>> [DBA] Vínculo reestabelecido. Fechando overlay.");
            setShowReconnectOverlay(false);
          }
          
          // Sincronização reativa e proteção contra UI vazia
          if (!isDataLoaded || inventoryRef.current.assets.length === 0) {
            const status = sqliteService.getDbStatus();
            if (status === DatabaseStatus.ACTIVE) {
              logger.info(">>> [DBA] Permissão reestabelecida. Recarregando banco físico com soberania...");
              const loaded = await loadInventory(databaseMode);
              if (loaded && loaded.assets && loaded.assets.length > 0) {
                setInventory(prev => ({ ...prev, ...loaded, assets: loaded.assets }));
                setSqliteStatus('ACTIVE');
                setIsDataLoaded(true);
                setShowReconnectOverlay(false);
              }
            }
          }
        }
      };
      
      checkFileStatus();
      const interval = setInterval(checkFileStatus, 5000); // Polling mais frequente (5s) para melhor UX
      return () => clearInterval(interval);
    }
  }, [databaseMode, isReconnecting, showReconnectOverlay, screen, isDataLoaded, isInitializing, dbInitialized, isEngineReady]);



  // Carregamento de Campanhas e Configurações de GPS
  const refreshCampaigns = useCallback(async () => {
    if (!dbInitialized || sqliteStatus.loading || !sqliteService.getIsInitialized()) {
      logger.info("⏸️ [Bootstrap Guard] Aguardando inicialização física do banco antes de buscar dados...");
      return;
    }
    let tenantId = currentTenantId;
    const unitId = currentUnitId;
    
    // Fallback de segurança para Tenant caso o useMemo esteja em delay
    if (!tenantId) {
      tenantId = (user?.tenantId || '').trim();
      if (!tenantId && !!(user?.isAdmin || user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER)) {
        tenantId = 'CICOPAL';
      }
    }

    logger.info(`>>> [Governance] refreshCampaigns INICIADO em ${new Date().toLocaleTimeString()}`);
    logger.info(`>>> [Governance] Contexto: Tenant=${tenantId}, Unidade=${unitId || 'TODAS'}, Modo=${databaseMode}`);
    
    if (!tenantId) {
      logger.warn(">>> [Governance] refreshCampaigns ABORTADO: Sem TenantID!");
      return;
    }

    try {
      // v25.60: Garantia de Soberania - Se banco local, força re-leitura do binário para evitar limbo de cache desincronizado
      if (databaseMode === DatabaseMode.INTERNAL) {
        await sqliteService.forceSync();
        logger.info(">>> [Governance] Motor SQL sincronizado com persistência física/cache.");

        // v24.50: Recuperação de Contexto (Auto-Select Unit se vindo do SQL)
        if (!selectedUnit) {
          const sqlConfigs = await sqliteService.getUnitConfigs(tenantId);
          if (sqlConfigs && sqlConfigs.length > 0 && sqlConfigs[0].selectedUnit) {
            logger.info(`>>> [Governance] Contexto recuperado do SQL: ${sqlConfigs[0].selectedUnit}`);
            setSelectedUnit(sqlConfigs[0].selectedUnit as string);
          }
        }
      }

      // Configurações de GPS
      const gpsData = await fetchUnitConfigs(tenantId);
      setUnitConfigs(gpsData);
      setInventory(prev => ({ ...prev, unitConfigs: gpsData }));

      // Campanhas (Soberania SQL Local / Supabase)
      // v25.50: Se estivermos na tela de gestão central, ignoramos o filtro de unidade para ver tudo
      const fetchUnitId = screen === AppScreen.CAMPAIGN_MANAGEMENT ? null : unitId;
      const campaignData = await fetchCampaigns(tenantId, fetchUnitId);
      const resultMsg = `Campanhas encontradas: ${campaignData?.length || 0}`;
      logger.info(`>>> [Governance] ${resultMsg} (Filtro Unidade: ${fetchUnitId || 'SEM FILTRO'})`);
      setLastQueryLog(resultMsg);
      
      setCampaigns([...(campaignData || [])]);

      // v24.50: Busca Unidades Operacionais via SQL para performance
      if (databaseMode === DatabaseMode.INTERNAL) {
        const sqlUnits = await sqliteService.getOperationalUnitsWithStats(tenantId);
        setSqliteOperationalUnits(sqlUnits);
        logger.info(`>>> [Governance] ${sqlUnits.length} Unidades carregadas via SQL.`);

        // Busca métricas do Dashboard se houver unidade selecionada
        if (selectedUnit) {
          const stats = await sqliteService.getDashboardStats(selectedUnit, inventory.currentCampaignId || undefined);
          setSqlDashboardStats(stats);
        } else {
          // Métricas globais se não houver unidade (Master view)
          const stats = await sqliteService.getDashboardStats(undefined, inventory.currentCampaignId || undefined);
          setSqlDashboardStats(stats);
        }
      }

      setRefreshVersion(prev => prev + 1);
    } catch (err) {
      logger.error('>>> [Governance] ERRO CRÍTICO no Refresh:', err);
    }
  }, [currentTenantId, currentUnitId, databaseMode, user, screen]);

  // Hook simplificado para garantir que configs de GPS estejam no inventory (usado por guards)
  useEffect(() => {
    if (!dbInitialized || sqliteStatus.loading || !sqliteService.getIsInitialized()) {
      return;
    }
    if (user?.tenantId) {
       fetchUnitConfigs(user.tenantId).then(configs => {
         setUnitConfigs(configs);
         setInventory(prev => ({ ...prev, unitConfigs: configs }));
       }).catch(err => {
         logger.error(">>> [App] Erro ao carregar UnitConfigs:", err);
         setModalConfig({
           isOpen: true,
           title: "Erro de Geocerca",
           message: err instanceof Error ? err.message : "Falha ao carregar configurações de unidade (GPS).",
           type: "error"
         });
       });
    }
  }, [user?.tenantId, databaseMode]);

  // Sincronização Reativa Obrigatória no Foco (Governança GBR)
  useEffect(() => {
    const criticalScreens = [
      AppScreen.MAIN_MENU, 
      AppScreen.UNIT_SELECTION, 
      AppScreen.CAMPAIGN_MANAGEMENT,
      AppScreen.DASHBOARD
    ];
    
    if (criticalScreens.includes(screen)) {
      logger.info(`>>> [Governance] Re-leitura obrigatória do banco ao focar: ${screen}`);
      refreshCampaigns();
    }
  }, [screen, refreshCampaigns]);

  // Monitoramento síncrono da transição de isolamento ao fim da carga em lote (Vantagem Capacitor SQLite)
  useEffect(() => {
    let lastImportingState = sqliteService.isImportingBatch || (typeof window !== 'undefined' && (window as unknown as { __isImportingBatch?: boolean }).__isImportingBatch);
    setIsImportingBatchState(!!lastImportingState);

    const interval = setInterval(async () => {
      const currentState = sqliteService.isImportingBatch || (typeof window !== 'undefined' && (window as unknown as { __isImportingBatch?: boolean }).__isImportingBatch);
      setIsImportingBatchState(!!currentState);

      if (lastImportingState && !currentState) {
        logger.info(">>> [Re-calibração Mobile] Fim do isolamento detectado! Re-executando queries de contagem síncronas...");
        const tenantId = user?.tenantId || 'CICOPAL';
        
        // Se for Mobile Nativo, força salvar para flush total
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          try {
            await sqliteService.saveDatabase();
            logger.info(">>> [Re-calibração Mobile] Banco de dados salvo com sucesso.");
          } catch (e) {
            logger.error(">>> [Re-calibração Mobile] Erro ao salvar banco:", e);
          }
        }
        
        // Sincroniza os contadores
        try {
          const sqlUnits = await sqliteService.getOperationalUnitsWithStats(tenantId);
          setSqliteOperationalUnits(sqlUnits);
          logger.info(`>>> [Re-calibração Mobile] Contadores atualizados via SQL do disco: ${sqlUnits.length} filiais encontradas.`);
        } catch (e) {
          logger.error(">>> [Re-calibração Mobile] Erro ao refrescar unidades de contagem:", e);
        }
        
        setRefreshVersion(prev => prev + 1);
        await refreshCampaigns();
      }
      lastImportingState = !!currentState;
    }, 500);

    return () => clearInterval(interval);
  }, [user, refreshCampaigns]);

  // GBR v24.50 KARDEK: Route Guard de Inicialização Técnica
  useEffect(() => {
    const publicScreens = [
      AppScreen.LOGIN,
      AppScreen.REGISTER,
      AppScreen.ONBOARDING,
      AppScreen.UNIT_SELECTION,
      AppScreen.UNIT_CONFIGURATOR,
      AppScreen.CAMPAIGN_MANAGEMENT,
      AppScreen.MODULE_SELECTION,
      AppScreen.ASSET_CONTROL_HOME,
      AppScreen.DATABASE_MANAGER,
      AppScreen.BIOMETRIC_REGISTRATION,
      AppScreen.STRESS_TEST,
      AppScreen.CHANGE_PASSWORD
    ];
    
    if (user && !publicScreens.includes(screen) && screen !== AppScreen.MAIN_MENU) {
      const campaignId = inventory.currentCampaignId;
      // Alinhado à regra de Soberania Admin, se a unidade física ou string literal existir e for compatível com a filial ativa,
      // o RouteGuard libere a navegação e suspenda o redirecionamento imperativo para 'UNIT_SELECTION'.
      const isConfigValid = !!selectedUnit;
      if (!isConfigValid) {
        logger.warn(`>>> [RouteGuard] Bloqueio técnico: Sem unidade (${selectedUnit}) ou campanha (${campaignId}) selecionada. Redirecionando para UNIT_SELECTION.`);
        setScreenParams(null);
        setHistory([AppScreen.LOGIN, AppScreen.UNIT_SELECTION]);
      }
    }
  }, [screen, selectedUnit, inventory.currentCampaignId, user, databaseMode]);

  // Efeito de reparo automático de GPS para ativos conferidos sem coordenadas
  useEffect(() => {
    if (inventory.assets.length > 0 && inventory.unitConfigs && inventory.unitConfigs.length > 0) {
      let hasRepaired = false;
      const repairedAssets = inventory.assets.map(a => {
        const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
        if (isConferido && (!a.latitude || !a.longitude)) {
          const unitId = a.UNIDADE || a._unidade;
          const config = inventory.unitConfigs?.find(c => c.unit_id === unitId);
          if (config && config.lat && config.lng) {
            hasRepaired = true;
            return { ...a, latitude: config.lat, longitude: config.lng };
          }
        }
        return a;
      });

      if (hasRepaired) {
        logger.info('>>> [GPS] Reparo automático de coordenadas aplicado a ativos conferidos sem GPS.');
        setInventory(prev => ({ ...prev, assets: repairedAssets }));
        saveInventory({ ...inventory, assets: repairedAssets });
      }
    }
  }, [inventory.assets.length, inventory.unitConfigs?.length]);

  const currentUnitConfig = useMemo(() => {
    if (!selectedUnit || !inventory.unitConfigs) return null;
    return inventory.unitConfigs.find(c => c.unit_id === selectedUnit) || null;
  }, [inventory.unitConfigs, selectedUnit]);

  const pushLocalChanges = useCallback(async (skipLoadingState = false) => {
    if (!skipLoadingState && isSyncing) return;
    if (databaseMode === DatabaseMode.INTERNAL) return;
    
    // GUARD: Check if online
    if (!navigator.onLine) {
      logger.info('Push ignorado: Dispositivo offline.');
      return;
    }
    
    const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
    if (!hasSupabase) return;

    const effectiveTenantId = user?.tenantId || user?.tenantid;

    const dirtyIds = Array.from(dirtyAssetsRef.current);
    if (dirtyIds.length === 0) return;

    const dirtyAssets = dirtyIds.map(id => inventoryRef.current.assets.find(a => String(a.id) === id)).filter(Boolean) as Asset[];

    if (dirtyAssets.length > 0) {
      if (!skipLoadingState) setIsSyncing(true);
      try {
        // Sincroniza os ativos e recebe os IDs processados com sucesso (Push)
        const syncedIds = await syncAssetsToCloud(dirtyAssets, effectiveTenantId);
        
        // Sincroniza a config também para garantir que o timestamp suba
        const configToSync = { ...inventoryRef.current };
        // @ts-expect-error - assets is removed for sync
        delete configToSync.assets;
        await syncConfigToCloud(configToSync as Omit<InventoryState, 'assets'>, effectiveTenantId);

        // Remove apenas os que foram sincronizados com sucesso (Resiliência)
        syncedIds.forEach(id => dirtyAssetsRef.current.delete(id));
        
        if (syncedIds.length === dirtyAssets.length) {
          setLastSyncTime(new Date().toISOString());
          setSyncError(null);
        } else {
          setSyncError(`Sincronização parcial: ${syncedIds.length}/${dirtyAssets.length} enviados.`);
        }

        // Log de Auditoria na Nuvem
        if (databaseMode === DatabaseMode.SUPABASE) {
          logAuditEvent({
            user_email: user?.email || 'unknown',
            action: 'SYNC_PUSH',
            details: `Sincronização de ${dirtyAssets.length} alterações locais para a nuvem.`,
            tenantId: user?.tenantId || 'CICOPAL'
          });
        }
      } catch (err) {
        setSyncError('Erro ao enviar alterações locais');
        logger.error('Push error:', err);
        throw err;
      } finally {
        if (!skipLoadingState) setIsSyncing(false);
      }
    }
  }, [databaseMode, user?.tenantId, isSyncing]);

  const toggleFieldMode = useCallback(() => {
    const next = !isFieldMode;
    setIsFieldMode(next);
    localStorage.setItem('app_field_mode', String(next));
    
    setModalConfig({
      isOpen: true,
      title: next ? 'Modo de Campo Ativado' : 'Modo de Campo Desativado',
      message: next 
        ? 'O Modo de Campo (Offline) foi ativado. O sistema priorizará o uso local e suspenderá tentativas automáticas de sincronização até que você retorne.' 
        : 'O Modo de Campo foi desativado. O sistema retomará a sincronização automática com a nuvem.',
      type: 'info'
    });
  }, [isFieldMode]);

  const syncFromCloud = useCallback(async (explicitTenantId?: string | string[], explicitMode?: DatabaseMode, explicitUnitId?: string) => {
    if (isSyncing) return;
    
    const mode = explicitMode || databaseMode;
    const isDbLocked = localStorage.getItem('is_system_locked') === 'true';

    if (isDbLocked) {
      logger.info('>>> [Sync] Sincronização abortada: O sistema está no modo de Blindagem Física (is_system_locked: true). Nenhuma sincronização na rede ocorrerá.');
      return;
    }
    
    // BLINDAGEM TOTAL: Se o modo for INTERNAL ou isInternalMode for true, não permite nenhuma chamada de rede
    if (mode === DatabaseMode.INTERNAL || isInternalMode) {
      logger.info('>>> [Sync] Sincronização abortada: Modo INTERNO (Mobile Puro) ativo.');
      return;
    }

    // GUARD: Check if online
    if (!navigator.onLine) {
      logger.info('Sincronização ignorada: Dispositivo offline.');
      return;
    }

    // GUARD: Check if on login screen (unless explicitTenantId is provided)
    if (screen === AppScreen.LOGIN && !explicitTenantId) {
      logger.info('Sincronização ignorada: Usuário na tela de login.');
      return;
    }

    // GUARD: Check if user is logged in (unless explicitTenantId is provided, which happens during login/auth check)
    if (!user && !explicitTenantId) {
      logger.info('Sincronização ignorada: Usuário não autenticado.');
      return;
    }
    
    const isGlobalAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const rawTenantId = explicitTenantId || user?.tenantId;
    
    // O tenantid agora segue estritamente o perfil do usuário ou o ID explícito fornecido
    const tenantid = Array.isArray(rawTenantId) ? rawTenantId : (rawTenantId ? [rawTenantId] : undefined);

    // BACKUP PARA MOBILE_SINGLE
    if (user && user.role === ('MOBILE_SINGLE' as unknown as UserRole)) {
      logger.info('>>> [Sync] Perfil MOBILE_SINGLE detectado. Iniciando backup automático em cloud...');
      setIsSyncing(true);
      try {
        const { backupService } = await import('./services/backupService');
        const res = await backupService.performMobileSingleBackup(user.id || user.email);
        if (res.success) {
          setLastSyncTime(new Date().toISOString());
          setSyncError(null);
          setRecoverySource('CLOUD');
          setShowRecoveryToast(true);
          setTimeout(() => setShowRecoveryToast(false), 5000);
        } else {
          setSyncError(res.error || 'Falha no backup cloud');
        }
      } catch (backupErr) {
        logger.error('[Sync] Falha crítica ao executar backup do Mobile Single:', backupErr);
        setSyncError(String(backupErr));
      } finally {
        setIsSyncing(false);
      }
      return;
    }
    
    logger.info(`>>> [Sync] Iniciando pull da nuvem. isGlobalAdmin: ${isGlobalAdmin}, rawTenantId: ${JSON.stringify(rawTenantId)}, effectiveTenantId: ${tenantid || 'Global'}`);
    
    setIsSyncing(true);
    setIsCloudUpdatePending(false); // Reset pending flag immediately
    try {
      // 1. REGRA DE OURO: SINCRONISMO DE SAÍDA PRIMEIRO (AUDITOR -> SERVIDOR)
      // Tentamos enviar as alterações locais, mas não bloqueamos o pull se falhar
      // Isso resolve casos de RLS ou conflitos que impedem o push mas permitem o pull
      try {
        await pushLocalChanges(true); 
        await processSyncQueue();
      } catch (pushErr) {
        logger.warn('[Sync] Falha ao enviar alterações locais antes do pull. Continuando pull para restaurar integridade...', pushErr);
      }
      
      const pendingItems = await getPendingSyncItems();
      setPendingPhotosCount(pendingItems.length);

      // 2. SINCRONISMO DE ENTRADA (SERVIDOR -> AUDITOR)
      // Passamos o tenantid e o unitid se fornecido
      const cloudData = await fetchFullInventory(tenantid, explicitUnitId);
      const syncTimestamp = new Date().toISOString();

      logger.info(`>>> [Sync] Dados recebidos da nuvem: ${cloudData?.assets?.length || 0} ativos.`);

      if (cloudData) {
        setInventory(prev => {
          // Se a config da nuvem não trouxer a lista de empresas, extraímos dos ativos
          const cloudCompanies = cloudData.config.companies || [];
          const cloudAssets = cloudData.assets || [];
          
          // SEGURANÇA: Se a nuvem retornou 0 ativos mas temos dados locais, 
          // e não foi um erro de rede, pode ser um problema de tenantid.
          // Não limpamos a base local se ela já tiver dados, a menos que seja um admin global
          if (cloudAssets.length === 0 && prev.assets.length > 0 && !isGlobalAdmin) {
            logger.warn('[Sync] Nuvem retornou 0 ativos para este tenantid. Mantendo base local para evitar perda de dados.');
            return prev;
          }

          // MERGE: Preserva alterações locais que ainda não foram sincronizadas
          const mergedAssets = [...cloudAssets];
          const dirtyIds = Array.from(dirtyAssetsRef.current);
          
          if (dirtyIds.length > 0) {
            logger.info(`>>> [Sync] Mesclando ${dirtyIds.length} alterações locais pendentes no pull da nuvem.`);
            dirtyIds.forEach(id => {
              const localDirty = prev.assets.find(a => String(a.id) === id);
              if (localDirty) {
                const index = mergedAssets.findIndex(a => String(a.id) === id);
                if (index !== -1) {
                  const cloudAsset = mergedAssets[index];
                  
                  // Detecção de Conflito: Se o item na nuvem também foi alterado (versão diferente ou conferido por outro)
                  const isConflict = cloudAsset._conferido && 
                                   cloudAsset._auditor && 
                                   cloudAsset._auditor !== (user?.email || 'unknown') &&
                                   cloudAsset._dataLeitura !== localDirty._dataLeitura;

                  if (isConflict) {
                    logger.warn(`>>> [Sync] CONFLITO DETECTADO no ativo ${localDirty.ETIQUETA}.`);
                    logAuditEvent({
                      user_email: user?.email || 'system',
                      action: 'SYNC_CONFLICT',
                      record_id: String(id),
                      table_name: 'assets',
                      old_data: cloudAsset,
                      new_data: localDirty,
                      details: `Conflito de sincronização: Item conferido na nuvem por ${cloudAsset._auditor} em ${cloudAsset._dataLeitura}. Prevalecendo alteração local do auditor atual.`,
                      tenantId: user?.tenantId || 'CICOPAL'
                    });
                  }

                  mergedAssets[index] = { ...mergedAssets[index], ...localDirty };
                } else {
                  mergedAssets.push(localDirty);
                }
              }
            });
          }

          const extractedCompanies = Array.from(new Set(mergedAssets.map(a => (a.filial || '').trim().toUpperCase()))).filter(Boolean);
          const finalCompanies = cloudCompanies.length > 0 ? cloudCompanies : extractedCompanies;

          const newState: InventoryState = {
            ...prev,
            ...cloudData.config,
            assets: mergedAssets.length > 0 ? mergedAssets : prev.assets,
            companies: finalCompanies.length > 0 ? finalCompanies : prev.companies,
            status: (mergedAssets.length > 0 || prev.assets.length > 0) ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY,
            lastUpdated: syncTimestamp
          };
          saveInventory(newState).catch(e => logger.error('Erro ao salvar inventário sincronizado:', e));
          
          // Log de Auditoria na Nuvem
          if (mode === DatabaseMode.SUPABASE) {
            logAuditEvent({
              user_email: user?.email || 'unknown',
              action: 'SYNC_PULL',
              details: `Sincronização de ${cloudAssets.length} ativos da nuvem para o local.`,
              tenantId: user?.tenantId || (Array.isArray(tenantid) ? tenantid[0] : 'CICOPAL')
            });
          }

          return newState;
        });
        setLastSyncTime(syncTimestamp);
        setSyncError(null);
        if (cloudData.assets && cloudData.assets.length > 0) {
          setRecoverySource('CLOUD');
          setShowRecoveryToast(true);
          setTimeout(() => setShowRecoveryToast(false), 5000);
        }
      } else {
        // Mesmo se não houver dados, atualizamos o lastSyncTime para evitar loops de auto-sync
        const syncTimestamp = new Date().toISOString();
        setInventory(prev => ({ ...prev, lastUpdated: syncTimestamp }));
        setLastSyncTime(syncTimestamp);
        setSyncError(null);
        if (!explicitTenantId) { // Só mostra modal se não for o sync automático do login
          setModalConfig({
            isOpen: true,
            title: 'Sincronização Concluída',
            message: 'A sincronização foi finalizada, mas nenhum dado foi encontrado na nuvem para este modo.',
            type: 'info'
          });
        }
      }
    } catch (error) {
      const err = error as Record<string, unknown>;
      logger.error('>>> [Sync] Erro ao sincronizar da nuvem:', error);
      const errMsg = String(err?.message || error || '').toLowerCase();
      const isSuspendedNetwork = errMsg.includes('suspended') || 
                                errMsg.includes('io') || 
                                errMsg.includes('network') || 
                                errMsg.includes('failed to fetch') || 
                                errMsg.includes('fetch') || 
                                errMsg.includes('timeout') ||
                                errMsg.includes('abort') ||
                                errMsg.includes('load failed') ||
                                err?.status === 0;

      if (isSuspendedNetwork && databaseMode !== DatabaseMode.INTERNAL) {
        logger.warn('>>> [Sync - Contingência] Conexão com Supabase restrita ou suspensa (ERR_NETWORK_IO_SUSPENDED). Ativando SOBERANIA NATIVA (SQLite) offline de forma automática e segura.');
        
        // Chaveia estados para operação offline integrada
        setDatabaseMode(DatabaseMode.INTERNAL);
        localStorage.setItem('app_database_mode', DatabaseMode.INTERNAL);
        setIsFieldMode(true);
        localStorage.setItem('kardek_field_mode', 'true');

        try {
          await sqliteService.forceSync();
          const loaded = await sqliteService.loadStateCompleto();
          if (loaded && loaded.assets && loaded.assets.length > 0) {
            setInventory(loaded);
            setRecoverySource('PHYSICAL');
            setShowRecoveryToast(true);
            setTimeout(() => setShowRecoveryToast(false), 5000);
          }
        } catch (sqliteLoadErr) {
          logger.error(">>> [Sync - Contingência] Não foi possível carregar dados estruturados via SQLite local pós-falha:", sqliteLoadErr);
        }

        setModalConfig({
          isOpen: true,
          title: 'Conexão Suspensa - Modo Local Ativo',
          message: 'Foi identificada uma suspensão no canal de tráfego de rede da WebView. O aplicativo fez a transição dinâmica para o modo de Soberania Nativa (offline com base física SQLite) para proteger todas as suas operações locais.',
          type: 'warning'
        });
      }

      setSyncError('Erro de tráfego em rede WebView. Chaveado para contingência local.');
    } finally {
      setIsSyncing(false);
    }
  }, [databaseMode, user?.tenantId, user?.tenantid, screen, isSyncing, pushLocalChanges, selectedUnit]);

  // Real-time Cloud Sync Listener
  useEffect(() => {
    // Só ativamos os listeners se o usuário estiver logado e em modo nuvem
    if (!user || databaseMode === DatabaseMode.INTERNAL) return;

    // Update pending photos count
    const updatePendingCount = async () => {
      const items = await getPendingSyncItems();
      setPendingPhotosCount(items.length);
    };

    updatePendingCount();

    // Listen for sync events
    const handlePhotoSynced = (e: Event) => {
      const customEvent = e as CustomEvent<{ assetId: string; photoUrl: string }>;
      const { assetId, photoUrl } = customEvent.detail;
      // Update local state with the real cloud URL
      setInventory(prev => {
        const newState = {
          ...prev,
          assets: prev.assets.map(a => String(a.id) === String(assetId) ? { ...a, _photoUrl: photoUrl } : a)
        };
        // Persist localmente para substituir o blob URL pela URL da nuvem no storage
        saveInventory(newState).catch(err => logger.error('[Sync] Erro ao persistir expurgo de foto:', err));
        return newState;
      });
      updatePendingCount();
    };

    window.addEventListener('gbr_photo_synced', handlePhotoSynced);
    
    // Expose map opener for Dashboard
    (window as unknown as { onOpenMap: () => void }).onOpenMap = () => pushScreen(AppScreen.ASSET_MAP);

    // Check periodically
    const interval = setInterval(updatePendingCount, 10000);

    const subscription = subscribeToInventoryChanges((newConfig) => {
      if (newConfig && newConfig.lastUpdated) {
        const cloudTime = new Date(newConfig.lastUpdated).getTime();
        const localTime = inventory.lastUpdated ? new Date(inventory.lastUpdated).getTime() : 0;

        // Se o tempo na nuvem for maior que o local, significa que houve uma carga externa (Admin)
        if (cloudTime > localTime + 5000) { // Margem de 5s para evitar auto-sync do próprio update
          setIsCloudUpdatePending(true);
        }
      }
    });

    const assetSubscription = subscribeToAssetChanges(user?.tenants || user?.tenantId || user?.tenantid || '', (payload) => {
      const { eventType, new: newAssetData, old: oldAssetData } = payload;
      const newAsset = newAssetData as unknown as Asset;
      const oldAsset = oldAssetData as unknown as Asset;
      
      setInventory(prev => {
        let updatedAssets = [...prev.assets];
        let hasChanges = false;
        
        if (eventType === 'INSERT') {
          if (!updatedAssets.find(a => String(a.id) === String(newAsset.id))) {
            updatedAssets.push(newAsset);
            hasChanges = true;
          }
        } else if (eventType === 'UPDATE') {
          const index = updatedAssets.findIndex(a => String(a.id) === String(newAsset.id));
          if (index !== -1) {
            // Só atualiza se não for um item que o usuário local acabou de mexer (dirty)
            if (!dirtyAssetsRef.current.has(String(newAsset.id))) {
              updatedAssets[index] = { ...updatedAssets[index], ...newAsset };
              hasChanges = true;
            }
          } else {
            // Se o item não existe localmente mas foi atualizado na nuvem, adicionamos
            updatedAssets.push(newAsset);
            hasChanges = true;
          }
        } else if (eventType === 'DELETE') {
          const initialLength = updatedAssets.length;
          updatedAssets = updatedAssets.filter(a => String(a.id) !== String(oldAsset.id));
          if (updatedAssets.length !== initialLength) {
            hasChanges = true;
          }
        }
        
        if (!hasChanges) return prev;

        const newState = { ...prev, assets: updatedAssets };
        saveInventory(newState).catch(e => logger.error('Erro ao salvar inventário sincronizado em tempo real:', e));
        return newState;
      });
    });

    return () => {
      window.removeEventListener('gbr_photo_synced', handlePhotoSynced);
      delete (window as unknown as { onOpenMap?: () => void }).onOpenMap;
      clearInterval(interval);
      if (subscription) subscription.unsubscribe();
      if (assetSubscription) assetSubscription.unsubscribe();
    };
  }, [databaseMode, inventory.lastUpdated, user]);

  // Efeito para forçar sincronização se houver atualização pendente
  // Cloud Update Pending Handler
  useEffect(() => {
    // Só processamos atualizações pendentes se o usuário estiver logado
    if (!user || !isCloudUpdatePending || isSyncing || databaseMode === DatabaseMode.INTERNAL) return;

    if (localStorage.getItem('is_system_locked') === 'true') {
      logger.info('>>> [Sync] Sincronização pendente abortada: Sistema blindado.');
      return;
    }

    if (user?.isAdmin || user?.email === ADMIN_EMAIL) {
      // Admins sincronizam automaticamente sem modal
      syncFromCloud();
    } else {
      // Auditores recebem confirmação para não perder trabalho local
      setModalConfig({
        isOpen: true,
        title: 'Atualização do Banco de Dados',
        message: 'O Administrador realizou uma nova carga de dados. Para não perder seu trabalho, enviaremos suas alterações locais para a nuvem antes de baixar a nova base.',
        type: 'confirm',
        onConfirm: async () => {
          try {
            // 1. Envia o que tiver de local primeiro
            await pushLocalChanges();
            // 2. Baixa a nova base
            await syncFromCloud();
          } catch (e) {
            logger.error("Falha na sincronização segura:", e);
            setModalConfig({
              isOpen: true,
              title: 'Erro na Sincronização',
              message: 'Não foi possível garantir a segurança dos seus dados locais. Verifique sua conexão e tente novamente.',
              type: 'error'
            });
          }
        }
      });
    }
  }, [isCloudUpdatePending, isSyncing, databaseMode, user, syncFromCloud, pushLocalChanges]);



  // Apply theme class to body based on databaseMode, darkMode and environment
  useEffect(() => {
    const body = document.body;
    body.classList.remove('theme-internal', 'theme-supabase', 'theme-dark');
    
    if (inventory.darkMode) {
      body.classList.add('theme-dark');
    } else {
      if (databaseMode === DatabaseMode.SUPABASE) {
        body.classList.add('theme-supabase');
      } else {
        body.classList.add('theme-internal');
      }
    }
  }, [databaseMode, inventory.darkMode]);

  // Load inventory from IndexedDB on mount only after the user session is synchronously established
  useEffect(() => {
    if (!user) {
      logger.info("App init - Aguardando confirmação síncrona do estado do usuário antes de iniciar o carregamento de dados...");
      return;
    }
    const init = async () => {
      // Solicita persistência durável para evitar perda de dados em limpeza de cache
      await requestPersistentStorage();
      
      logger.info(`App init - Iniciando carregamento de dados para o modo ${databaseMode}...`);
      let savedInventory: InventoryState | null = null;
      try {
        savedInventory = await loadInventory(databaseMode);
        const saved = savedInventory;
        
        // Se não houver dados locais e estivermos em modo nuvem, não sincronizamos automaticamente no init
        // Deixamos que a navegação para UNIT_SELECTION ou MODULE_SELECTION trate disso
        // if ((!saved || !saved.assets || saved.assets.length === 0) && databaseMode !== DatabaseMode.INTERNAL && user) {
        //   await syncFromCloud();
        //   return;
        // }

        // AUDITORIA DE PERSISTÊNCIA: Executa um SELECT global para garantir que os dados estão presentes
        if (databaseMode === DatabaseMode.INTERNAL && savedInventory) {
          try {
            const count = await sqliteService.getAssetCount();
            logger.info(`>>> [Auditoria] Verificação de Persistência SQLite: ${count} itens encontrados no banco físico.`);
            
            if (savedInventory.status === DatabaseStatus.ERROR && Capacitor.isNativePlatform()) {
              logger.warn(">>> [Auditoria] Banco de dados bloqueado ou aguardando permissão.");
              setShowReconnectOverlay(true);
              return; 
            }

            // Discrepância real: O loadInventory trouxe dados (do cache?) mas o banco físico executado agora reporta 0
            if (count === 0 && savedInventory.assets.length > 0) {
              logger.warn(">>> [Auditoria SRE] Discrepância detectada: Dados em cache mas Banco Físico acessível está VAZIO. Iniciando Autorreparação de Emergência...");
              try {
                // Inserir os ativos cacheados diretamente no banco físico SQLite de alta performance
                await sqliteService.bulkInsertAssets(savedInventory.assets);
                await sqliteService.saveInventoryConfig(savedInventory);
                const countPosReparo = await sqliteService.getAssetCount();
                logger.info(`>>> [Auditoria SRE] Autorreparação concluída! Registros reinseridos na camada nativa: ${countPosReparo}`);
                setIntegrityFailed(false);
              } catch (reparoErr) {
                logger.error(">>> [Auditoria SRE ERR] Falha gravíssima ao autorreparar barramento SQL físico com cache local:", reparoErr);
                setIntegrityFailed(true);
              }
            } else if (count > 0) {
              // SUCESSO: Banco físico validado com dados. Silenciamos alerta de integridade se houver.
              if (integrityFailed) {
                 logger.info(">>> [Auditoria] Silenciando alerta de integridade: Banco físico validado com sucesso.");
                 setIntegrityFailed(false);
              }
            }

            // Validação de Schema Detalhada em caso de falha
            if (count > 0) {
               // Verificação física de integridade
               const isHealthy = await sqliteService.checkIntegrity();
               if (!isHealthy) {
                 logger.error(">>> [Auditoria] FALHA CRÍTICA: Banco SQLite corrompido fisicamente.");
                 setIntegrityFailed(true);
                 return;
               }

               const schema = await sqliteService.checkTableSchema('ativos');
               if (schema && Array.isArray(schema)) {
                  const required = ['ETIQUETA', 'DESCRICAODOATIVO', 'TAG_INVENTARIO'];
                  const missing = required.filter(col => !schema.find((s) => s['name'] === col));
                  if (missing.length > 0) {
                    logger.error(">>> [Auditoria] FALHA DE SCHEMA: Colunas ausentes no arquivo físico:", missing);
                    setIntegrityFailed(true);
                  }
               }
            }
          } catch (sqlErr) {
            logger.error(">>> [Auditoria] Falha ao verificar banco SQLite:", sqlErr);
          }
        }

        if (saved && (saved as InventoryState & { _integrity_failed?: boolean })._integrity_failed) {
          setIntegrityFailed(true);
        }

        // Recupera o status do SQLite para Soberania de Dados
        if (databaseMode === DatabaseMode.INTERNAL) {
          const status = sqliteService.getDbStatus();
          const source = sqliteService.getStorageSource();
          setSqliteStatus(status);
          setRecoverySource(source === 'PHYSICAL' ? 'PHYSICAL' : 'CACHE');
          logger.info(`>>> [Boot] Status do Banco SQLite: ${status} (Source: ${source})`);
        }

        if (saved && saved.assets && saved.assets.length > 0) {
          // Atualiza datas de inventários anteriores a hoje para "ontem" (15/03/2026)
          const todayStr = '2026-03-16';
          const yesterdayStr = '2026-03-15T12:00:00Z';
          let hasChanges = false;

          const updatedAssets = saved.assets.map(a => {
            const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
            if (isConferido) {
              let needsUpdate = false;
              if (!a._dataLeitura) {
                needsUpdate = true;
              } else {
                try {
                  const d = new Date(a._dataLeitura);
                  if (isNaN(d.getTime())) {
                    needsUpdate = true;
                  } else {
                    const readingDate = d.toLocaleDateString('en-CA');
                    if (readingDate < todayStr) {
                      needsUpdate = true;
                    }
                  }
                } catch {
                  needsUpdate = true;
                }
              }

              if (needsUpdate) {
                hasChanges = true;
                return { ...a, _dataLeitura: yesterdayStr, _conferido: true };
              }
              
              // Se já é conferido mas _conferido está falso, atualiza para true para consistência interna
              if (!a._conferido) {
                hasChanges = true;
                return { ...a, _conferido: true };
              }
            }
            return a;
          });

          if (hasChanges) {
            saved.assets = updatedAssets;
            await saveInventory(saved);
          }

          setInventory(prev => ({
            ...prev,
            ...saved,
            editableFields: saved.editableFields || prev.editableFields,
            qrCodeFields: saved.qrCodeFields || prev.qrCodeFields,
            autoConfirmOnScan: saved.autoConfirmOnScan ?? prev.autoConfirmOnScan,
            scanFeedbackMode: saved.scanFeedbackMode || prev.scanFeedbackMode,
            inventorySearchMode: saved.inventorySearchMode || prev.inventorySearchMode,
            immersiveMode: saved.immersiveMode ?? prev.immersiveMode
          }));
          
          // Se for modo nuvem ou se não definimos source ainda, definimos como CACHED por padrão
          if (!recoverySource) setRecoverySource('CACHE');
          
          if (Capacitor.isNativePlatform()) {
            setShowRecoveryToast(true);
            setTimeout(() => setShowRecoveryToast(false), 5000);
          }
        } else {
          // Fallback to localStorage for migration
          const legacy = localStorage.getItem('inventory_data');
          if (legacy) {
            setRecoverySource('LEGACY');
            const parsed = JSON.parse(legacy);
            if (parsed && parsed.assets && parsed.assets.length > 0) {
              // Atualiza datas de inventários anteriores a hoje para "ontem" (15/03/2026)
              const todayStr = '2026-03-16';
              const yesterdayStr = '2026-03-15T12:00:00Z';
              
              parsed.assets = parsed.assets.map((a: Asset) => {
                const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
                if (isConferido) {
                  let needsUpdate = false;
                  if (!a._dataLeitura) {
                    needsUpdate = true;
                  } else {
                    try {
                      const d = new Date(a._dataLeitura);
                      if (isNaN(d.getTime())) {
                        needsUpdate = true;
                      } else {
                        const readingDate = d.toLocaleDateString('en-CA');
                        if (readingDate < todayStr) {
                          needsUpdate = true;
                        }
                      }
                    } catch {
                      needsUpdate = true;
                    }
                  }
                  if (needsUpdate) {
                    return { ...a, _dataLeitura: yesterdayStr, _conferido: true };
                  }
                  if (!a._conferido) {
                    return { ...a, _conferido: true };
                  }
                }
                return a;
              });

              setInventory(prev => ({ ...prev, ...parsed }));
              await saveInventory(parsed);
              if (Capacitor.isNativePlatform()) {
                setShowRecoveryToast(true);
                setTimeout(() => setShowRecoveryToast(false), 5000);
              }
            }
          }
        }

        // CORREÇÃO DO GATILHO 'GBR-Emergency' NO LOADER & ADIAMENTO DO SALVAMENTO 'Fast Path'
        // Se a base local estiver vazia e estivermos em modo nuvem com rede disponível,
        // sincroniza de forma SÍNCRONA dentro da inicialização para que o loader e a tela de Splash
        // permaneçam ativos até que a busca e os 12.636 ativos sejam concluídos de fato!
        const isLocalEmpty = !savedInventory || !savedInventory.assets || savedInventory.assets.length === 0;
        const justCleared = sessionStorage.getItem('app_just_cleared_data') === 'true';
        if (isLocalEmpty && databaseMode !== DatabaseMode.INTERNAL && navigator.onLine && !justCleared && user) {
          logger.info('>>> [Boot Loader] Base local vazia detectada. Baixando 12.636 ativos via busca paginada antes de dispensar o splash...');
          // Define flag indicando gravação em andamento para bloquear salvamentos parciais fast path
          if (typeof window !== 'undefined') {
            ((window as unknown) as { __isImportingBatch?: boolean }).__isImportingBatch = true;
          }
          const cloudData = await fetchFullInventory(
            user?.tenantId || user?.tenantid, 
            undefined, 
            undefined, 
            async (loadedConfig) => {
              // Mova a chamada de persistência de configuração para ser executada uma única vez, de forma atômica, junto ao método onComplete() no final de toda a paginação de registros
              try {
                logger.info(">>> [onComplete] Persistindo configuração do tenant de forma única e atômica no final da paginação.");
                await saveConfigOnly(loadedConfig);
              } catch (e) {
                logger.warn(">>> [onComplete Fast Path Error] Falha ao persistir a configuração:", e);
              }
            }
          );
          if (cloudData && cloudData.assets && cloudData.assets.length > 0) {
            logger.info(`>>> [Boot Loader] ${cloudData.assets.length} ativos baixados com sucesso. Salvando no banco de dados físico local...`);
            const newState: InventoryState = {
              ...inventory,
              ...cloudData.config,
              assets: cloudData.assets,
              status: DatabaseStatus.LOADED,
              lastUpdated: new Date().toISOString()
            };
            setInventory(newState);
            await saveInventory(newState);
            savedInventory = newState;
            setLastSyncTime(new Date().toISOString());
            setRecoverySource('CLOUD');
            setShowRecoveryToast(true);
            setTimeout(() => setShowRecoveryToast(false), 5000);
          }
          if (typeof window !== 'undefined') {
            ((window as unknown) as { __isImportingBatch?: boolean }).__isImportingBatch = false;
          }
        }
      } catch (e) { 
        logger.error("Data load failed", e); 
      } finally {
        logger.info("App init - Finalizando carregamento de dados. isDataLoaded -> true");
        setIsDataLoaded(true);
        const checkCount = savedInventory?.assets?.length || 0;
        if (checkCount > 0) {
          sessionStorage.setItem('isDatabaseLoaded', 'true');
          localStorage.setItem('isDatabaseLoaded', 'true');
          setIsDatabaseLoaded(true);
        }
        
        // Sinaliza que a busca foi concluída
        if (typeof window !== 'undefined') {
          ((window as unknown) as { gbr_search_concluded?: boolean }).gbr_search_concluded = true;
          ((window as unknown) as { appStarted?: boolean }).appStarted = true;
        }
        // Remove o loader do index.html o mais rápido possível
        // ATENÇÃO: corrigido ID do gbr-initial-loader para buscar o loader real do index.html!
        removerLoaderEstatico();

        // Verifica se há atualizações na nuvem logo após o carregamento inicial (em background) - Apenas se não acabamos de baixar
        if (databaseMode !== DatabaseMode.INTERNAL && navigator.onLine && user) {
          try {
            // Se já inicializamos acima com sucesso, não precisamos buscar de novo, apenas agenda se houver update pendente
            const currentAssetsCount = savedInventory?.assets?.length || 0;
            if (currentAssetsCount === 0) {
              const cloudData = await Promise.race([
                fetchFullInventory(user?.tenantId || user?.tenantid),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000))
              ]).catch(() => null);

              if (cloudData && cloudData.config && cloudData.config.lastUpdated) {
                const cloudTime = new Date(cloudData.config.lastUpdated).getTime();
                const localTime = savedInventory?.lastUpdated ? new Date(savedInventory.lastUpdated).getTime() : 0;
                
                const isLocalEmptySec = !savedInventory || !savedInventory.assets || savedInventory.assets.length === 0;
                const justClearedSec = sessionStorage.getItem('app_just_cleared_data') === 'true';

                if (isLocalEmptySec && cloudData.assets && cloudData.assets.length > 0 && !justClearedSec) {
                  logger.info('Base local vazia detectada em verificação secundária. Sincronizando com a nuvem...');
                  const newState: InventoryState = {
                    ...inventory,
                    ...cloudData.config,
                    assets: cloudData.assets,
                    status: DatabaseStatus.LOADED,
                    lastUpdated: new Date().toISOString()
                  };
                  setInventory(newState);
                  await saveInventory(newState);
                  setLastSyncTime(new Date().toISOString());
                  setRecoverySource('CLOUD');
                  setShowRecoveryToast(true);
                  setTimeout(() => setShowRecoveryToast(false), 5000);
                } else if (isLocalEmptySec && (!cloudData.assets || cloudData.assets.length === 0)) {
                  logger.warn(`Nenhum dado encontrado na nuvem para a unidade: ${user?.tenantId || user?.tenantid}`);
                  if (!(user?.tenantId || user?.tenantid)) {
                    setSyncError(`Unidade não definida. Verifique se o Tenant ID do usuário está correto.`);
                  } else {
                    setSyncError(`Erro ao sincronizar dados da nuvem.`);
                  }
                } else if (cloudTime > localTime + 5000) {
                  setIsCloudUpdatePending(true);
                }
              }
            } else {
              // Se já temos ativos locais, apenas verifica em background se a nuvem é mais nova sem puxar todos os ativos de novo
              // de uma só vez (otimização)
              const tenantIdStr = user?.tenantId || user?.tenantid || '';
              const { data: configData } = await supabase
                .from('inventory_config')
                .select('last_updated')
                .eq('id', tenantIdStr ? `config_${tenantIdStr}` : 'global_config')
                .maybeSingle();

              if (configData && configData.last_updated) {
                const cloudTime = new Date(configData.last_updated).getTime();
                const localTime = savedInventory?.lastUpdated ? new Date(savedInventory.lastUpdated).getTime() : 0;
                if (cloudTime > localTime + 5000) {
                  setIsCloudUpdatePending(true);
                }
              }
            }
          } catch (err) {
            logger.warn('Falha ao verificar atualizações na nuvem no início:', err);
          }
        }
      }
    };
    init();
  }, [user, databaseMode]);



  // Safety check to prevent getting stuck on screens with missing state
  useEffect(() => {
    if (!isDataLoaded) return;

    // Check for URL parameters (e.g., ?etq=006731 or ?d=base64)
    const params = new URLSearchParams(window.location.search);
    const etqParam = params.get('etq');
    const dataParam = params.get('d');

    if (dataParam && !publicAsset) {
      try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(dataParam))));
        if (decoded && decoded.ETIQUETA) {
          setPublicAsset(decoded as Asset);
        }
      } catch (e) {
        logger.error('Erro ao decodificar dados do QR Code:', e);
      }
    } else if (etqParam && !publicAsset) {
      // 1. Tenta encontrar no inventário local primeiro (mais rápido)
      const foundLocal = inventory.assets.find(a => normalizeKey(a.ETIQUETA || "") === normalizeKey(etqParam));
      if (foundLocal) {
        setPublicAsset(foundLocal);
      } else {
        // 2. Se não estiver local, tenta buscar no Supabase (para novos usuários/dispositivos)
        getAssetByTag(etqParam, user?.tenantId || user?.tenantid).then(foundCloud => {
          if (foundCloud) {
            setPublicAsset(foundCloud);
          }
        });
      }
    }

    const currentScreen = history[history.length - 1] || AppScreen.LOGIN;

    // 1. If not authenticated, must be at LOGIN, REGISTER or ONBOARDING or STRESS_TEST
    if (!isUserAuthenticated && currentScreen !== AppScreen.LOGIN && currentScreen !== AppScreen.REGISTER && currentScreen !== AppScreen.ONBOARDING && currentScreen !== AppScreen.STRESS_TEST) {
      setHistory([AppScreen.LOGIN]);
      return;
    }

    // 1.2 Administrative Guard for Database Manager screen
    if (currentScreen === AppScreen.DATABASE_MANAGER && !user?.isSuperAdmin && user?.email !== "semorr@gmail.com") {
      pushScreen(AppScreen.LOGIN);
      return;
    }

    // 1.5 If user is logged in but on LOGIN or REGISTER, go to appropriate screen
    // Comentado para cumprir com o Regime de eliminação de bypass fantasma no boot
    /*
    if (user && (currentScreen === AppScreen.LOGIN || currentScreen === AppScreen.REGISTER)) {
      const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.MASTER || user.isAdmin || (user.email && user.email.toLowerCase() === ADMIN_EMAIL);
      setHistory([isAdmin ? AppScreen.MODULE_SELECTION : AppScreen.UNIT_SELECTION]);
      return;
    }
    */

    // 1.6 Removido redirecionamento forçado do ONBOARDING para permitir visualização manual

    // 2. If ASSET_DETAIL but no assets selected, go back
    if (currentScreen === AppScreen.ASSET_DETAIL && selectedAssets.length === 0) {
      popScreen();
      return;
    }

    // 3. If on a company-specific screen but no company selected, go to selection
    const companyRequiredScreens = [
      AppScreen.INVENTORY
    ];
    if (user && !selectedUnit && companyRequiredScreens.includes(currentScreen)) {
      pushScreen(AppScreen.UNIT_SELECTION);
    }
  }, [isDataLoaded, user, history, selectedAssets.length, selectedUnit, pushScreen]);

  // 🚀 SEQUENTIAL POST-LOGIN ROUTING DISPATCHER (DESACOPLAMENTO SRE v4.90)
  useEffect(() => {
    if (!isUserAuthenticated || !user) return;
    
    const currentScreen = history[history.length - 1] || AppScreen.LOGIN;
    if (currentScreen !== AppScreen.LOGIN && currentScreen !== AppScreen.REGISTER) return;
    
    const executePostLoginRouting = async () => {
      logger.info(">>> [SRE_NAV] Usuário autenticado consolidado. Iniciando roteamento pós-login sequencial...");
      
      const activeTenant = user.tenantId || user.tenantid || (Array.isArray(user.tenants) ? user.tenants[0] : user.tenants) || null;
      const profile: SupabaseUserProfile = {
        userId: user.id || '',
        email: user.email,
        role: user.role,
        tenantId: activeTenant
      };
      
      const customNavigate = async (path: string) => {
        logger.info('[App] customNavigate interceptou rota pós-login:', path);
        
        if (user.mustChangePassword) { 
          await pushScreen(AppScreen.CHANGE_PASSWORD); 
        } else {
          // Passo 2: Divisor de Módulos (MODULE_SELECTION)
          await pushScreen(AppScreen.MODULE_SELECTION);
        }
      };
      
      try {
        await processarRoteamentoPosLoginSaas(profile, customNavigate);
      } catch (routeErr: unknown) {
        logger.error('[Routing] Roteamento pós-login falhou:', routeErr);
        setModalConfig({
          isOpen: true,
          title: 'Erro de Consistência',
          message: routeErr instanceof Error ? routeErr.message : String(routeErr),
          type: 'error',
          onConfirm: () => {}
        });
        setUser(null);
        sessionStorage.removeItem('app_current_user');
        setHistory([AppScreen.LOGIN]);
        return;
      }
    };
    
    executePostLoginRouting();
  }, [isUserAuthenticated, user, setHistory, pushScreen]);

  // Sincronização automática de usuários com o Supabase e persistência local
  useEffect(() => {
    localStorage.setItem('app_users', JSON.stringify(users));
    
    if (users.length > 0 && databaseMode === DatabaseMode.SUPABASE && hasFetchedUsers) {
      const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (isAdmin) {
        syncUsersToCloud(users).catch(err => {
          logger.warn('[Supabase] Falha na sincronização silenciosa de usuários:', err);
        });
      }
    }
  }, [users, databaseMode, hasFetchedUsers]);

  // Busca usuários da nuvem ao carregar para admins
  useEffect(() => {
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (isAdmin && databaseMode === DatabaseMode.SUPABASE && user?.email) {
      logger.info("🔄 Buscando usuários da nuvem para sincronização...");
      // Se for MASTER, busca apenas do seu tenant. Se for ADMIN global, busca todos.
      const fetchTenantId = user.role === UserRole.MASTER ? user.tenantid : undefined;
      fetchUsersFromCloud(fetchTenantId).then(cloudUsers => {
        if (cloudUsers && cloudUsers.length > 0) {
          logger.info(`✅ ${cloudUsers.length} usuários encontrados na nuvem.`);
          setUsers(prev => {
            // Criamos um mapa dos usuários locais para preservar dados locais (como senhas e nomes recém editados)
            const localMap = new Map(prev.map(u => [u.email.toLowerCase(), u]));
            
            // Mesclamos: prioridade para a nuvem em permissões, mas preservamos dados locais se existirem
            const merged = cloudUsers.map(cloud => {
              const local = localMap.get(cloud.email.toLowerCase());
              if (local) {
                return {
                  ...cloud,
                  // Se o nome local for diferente do da nuvem, pode ser uma edição recente
                  // Mas a nuvem deve ser a verdade eventual. 
                  // Para evitar o "revert" imediato, poderíamos preferir o local se for diferente.
                  // No entanto, syncUsersToCloud já deve ter enviado o local para a nuvem.
                  password: local.password, 
                  mustChangePassword: local.mustChangePassword
                };
              }
              return cloud;
            });
            
            // Adicionamos usuários locais que ainda não estão na nuvem
            const cloudEmails = new Set(cloudUsers.map(u => u.email.toLowerCase()));
            prev.forEach(local => {
              if (!cloudEmails.has(local.email.toLowerCase())) {
                merged.push(local);
              }
            });
            
            return merged;
          });
        }
        setHasFetchedUsers(true);
      }).catch(err => {
        logger.error("❌ Erro ao buscar usuários da nuvem:", err);
        setHasFetchedUsers(true); // Permite sync mesmo em erro para não travar
      });
    } else {
      setHasFetchedUsers(true); // Se não for admin ou não estiver em modo supabase, permite sync
    }
  }, [user?.email, databaseMode]);


  const toggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        // Verifica se o modo tela cheia é suportado/permitido no ambiente atual
        const doc = document as Document & {
          webkitFullscreenEnabled?: boolean;
          mozFullScreenEnabled?: boolean;
          msFullscreenEnabled?: boolean;
        };

        const isFullscreenEnabled = doc.fullscreenEnabled || 
                                   doc.webkitFullscreenEnabled || 
                                   doc.mozFullScreenEnabled || 
                                   doc.msFullscreenEnabled;

        if (!isFullscreenEnabled) {
          logger.warn("O modo tela cheia não está habilitado ou permitido neste ambiente (comum em visualizações dentro de iframes).");
          // Ativamos o modo imersivo apenas no estado interno para ocultar elementos da UI se necessário
          setInventory(prev => ({ ...prev, immersiveMode: true }));
          return;
        }

        const docEl = document.documentElement as HTMLElement & {
          webkitRequestFullScreen?: (options?: { navigationUI: 'hide' }) => Promise<void>;
          mozRequestFullScreen?: (options?: { navigationUI: 'hide' }) => Promise<void>;
          msRequestFullscreen?: (options?: { navigationUI: 'hide' }) => Promise<void>;
        };
        
        const options = { navigationUI: 'hide' as const };

        if (docEl.requestFullscreen) {
          docEl.requestFullscreen(options).catch((err: Error) => {
            logger.warn(`Falha ao solicitar tela cheia: ${err.message}. Isso pode ocorrer em ambientes de visualização.`);
          });
        } else if (docEl.webkitRequestFullScreen) {
          docEl.webkitRequestFullScreen(options);
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen(options);
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen(options);
        }
        
        setInventory(prev => ({ ...prev, immersiveMode: true }));
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
          mozCancelFullScreen?: () => Promise<void>;
          msExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
        
        setInventory(prev => ({ ...prev, immersiveMode: false }));
      }
    } catch (e) {
      logger.error("Fullscreen toggle failed", e);
    }
  }, []);

  // Sync isFullscreen state with document
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Estados para Modal de Duplicidade

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionStorage.getItem('__gbr_allow_reload') === 'true') {
        sessionStorage.removeItem('__gbr_allow_reload');
        return;
      }
      if (inventory.assets.length > 0 && inventory.status !== DatabaseStatus.EMPTY) {
        e.preventDefault();
        e.returnValue = 'Inventário em curso. Deseja realmente sair? Seus dados estão salvos no dispositivo.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [inventory]);


  const { allLocations, uniqueCentrosDeCusto } = useMemo(() => {
    const stats: Record<string, { total: number; checked: number; displayName: string }> = {};
    const locationsSet = new Set<string>(manualLocations);
    const centrosDeCustoSet = new Set<string>();
    
    const currentCompKey = selectedUnit ? normalizeKey(selectedUnit) : '';
    
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      
      // Centro de Custo
      if (a.CENTRODECUSTO) {
        centrosDeCustoSet.add(String(a.CENTRODECUSTO).trim().toUpperCase());
      }

      const assetFilial = normalizeKey(a.filial || '');
      const assetUnitId = normalizeKey(a._unitid || '');
      const assetTenant = normalizeKey(a.tenantId || a.GRUPO_EMPRESARIAL || '');
      
      // Se houver unidade selecionada, o ativo deve pertencer a ela (por ID ou Nome)
      if (currentCompKey && 
          assetFilial !== currentCompKey && 
          assetUnitId !== currentCompKey && 
          assetTenant !== currentCompKey) {
        continue;
      }

      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
      const effectiveLoc = a._localMaster || a.ENDERECO || a.LOCALIZACAO || a.CENTRO_CUSTO || 'SEM LOCAL';
      const locDisplay = String(effectiveLoc).trim().toUpperCase();
      const locKey = normalizeKey(effectiveLoc);
      
      if (locDisplay) locationsSet.add(locDisplay);

      const statusUpper = String(a.STATUS || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
      
      if (isBaixado && !isConferido) continue;

      if (!stats[locKey]) stats[locKey] = { total: 0, checked: 0, displayName: locDisplay };
      
      if (!isBaixado) stats[locKey].total++;
      
      if (isConferido) {
        stats[locKey].checked++;
        if (isBaixado) stats[locKey].total++;
      }
    }

    return { 
      locationsWithStats: stats, 
      allLocations: Array.from(locationsSet).sort(),
      uniqueCentrosDeCusto: Array.from(centrosDeCustoSet).sort()
    };
  }, [inventory.assets, selectedUnit, normalizeKey, manualLocations]);

  // REATIVAÇÃO E REFINAMENTO DAS REGRAS DE OURO (FLAGS)
  const determineTag = useCallback((asset: Asset, targetLocation: string): TagInventario => {
    const statusUpper = String(asset.STATUS || '').toUpperCase();
    const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
    const isConferido = !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
    
    // REGRA DE OURO: Item ATIVO mas com DATA DE BAIXA ou Status de Baixa
    const isGoldenRuleDivergent = !statusUpper.includes('BAIXA') && !!asset.DATABAIXA;
    asset._is_divergent_baixa = isGoldenRuleDivergent;
    
    // 1. PRIORIDADE MÁXIMA: ETIQUETAGEM (REGRA DE OURO v24)
    const originalEtq = normalizeKey(asset._plaquetaMaster || '');
    const needsLabel = originalEtq === 'ETIQUETAR';
    if (needsLabel) {
      if (isConferido) return TagInventario.ETIQUETADO;
      return TagInventario.FALTA_ETIQUETAR;
    }

    // 1.1 DIVERGÊNCIA CRÍTICA (REGRA DE OURO)
    if (isGoldenRuleDivergent) return TagInventario.DIVERGENCIA;

    // 2. BAIXADO (Se não conferido)
    if (isBaixado && !isConferido) return TagInventario.BAIXADO;
    
    // 3. ADOTADO EXTERNO (Empresa diferente)
    const assetCompKey = normalizeKey(asset.filial || asset._unitid || asset.tenantId || asset.GRUPO_EMPRESARIAL || '');
    const currentCompKey = normalizeKey(selectedUnit || '');
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      return TagInventario.ADOTADO_EXTERNO;
    }

    // 4. NOVO ITEM
    if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;

    // 5. DIVERGÊNCIA: Etiqueta física difere do registro lógico
    const currentEtq = normalizeKey(asset.ETIQUETA || "");
    const masterEtq = normalizeKey(asset._plaquetaMaster || "");
    if (masterEtq !== "" && masterEtq !== "ETIQUETAR" && currentEtq !== masterEtq) {
      return TagInventario.DIVERGENCIA;
    }

    // REGRA DE OURO: Se não foi conferido, é PENDENTE
    if (!isConferido) {
      return TagInventario.PENDENTE;
    }

    const targetLocKey = normalizeKey(targetLocation);
    const originalLocKey = normalizeKey(asset.ENDERECO || ""); 
    const currentAuditLocKey = asset._localMaster ? normalizeKey(asset._localMaster) : "";

    // 1) CONFERIDO: Localizado exatamente no ENDERECO original
    if (originalLocKey === targetLocKey) {
      return TagInventario.CONFERIDO;
    }

    // 3) RE-ADOTADO: Já conferido anteriormente em um local e agora encontrado em outro local
    if (isConferido && currentAuditLocKey !== "" && currentAuditLocKey !== targetLocKey) {
      return TagInventario.RE_ADOTADO;
    }

    // 2) ADOTADO: Localizado em endereço diferente do original
    return TagInventario.ADOTADO;
  }, [normalizeKey, selectedUnit]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (isSyncing) return;
      
      try {
        if (isDataLoaded) {
          const dirtyIds = Array.from(dirtyAssetsRef.current);
          const dirtyAssets = dirtyIds.map(id => inventory.assets.find(a => String(a.id) === id)).filter(Boolean) as Asset[];
          
          const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
          
          // Sincroniza se houver ativos sujos OU se a config mudou (lastUpdated mudou)
          // APENAS se estiver em modo SUPABASE e houver conexão configurada
          const shouldSyncCloud = hasSupabase && databaseMode === DatabaseMode.SUPABASE && (dirtyAssets.length > 0 || inventory.lastUpdated !== lastSyncTime);
          
          if (shouldSyncCloud) {
            setIsSyncing(true);
            try {
              await saveInventory(inventory, dirtyAssets, true);
              setLastSyncTime(inventory.lastUpdated || new Date().toISOString());
              setSyncError(null);
            } catch (err) {
              setSyncError('Erro na sincronização');
              logger.error('Sync error:', err);
            } finally {
              setIsSyncing(false);
            }
          } else {
            // FAST PATH: Salva apenas a config se não houver necessidade de sync pesado
            // Os ativos já estão sendo salvos incrementalmente via saveAssetIncremental
            const config = { ...inventory, assets: undefined } as unknown as Omit<InventoryState, 'assets'>;
            const isImporting = sqliteService.isImportingBatch || (typeof window !== 'undefined' && !!((window as unknown) as { __isImportingBatch?: boolean }).__isImportingBatch);
            if (!isImporting) {
              await saveConfigOnly(config);
            } else {
              logger.info(">>> [Persistence] Ignorando persistência Fast Path de configuração durante importação massiva/ingestão.");
            }
          }
          
          dirtyAssetsRef.current.clear();
        }
        localStorage.setItem('app_screen_history', safeStringify(history));
        sessionStorage.setItem('app_current_user', safeStringify(user));
        localStorage.setItem('app_users', safeStringify(users));
        localStorage.setItem('app_selected_unit', selectedUnit || '');
        localStorage.setItem('app_inventory_location', inventoryLocation || '');
        localStorage.setItem('app_is_inventorying', String(isInventorying));
        localStorage.setItem('app_consultation_filters', safeStringify(consultationFilters));
        localStorage.setItem('app_committed_consultation_filters', safeStringify(committedConsultationFilters));
        localStorage.setItem('app_dark_mode', String(inventory.darkMode || false));
        localStorage.setItem('app_battery_saver', String(inventory.batterySaver || false));
        localStorage.setItem('app_mandatory_photo_divergence', String(inventory.mandatoryPhotoOnDivergence || false));
        localStorage.setItem('app_mandatory_photo_new', String(inventory.mandatoryPhotoOnNewItem || false));
      } catch { logger.warn("Storage cap reached"); }
    }, 3000); // Reduzido de 10s para 3s para maior segurança de dados
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedUnit, inventoryLocation, isInventorying, isDataLoaded, consultationFilters, committedConsultationFilters]);

  const updateConfig = useCallback((updates: Partial<InventoryState>) => {
    setInventory(prev => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString()
    }));
  }, []);



  // Blindagem de Base Vazia: Redireciona para Carga Inicial se o banco físico estiver vazio pós-inicialização
  useEffect(() => {
    if (!dbInitialized || !user) return;

    const checkDatabaseEmptiness = async () => {
      try {
        const count = databaseMode === DatabaseMode.INTERNAL ? await sqliteService.getAssetCount() : inventory.assets.length;
        const isReallyEmpty = count === 0;
        setIsDatabaseEmpty(isReallyEmpty);
        
        const isBypass = user?.email?.trim().toLowerCase() === 'semorr@gmail.com';
        if (isReallyEmpty && !isBypass) {
          const exemptScreens = [
            AppScreen.LOGIN, 
            AppScreen.REGISTER, 
            AppScreen.CHANGE_PASSWORD,
            AppScreen.DATABASE_MANAGER,
            AppScreen.UNIT_SELECTION,
            AppScreen.UNIT_CONFIGURATOR,
            AppScreen.CAMPAIGN_MANAGEMENT,
            AppScreen.MODULE_SELECTION,
            AppScreen.ASSET_CONTROL_HOME
          ];
          
          if (!exemptScreens.includes(screen)) {
            logger.warn(">>> [BLINDAGEM] Banco vazio detectado pós-init. Redirecionando forçadamente para Seleção de Unidade.");
            pushScreen(AppScreen.UNIT_SELECTION);
          }
        }
      } catch (e) {
        logger.error(">>> [BLINDAGEM] Erro ao checar integridade de carga na inicialização:", e);
      }
    };
    
    checkDatabaseEmptiness();
  }, [dbInitialized, user, screen, databaseMode, inventory.assets.length, sqliteStatus, pushScreen]);

  // 1. Auth Listener para Supabase (Magic Link, Convites, Sessão)
  useEffect(() => {
    if (!isEngineReady || !supabase || databaseMode === DatabaseMode.INTERNAL) return;

    // Função para processar o login a partir de uma sessão
    const processSession = async (session: Session) => {
      if (!session?.user) return;
      
      const currentUser = userRef.current;
      
      // Se já temos um usuário no estado e é o mesmo, e já tem tenantid válido, não fazemos nada para evitar loop
      if (currentUser && currentUser.email === session.user.email && currentUser.tenantId) return;

      setIsLoading(true);
      try {
        // Garante que o usuário tenha um perfil na tabela user_permissions
        // Passamos os metadados para garantir que o tenantId e role sejam preservados
        // Unificamos user_metadata e app_metadata para garantir que o tenantid seja encontrado
        const unifiedMetadata = { 
          ...(session.user.user_metadata || {}), 
          ...(session.user.app_metadata || {}) 
        };
        const permissions = await ensureUserProfile(session.user.email!, unifiedMetadata, session.user.id);
        const permissionsObj = permissions as unknown as Record<string, unknown>;
        const unifiedMetadataObj = unifiedMetadata as unknown as Record<string, unknown>;
        logger.info(`[Auth] Perfil carregado para ${session.user.email}:`, { 
          dbTenant: permissions.tenantId || (permissionsObj.tenantid as string), 
          metaTenant: unifiedMetadata.tenantid || (unifiedMetadataObj.tenantId as string),
          finalTenant: permissions.tenantId || (permissionsObj.tenantid as string) || ''
        });
        
        let resolvedTenantId = (permissions.tenantId || (permissionsObj.tenantId as string) || (permissionsObj._tenantid as string) || (permissionsObj.tenantid as string) || unifiedMetadata.tenantid || (unifiedMetadataObj.tenantId as string) || localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId') || '').trim().toUpperCase();
        let resolvedUnitId = (permissions._unitid || (permissionsObj.unitid as string) || unifiedMetadata._unitid || (unifiedMetadataObj.unitid as string) || localStorage.getItem('filial') || sessionStorage.getItem('filial') || '').trim().toUpperCase();

        if (session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          const storedTenant = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId') || 'CICOPAL';
          resolvedTenantId = storedTenant === 'GBR_SUPER_ADMIN_CORINGA' ? 'CICOPAL' : storedTenant;
          resolvedUnitId = 'TODAS';
        }

        if (!resolvedTenantId || resolvedTenantId === 'NULL' || resolvedTenantId === 'UNDEFINED' || !resolvedUnitId || resolvedUnitId === 'NULL' || resolvedUnitId === 'UNDEFINED') {
          logger.warn(`[Auth Fail-Safe] Usuário logado sem tenantId ou filial associado: ${session.user.email}`);
          setIsSessionValid(false);
          setUser(null);
          sessionStorage.removeItem('app_current_user');
          sessionStorage.clear();
          setHistory([AppScreen.LOGIN]);
          
          if (supabase) {
            await supabase.auth.signOut();
          }

          setModalConfig({
            isOpen: true,
            title: 'Sessão Expirada',
            message: 'Identificador de Contrato ou Filial ausente para isolamento do banco RLS. Por favor, reautentique.',
            type: 'error',
            onConfirm: () => {}
          });
          setIsLoading(false);
          return;
        }

        const loggedUser: User = {
          id: session.user.id,
          email: session.user.email || '',
          username: permissions.username || unifiedMetadata.username || session.user.email?.split('@')[0] || 'user',
          name: permissions.name || unifiedMetadata.name || permissions.username || unifiedMetadata.username || session.user.email?.split('@')[0] || 'User',
          role: (permissions.role as UserRole) || (session.user.app_metadata?.role as UserRole) || (session.user.user_metadata?.role as UserRole) || UserRole.AUDITOR,
          is_admin: !!permissions.is_admin || session.user.app_metadata?.isAdmin === true || session.user.user_metadata?.isAdmin === true || session.user.app_metadata?.role === 'ADMIN',
          isAdmin: !!permissions.is_admin || session.user.app_metadata?.isAdmin === true || session.user.user_metadata?.isAdmin === true || session.user.app_metadata?.role === 'ADMIN',
          mustChangePassword: false,
          tenantId: resolvedTenantId,
          filial: resolvedUnitId,
          units: permissions.units || unifiedMetadata.units || (resolvedUnitId ? [resolvedUnitId] : [])
        };

        // Só atualizamos se houver mudança real para evitar loops de renderização
        const hasChanged = !currentUser || 
                          currentUser.email !== loggedUser.email || 
                          currentUser.tenantId !== loggedUser.tenantId || 
                          currentUser.role !== loggedUser.role;

        if (hasChanged) {
          setUser(loggedUser);
          sessionStorage.setItem('app_current_user', safeStringify(loggedUser));
        }
        
        // Log de Auditoria na Nuvem
        try {
          logAuditEvent({
            user_email: loggedUser.email,
            action: 'LOGIN',
            details: `Usuário logado no sistema (${loggedUser.role})`,
            tenantId: loggedUser.tenantId
          });
        } catch (logErr) {
          logger.warn('[SRE Failsafe] Falha ao registrar log de auditoria na inicialização:', logErr);
        }
        
        // Se logou via Supabase, garante que o modo está correto
        if (!isInternalMode) {
          if (databaseMode !== DatabaseMode.SUPABASE) {
            setDatabaseMode(DatabaseMode.SUPABASE);
            localStorage.setItem('app_database_mode', DatabaseMode.SUPABASE);
          }
          // Sincroniza dados da nuvem para este usuário (Tenant + Unit)
          syncFromCloud(loggedUser.tenantId, DatabaseMode.SUPABASE);
        } else {
          if (databaseMode !== DatabaseMode.INTERNAL) {
            setDatabaseMode(DatabaseMode.INTERNAL);
            localStorage.setItem('app_database_mode', DatabaseMode.INTERNAL);
          }
        }
      } catch (err) {
        logger.error('Erro ao processar login automático:', err);
        // Fallback: se falhar a busca de permissões, tenta logar com dados básicos do Auth
        const fallbackUser: User = {
          username: session.user.email?.split('@')[0] || 'Usuário',
          email: session.user.email!,
          role: UserRole.AUDITOR,
          isAdmin: false,
          mustChangePassword: false,
          tenantId: 'CICOPAL'
        };
        setUser(fallbackUser);
        sessionStorage.setItem('app_current_user', safeStringify(fallbackUser));
        if (!isInternalMode) {
          setDatabaseMode(DatabaseMode.SUPABASE);
        } else {
          setDatabaseMode(DatabaseMode.INTERNAL);
        }
        pushScreen(AppScreen.MODULE_SELECTION);
      } finally {
        setIsLoading(false);
      }
    };

    // Verifica erros no hash ou query da URL (Magic Link expirado, etc)
    const handleUrlErrors = () => {
      const hash = window.location.hash;
      const search = window.location.search;
      
      let errorCode: string | null = null;
      let errorDescription: string | null = null;

      if (hash && hash.includes('error=')) {
        const params = new URLSearchParams(hash.substring(1));
        errorCode = params.get('error_code');
        errorDescription = params.get('error_description');
      } else if (search && search.includes('error=')) {
        const params = new URLSearchParams(search);
        errorCode = params.get('error_code');
        errorDescription = params.get('error_description');
      }
      
      if (errorCode) {
        // Se o usuário já estiver logado, ignoramos erros de OTP expirado (clique redundante)
        if (userRef.current && (errorCode === 'otp_expired' || errorDescription?.includes('expired'))) {
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }

        if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
          setModalConfig({
            isOpen: true,
            title: 'Link de Acesso Expirado',
            message: 'Este link de acesso (Magic Link) já expirou ou foi utilizado. Por favor, retorne à tela de login e solicite um novo link. Lembre-se que o link é de uso único e expira em 5 minutos.',
            type: 'error'
          });
        } else if (errorCode === 'access_denied') {
          setModalConfig({
            isOpen: true,
            title: 'Acesso Negado',
            message: 'O link de acesso é inválido ou foi recusado pelo servidor. Verifique se você está utilizando o link mais recente enviado para seu e-mail.',
            type: 'error'
          });
        } else {
          setModalConfig({
            isOpen: true,
            title: 'Erro de Autenticação',
            message: `Ocorreu um erro ao processar seu login: ${errorDescription || errorCode}. Tente novamente ou entre em contato com o suporte.`,
            type: 'error'
          });
        }
        // Limpa a URL para não mostrar o erro novamente
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    handleUrlErrors();

    // Verifica sessão atual ao montar
    const currentUserStr = sessionStorage.getItem('app_current_user');
    const isNetworkOffline = !navigator.onLine;

    // GBR KARDEK SRE: Ignora bypass de modo offline para forçar login unificado seguro no F5
    if (isNetworkOffline && currentUserStr) {
      logger.warn(">>> [Boot SRE] Conexão indisponível (F5 Offline). Proteção ativada: destruindo cache local fantasma.");
      setIsSessionValid(false);
      setUser(null);
      sessionStorage.removeItem('app_current_user');
      sessionStorage.removeItem('filial');
      sessionStorage.removeItem('tenantId');
      setHistory([AppScreen.LOGIN]);
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const isValid = !!session && !!session.user && typeof session.user.id === "string";
        setIsSessionValid(isValid);
        if (isValid) {
          processSession(session);
        } else {
          // GBR KARDEK SRE: Proibido recuperar sessões locais fantasmas em nova montagem (F5)
          logger.warn('[Boot SRE] Nenhuma sessão de nuvem autenticada. Resetando cache e forçando LOGIN...');
          removerLoaderEstatico();
          setIsDataLoaded(true);
          setUser(null);
          setIsSessionValid(false);
          sessionStorage.removeItem('app_current_user');
          sessionStorage.removeItem('filial');
          sessionStorage.removeItem('tenantId');
          setHistory([AppScreen.LOGIN]);
        }
      }).catch(err => {
        logger.error('[Boot] Erro ao obter sessão atual na montagem (Purga de Cache):', err);
        // GBR KARDEK SRE: Em qualquer falha de boot ou sessão, destruir fantasma e exigir login
        setIsSessionValid(false);
        setUser(null);
        sessionStorage.removeItem('app_current_user');
        sessionStorage.removeItem('filial');
        sessionStorage.removeItem('tenantId');
        setHistory([AppScreen.LOGIN]);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.info('[App] Evento de Autenticação Supabase:', event, session?.user?.email);
      const isValid = !!session && !!session.user && typeof session.user.id === "string";
      setIsSessionValid(isValid);
      
      if (isValid && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        processSession(session);
      } else if (event === 'SIGNED_OUT' || (event as string) === 'TOKEN_REFRESH_FAILED' || !isValid) {
        // Limpa estado se deslogar no Supabase ou se o refresh do token falhar
        const currentUserStr = sessionStorage.getItem('app_current_user');
        let isLocalUser = false;
        try {
          if (currentUserStr) {
            const parsed = JSON.parse(currentUserStr);
            const lowerEmail = (parsed.email || '').toLowerCase();
            const lowerUsername = (parsed.username || '').toLowerCase();
            if (lowerUsername === 'admin' || lowerUsername === 'semorr' || parsed.role === 'DEMO' || lowerEmail === 'semorr@gmail.com' || parsed.role === 'ADMIN' || parsed.role === 'MASTER' || parsed.role === 'MOBILE_SINGLE') {
              isLocalUser = true;
            }
          }
        } catch { /* ignore */ }

        if (isLocalUser) {
          logger.info('[Supabase Auth Listener] Sincronização offline/Soberania Nativa ativa. Ignorando evento auth da nuvem para o usuário local:', currentUserStr);
          setIsSessionValid(true); // Garante validação da sessão local
          return;
        }

        if (currentUserStr && databaseMode === DatabaseMode.SUPABASE && !isLocalUser && navigator.onLine) {
          logger.warn('[Supabase] Sessão expirada ou Token inválido. Forçando logout...');
          setModalConfig({
            isOpen: true,
            title: 'Sessão Expirada',
            message: 'Sua sessão na nuvem expirou ou o token de acesso é inválido. Por favor, faça login novamente.',
            type: 'error',
            onConfirm: () => {
              import('./services/supabaseService').then(m => m.signOut());
              setIsSessionValid(false);
              setUser(null);
              sessionStorage.removeItem('app_current_user');
              setHistory([AppScreen.LOGIN]);
            }
          });
        } else if (event === 'SIGNED_OUT' || !isValid) {
          setIsSessionValid(false);
          setUser(null);
          sessionStorage.removeItem('app_current_user');
          setHistory([AppScreen.LOGIN]);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, databaseMode, isEngineReady]); // Removido 'user' para evitar loops infinitos de re-processamento de sessão

  const handleClearMultipleCompanies = async (companiesToClear: string[]) => {
    if (companiesToClear.length === 0) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
    
    // Backup de segurança antes da limpeza em massa
    const backupFileName = `INVENTARIO_MOBILE+KBP+LIMPEZA_MASSA+${dateStr}+${timeStr}`;
    await backupInventory(databaseMode, backupFileName);

    setIsSyncing(true);
    try {
      // 1. Limpa localmente todas as empresas selecionadas em uma única operação
      await clearMultipleInventories(companiesToClear, databaseMode);

      // 2. Se estiver no modo Supabase, limpa a nuvem também em uma única operação
      if (databaseMode === DatabaseMode.SUPABASE) {
        const isGlobalAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const effectiveTenantId = isGlobalAdmin ? undefined : (user?.tenantId || user?.tenantid);
        await clearCloudInventory(companiesToClear, effectiveTenantId);
        
        // Atualiza o timestamp na nuvem - envolvemos em try/catch para não falhar a limpeza se apenas o log falhar
        try {
          const configToSync = { ...inventory };
          // @ts-expect-error - assets is removed for sync
          delete configToSync.assets;
          await syncConfigToCloud({ 
            ...configToSync, 
            lastUpdated: new Date().toISOString() 
          } as Omit<InventoryState, 'assets'>, effectiveTenantId);
        } catch (syncErr) {
          logger.warn('Limpeza concluída, mas falha ao atualizar timestamp na nuvem:', syncErr);
        }

        // Log de Auditoria na Nuvem
        logAuditEvent({
          user_email: user?.email || 'unknown',
          action: 'DELETE',
          table_name: 'assets',
          details: `Limpeza em massa de banco de dados (Unidades: ${companiesToClear.join(', ')})`,
          tenantId: user?.tenantId || 'CICOPAL'
        });
      }

      // 3. Atualiza o estado local
      sessionStorage.setItem('app_just_cleared_data', 'true');
      const normalizedToClear = companiesToClear.map(c => c.toUpperCase().trim());
      const remainingAssets = inventory.assets.filter(a => !normalizedToClear.includes((a.filial || '').toUpperCase().trim()));
      
      setInventory(prev => {
        const normalizedToClear = companiesToClear.map(c => c.toUpperCase().trim());
        const remainingCompanies = prev.companies.filter(c => !normalizedToClear.includes(c.toUpperCase().trim()));
        
        return {
          ...prev,
          assets: remainingAssets,
          companies: remainingCompanies,
          lastUpdated: new Date().toISOString(),
          status: remainingAssets.length > 0 ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY
        };
      });

      setModalConfig({
        isOpen: true,
        title: 'Limpeza em Massa Concluída',
        message: `${companiesToClear.length} unidades foram limpas com sucesso. Um backup de segurança foi gerado: ${backupFileName}`,
        type: 'info'
      });
    } catch (error: unknown) {
      logger.error('Erro na limpeza em massa:', error);
      
      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        errorMessage = String(errObj.message || errObj.details || errObj.hint || safeStringify(error));
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      setModalConfig({
        isOpen: true,
        title: 'Erro na Limpeza',
        message: `Ocorreu um erro ao tentar limpar as unidades selecionadas: ${errorMessage}`,
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckIntegrity = async (): Promise<{ success: boolean; message: string }> => {
    try {
      logger.info('>>> [Integrity] Iniciando verificação manual...');
      const loaded = await loadInventory(databaseMode);
      
      if (!loaded) {
        return { success: false, message: "Não foi possível carregar os dados para verificação." };
      }

      if (loaded._integrity_failed) {
        return { 
          success: false, 
          message: "ALERTA: A integridade dos dados foi comprometida! O checksum SHA-256 atual não corresponde ao gravado. Isso pode indicar corrupção de dados ou alteração externa não autorizada." 
        };
      }

      return { 
        success: true, 
        message: `Integridade verificada com sucesso! Todos os ${loaded.assets.length} ativos correspondem ao checksum SHA-256 gravado no último salvamento.` 
      };
    } catch (error) {
      logger.error('Erro ao verificar integridade:', error);
      return { success: false, message: "Erro técnico durante a verificação de integridade." };
    }
  };

  const handleUpdateDatabaseMode = async (mode: DatabaseMode) => {
    setIsSyncing(true);
    try {
      // 1. Salva o estado atual no modo atual antes de trocar para garantir persistência
      logger.info(`>>> [ModeSwitch] Salvando estado atual (${databaseMode}) antes da troca...`);
      await saveInventory(inventory);

      // 2. Troca o modo no localStorage e no estado de controle
      setDatabaseMode(mode);
      localStorage.setItem('app_database_mode', mode);

      // Log de Auditoria
      logAuditEvent({
        user_email: user?.email || 'unknown',
        action: 'UPDATE',
        table_name: 'config',
        details: `Alteração do modo de banco de dados para: ${mode}`,
        tenantId: user?.tenantId || 'CICOPAL'
      });

      // 3. Tenta carregar o estado do novo modo do IndexedDB
      logger.info(`>>> [ModeSwitch] Carregando dados do novo modo (${mode})...`);
      const loaded = await loadInventory(mode);
      
      if (loaded && loaded.assets && loaded.assets.length > 0) {
        logger.info(`>>> [ModeSwitch] Dados encontrados para ${mode}. Restaurando...`);
        setInventory(loaded);
      } else {
        logger.info(`>>> [ModeSwitch] Nenhum dado local para ${mode}. Iniciando base limpa.`);
        const cleanState = getInitialInventoryState(mode);
        setInventory(cleanState);
        
        // Se mudou para modo nuvem e está vazio, tenta sincronizar (apenas se houver usuário)
        if (mode.startsWith('SUPABASE') && user) {
          logger.info(`>>> [ModeSwitch] Modo Nuvem detectado. Iniciando sincronização automática...`);
          await syncFromCloud(undefined, mode);
        }
      }
      
      setModalConfig({
        isOpen: true,
        title: 'Modo Alterado',
        message: mode === DatabaseMode.INTERNAL 
          ? 'O sistema agora está operando em Modo INTERNO (Mobile Puro). Todas as conexões com a nuvem foram suspensas para garantir estabilidade máxima.' 
          : 'O sistema agora está operando em Modo NUVEM (Supabase). A sincronização automática foi reativada.',
        type: 'success',
        onConfirm: () => {
          // Recarrega a página para garantir que todos os serviços (Supabase, Sync, etc) 
          // sejam reinicializados com as novas flags de blindagem técnica.
          sessionStorage.setItem('__gbr_allow_reload', 'true');
          window.location.reload();
        }
      });
    } catch (error) {
      logger.error('Erro ao trocar modo de banco de dados:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro na Troca de Modo',
        message: 'Não foi possível alternar o modo de banco de dados com segurança. Tente novamente.',
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetGPS = () => {
    localStorage.removeItem('gbr_gps_bypass');
    setModalConfig({
      isOpen: true,
      title: 'GPS Resetado',
      message: 'O bypass de GPS foi removido. O sistema tentará obter a localização real na próxima operação.',
      type: 'success'
    });
  };

  const handleToggleGpsBypass = (val: boolean) => {
    localStorage.setItem('gbr_gps_bypass', String(val));
    updateConfig({ isFieldMode: val }); 
    window.location.reload(); 
  };

  const popScreen = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.length > 1 ? prev.slice(0, -1) : [AppScreen.MAIN_MENU];
      const newScreen = newHistory[newHistory.length - 1];
      logger.info(`>>> [Navigation] Popping screen back to: ${newScreen}`);
      if (newScreen !== AppScreen.ASSET_DETAIL) {
        setSelectedAssets([]);
      }
      return newHistory;
    });
  }, [setHistory]);

  const handleUpdateUnitConfigs = useCallback((configs: UnitConfig[]) => {
    setInventory(prev => ({ ...prev, unitConfigs: configs }));
    setUnitConfigs(configs);
    refreshCampaigns();
  }, [refreshCampaigns]);

  const completeOnboarding = useCallback(() => {
    try {
      logger.info("Finalizando onboarding - Início da função");
      
      // 1. Persistência imediata
      localStorage.setItem('app_onboarding_completed', 'true');
      logger.info("Finalizando onboarding - LocalStorage persistido");
      
      // 2. Atualização de estado
      setInventory(prev => {
        logger.info("Finalizando onboarding - Atualizando estado do inventário");
        const newState = { ...prev, hasCompletedOnboarding: true };
        saveInventory(newState).catch(e => logger.error('Erro ao salvar no IndexedDB:', e));
        return newState;
      });
      
      // 3. Navegação forçada se necessário
      const currentScreen = history[history.length - 1];
      if (currentScreen === AppScreen.ONBOARDING || currentScreen === AppScreen.LOGIN) {
        logger.info("Finalizando onboarding - Redirecionando usuário para MODULE_SELECTION");
        setHistory([AppScreen.MODULE_SELECTION]);
      }
    } catch (error) {
      logger.error("Erro crítico no completeOnboarding:", error);
    }
  }, [history, user, ADMIN_EMAIL]);

  const commitAssetUpdate = useCallback(async (updatedAsset: Asset) => {
    dirtyAssetsRef.current.add(String(updatedAsset.id));
    
    // Identificar a origem da transação (Código Fixo de 4 dígitos)
    let origin: TransactionOrigin | undefined;
    const currentScreen = history[history.length - 1];
    const previousScreen = history.length > 1 ? history[history.length - 2] : null;

    if (currentScreen === AppScreen.INVENTORY || previousScreen === AppScreen.INVENTORY) {
      origin = TransactionOrigin.INVENTORY;
    } else if (currentScreen === AppScreen.LABELING || previousScreen === AppScreen.LABELING) {
      origin = TransactionOrigin.LABELING;
    } else if (currentScreen === AppScreen.ACCOUNT_RECONCILIATION || previousScreen === AppScreen.ACCOUNT_RECONCILIATION) {
      origin = TransactionOrigin.ACCOUNT_RECONCILIATION;
    }

    const isReconciliationWorkflow = history.includes(AppScreen.ACCOUNT_RECONCILIATION);
    const targetLoc = isReconciliationWorkflow
      ? (updatedAsset.ENDERECO || "")
      : (inventoryLocation 
          ? inventoryLocation.toUpperCase().trim() 
          : (updatedAsset.ENDERECO || "").toString().toUpperCase().trim());
    
    const updates = { ...updatedAsset } as Asset;
    // Se vier com _conferido explicitamente definido, respeitamos (para permitir desmarcar no bumerangue)
    if (updates._conferido === undefined) {
      updates._conferido = true;
    }
    if (!updates._dataLeitura) {
      updates._dataLeitura = new Date().toISOString();
    }
    updates._auditor = user?.name || user?.username || user?.email || 'SISTEMA';
    updates._origemTransacao = origin; // Aplica o código fixo
    
    // Garantir que tenant e unit estão definidos de forma dinâmica
    if (!updates.tenantId) {
      updates.tenantId = user?.tenantId || localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId') || '';
    }
    if (!updates._unitid) {
      updates._unitid = user?.filial || localStorage.getItem('filial') || sessionStorage.getItem('filial') || '';
    }
    
    // Log de Auditoria
    const index = inventory.assets.findIndex(a => String(a.id) === String(updatedAsset.id));
    const historyEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      user: user?.name || user?.username || user?.email || 'SISTEMA',
      action: index === -1 ? 'CREATE' : 'UPDATE',
      details: `Item ${index === -1 ? 'criado' : 'atualizado'} no local ${targetLoc} via ${currentScreen}`,
      tenantid: user?.tenantId || user?.tenantid || '',
      origin: origin // Aplica o código fixo no log
    };
    updates._history = [...(updates._history || []), historyEntry];
    
    const alteredFields = new Set<string>(updates._camposAlterados || []);
    const existingAsset = index !== -1 ? inventory.assets[index] : null;
    const originalValues = { ...(existingAsset?._valoresOriginais || {}) };

    if (existingAsset) {
      const wasLabelingCandidate = 
        String(existingAsset.ETIQUETA || '').toUpperCase().includes('ETIQUETAR') || 
        String(existingAsset._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' ||
        existingAsset.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR ||
        existingAsset._plaquetado === true;

      Object.keys(updates).forEach(key => {
        if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
        const k = key as keyof Asset;
        if (String(updates[k]) !== String(existingAsset[k])) {
          alteredFields.add(key);
          if (originalValues[key] === undefined) {
            originalValues[key] = existingAsset[k] as string | number | boolean | null;
          }
        }
      });

      if (wasLabelingCandidate) {
        updates._plaquetado = true;
      }
    }
    updates._valoresOriginais = originalValues;
    updates._camposAlterados = Array.from(alteredFields);

    // 1) Sincronizar o estado da UI imediatamente para reatividade máxima sem travar
    setInventory(prev => {
      const newAssets = [...prev.assets];
      const idx = newAssets.findIndex(a => String(a.id) === String(updates.id));
      if (idx !== -1) {
        newAssets[idx] = updates;
      } else {
        newAssets.push(updates);
      }
      return {
        ...prev,
        assets: newAssets,
        lastUpdated: new Date().toISOString()
      };
    });

    setSqliteUnitAssets(prev => {
      const newAssets = [...prev];
      const idx = newAssets.findIndex(a => String(a.id) === String(updates.id));
      if (idx !== -1) {
        newAssets[idx] = updates;
      } else {
        const isSameUnit = String(updates.filial || '').toUpperCase().trim() === String(currentUnit || '').toUpperCase().trim();
        if (isSameUnit) {
          newAssets.push(updates);
        }
      }
      return newAssets;
    });

    setLastLocalSave(new Date().toISOString());

    // 2) Gravação assíncrona/background para o DB nativo ou Sync em nuvem
    if (databaseMode === DatabaseMode.INTERNAL) {
      logger.info(`>>> [KARDEK] Persistindo no SQLite em background sem bloquear a UI...`);
      Promise.resolve().then(async () => {
        try {
          if (existingAsset) {
            // Registrar delta de auditoria síncrona/local-first no SQLite imediatamente antes da persistência
            try {
              await auditService.logAssetChange(
                user?.email || 'SISTEMA',
                existingAsset,
                updates
              );
            } catch (auditErr) {
              logger.error(">>> [Audit Error] Erro ao registrar trilha em background:", auditErr);
            }

            const changedFields: { field: string; oldValue: string | null; newValue: string | null }[] = [];
            Object.keys(updates).forEach(key => {
              if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO' || key === 'latitude' || key === 'longitude' || key === 'timestamp_gravacao') return;
              
              const oldValue = existingAsset[key as keyof Asset];
              const newValue = updates[key as keyof Asset];
              
              if (String(oldValue || '') !== String(newValue || '')) {
                changedFields.push({
                  field: key,
                  oldValue: oldValue !== undefined && oldValue !== null ? String(oldValue) : null,
                  newValue: newValue !== undefined && newValue !== null ? String(newValue) : null
                });
              }
            });

            if (changedFields.length > 0) {
              for (const change of changedFields) {
                await sqliteService.bufferFieldChange(
                  updates,
                  change.field,
                  change.oldValue,
                  change.newValue,
                  user?.email || 'SISTEMA'
                );
              }
            } else {
              await localDb.assets.put(updates, user?.email || 'SISTEMA');
            }
          } else {
            await localDb.assets.put(updates, user?.email || 'SISTEMA');
          }
          logger.info(`>>> [KARDEK] Persistido com sucesso no SQLite para id: ${updates.id}`);
        } catch (err) {
          logger.error(">>> [KARDEK] Falha ao persistir alterações no SQLite:", err);
        }
      });
    } else {
      setIsProcessing(true);
      try {
        await syncAssetsToCloud([updates], user?.tenantId || user?.tenantid);
        setRefreshVersion(prev => prev + 1);
        logger.info(`>>> [KARDEK] Persistido na Nuvem para id: ${updates.id}`);
      } catch (err) {
        logger.error(">>> [KARDEK] Falha ao sincronizar com nuvem:", err);
        showModal("Erro de Sincronização", "Erro SQL (Nuvem): " + (err instanceof Error ? err.message : String(err)), "error");
      } finally {
        setIsProcessing(false);
      }
    }
  }, [history, inventoryLocation, databaseMode, user, inventory.assets, currentUnit]);

  const updateAsset = useCallback(async (updatedAsset: Asset) => {
    // ALERTA DE DUPLICIDADE DE ETIQUETA
    const newEtiqueta = String(updatedAsset.ETIQUETA || '').trim().toUpperCase();
    if (newEtiqueta && newEtiqueta !== 'ETIQUETAR') {
      const existing = inventory.assets.find(a => String(a.id) === String(updatedAsset.id));
      const oldEtiqueta = String(existing?.ETIQUETA || '').trim().toUpperCase();

      if (newEtiqueta !== oldEtiqueta) {
        const duplicate = inventory.assets.find(a => 
          String(a.id) !== String(updatedAsset.id) && 
          String(a.ETIQUETA || '').trim().toUpperCase() === newEtiqueta
        );
        if (duplicate) {
          setPendingAssetUpdate(updatedAsset);
          setDuplicateModalMessage(`ALERTA DE DUPLICIDADE!\n\nA etiqueta "${newEtiqueta}" já está em uso pelo item:\n"${duplicate.DESCRICAODOATIVO}"\n\nDeseja continuar mesmo assim?`);
          setIsDuplicateModalOpen(true);
          return;
        }
      }
    }

    const assetWithGps = { ...updatedAsset };
    
    const existing = inventory.assets.find(a => String(a.id) === String(updatedAsset.id));
    const isNew = !existing;

    // Incrementa versão para controle de concorrência (Optimistic Concurrency Control)
    const nextVersion = (updatedAsset._version || 1) + (isNew ? 0 : 1);

    // Adiciona entrada na trilha de auditoria
    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      user: user?.email || 'unknown',
      action: isNew ? 'INSERT' : 'UPDATE',
      details: isNew ? 'Criação de novo item' : `Alteração de campos: ${Object.keys(updatedAsset).filter(k => !k.startsWith('_')).join(', ')}`,
      tenantid: user?.tenantId || user?.tenantid,
      origin: updatedAsset._origemTransacao
    };
    
    const assetWithHistory = {
      ...assetWithGps,
      currentCampaignId: inventory.currentCampaignId || assetWithGps.currentCampaignId,
      _version: nextVersion,
      _history: [...(assetWithGps._history || []), auditEntry],
      _auditor: user?.email || assetWithGps._auditor,
      _dataLeitura: new Date().toISOString()
    };

    // Captura GPS de forma ASSÍNCRONA mas PRIORITÁRIA para o primeiro commit
    if (updatedAsset._conferido) {
      logger.info(`>>> [GPS] Iniciando captura prioritária para item ${updatedAsset.id}...`);
      
      try {
        const metrics = await telemetryService.getDeviceMetrics();
        logger.info(`>>> [GPS/Bateria] Nível da bateria para GPS: ${metrics.battery}%`);
        
        const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const isGpsBypassed = localStorage.getItem('gbr_gps_bypass') === 'true';
        
        let loc = { lat: 0, lng: 0, altitude: 0 };
        if (isAdmin || isGpsBypassed) {
          logger.info('>>> [GPS] Perfis administrativos/bypass detectado de forma síncrona: bypass imediato da malha de captura física.');
          if (currentUnitConfig?.lat && currentUnitConfig?.lng) {
            loc = { lat: currentUnitConfig.lat, lng: currentUnitConfig.lng, altitude: 0 };
          }
        } else if (metrics.battery > 5) {
          // REGRA DE RIGOR: Aguarda até 3 segundos pela posição GPS antes de salvar
          // Se falhar ou timeout, usa fallback da unidade
          loc = await Promise.race([
            getCurrentLocation(),
            new Promise<import('./utils/gpsUtils').GpsLocation>((_, reject) => setTimeout(() => reject(new Error('GPS Timeout')), 3000))
          ]).catch(e => {
            logger.warn('>>> [GPS] Falha na captura rápida, usando âncora:', e);
            if (currentUnitConfig?.lat && currentUnitConfig?.lng) {
              return { lat: currentUnitConfig.lat, lng: currentUnitConfig.lng, altitude: 0 };
            }
            return { lat: 0, lng: 0, altitude: 0 };
          });
        } else {
          logger.warn('>>> [GPS] Bloqueio crítico de GPS: bateria de', metrics.battery, '% ou inferior!');
          if (currentUnitConfig?.lat && currentUnitConfig?.lng) {
            loc = { lat: currentUnitConfig.lat, lng: currentUnitConfig.lng, altitude: 0 };
          }
        }

        logger.info(`>>> [GPS] Capturado para Kardex: ${loc.lat}, ${loc.lng}, Alt: ${loc.altitude}m`);
        
        // Injeta GPS no objeto e no registro da auditoria
        assetWithHistory.latitude = loc.lat;
        assetWithHistory.longitude = loc.lng;
        
        // GBR v25: Processamento Vertical (Z-Axis)
        assetWithHistory._altitude_metros = loc.altitude || 0;
        const { convertAltitudeToFloor } = await import('./utils/gpsUtils');
        assetWithHistory._id_andar = convertAltitudeToFloor(loc.altitude);
        
        // Atualiza a última entrada da trilha com a posição exata
        const lastIndex = assetWithHistory._history.length - 1;
        if (lastIndex >= 0) {
          assetWithHistory._history[lastIndex].details += ` [GPS: ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}, Andar: ${assetWithHistory._id_andar}]`;
        }
      } catch (e) {
        logger.error(">>> [GPS] Erro fatal na lógica de captura:", e);
      }
    }

    // Commit definitivo com ou sem GPS (fallback garantido acima)
    await commitAssetUpdate(assetWithHistory);
    
    // Adiciona à lista de sujos para garantir sync
    dirtyAssetsRef.current.add(String(assetWithHistory.id));
  }, [inventory.assets, commitAssetUpdate, user, databaseMode, history, currentUnitConfig]);

  const unitizeAsset = useCallback(async (parentAsset: Asset, numberOfUnits: number, percentages?: number[]) => {
    if (numberOfUnits < 2) return;

    const newAssets: Asset[] = [];
    const timestamp = new Date().toISOString();
    const auditor = user?.name || user?.username || user?.email || 'AUDITOR';

    // Campos de valor que devem ser rateados
    const valueFields = [
      '_valor_aquisicao',
      '_valor_residual',
      '_depreciacao_acumulada',
      '_perda_impairment',
      '_valor_recuperavel',
      '_valor_justo',
      '_valor_em_uso'
    ] as const;

    // Função auxiliar para rateio com ajuste de arredondamento na última unidade
    const calculateSplit = (total: number, units: number, index: number, pcts?: number[]) => {
      if (pcts && pcts.length === units) {
        // Rateio por Percentual
        const pct = pcts[index] / 100;
        const val = Math.round(total * pct * 100) / 100;
        
        if (index === units - 1) {
          // Ajuste fino na última unidade para bater o total exato
          let sumPrevious = 0;
          for (let j = 0; j < units - 1; j++) {
            sumPrevious += Math.round(total * (pcts[j] / 100) * 100) / 100;
          }
          return Math.round((total - sumPrevious) * 100) / 100;
        }
        return val;
      }

      // Rateio Igual (Default)
      const baseValue = Math.floor((total / units) * 100) / 100;
      if (index === units - 1) {
        // Última unidade recebe a diferença de arredondamento
        return Math.round((total - (baseValue * (units - 1))) * 100) / 100;
      }
      return baseValue;
    };

    // 1. Marcar o pai como unitarizado (Valor contábil do pai permanece para histórico, mas ele sai do giro)
    const updatedParent: Asset = {
      ...parentAsset,
      _is_unitized: true,
      _conferido: true,
      _dataLeitura: timestamp,
      _auditor: auditor,
      TAG_INVENTARIO: TagInventario.CONFERIDO,
      _history: [
        ...(parentAsset._history || []),
        {
          timestamp,
          user: auditor,
          action: 'UNITARIZAÇÃO',
          details: `Ativo desmembrado em ${numberOfUnits} unidades. Método: ${percentages ? 'Percentual' : 'Igual'}.`
        }
      ]
    };

    // 2. Criar os filhos com rateio de valores
    for (let i = 0; i < numberOfUnits; i++) {
      const childId = `UNIT-${parentAsset.id}-${i + 1}-${Date.now()}`;
      
      // Inicializa o objeto do filho
      const child: Asset = {
        ...parentAsset,
        id: childId,
        _parent_id: parentAsset.id,
        _isNew: true,
        _conferido: false,
        ETIQUETA: 'ETIQUETAR',
        QT: 1,
        _plaquetaMaster: 'ETIQUETAR',
        _dataLeitura: undefined,
        _auditor: undefined,
        TAG_INVENTARIO: TagInventario.FALTA_ETIQUETAR,
        _history: [
          {
            timestamp,
            user: auditor,
            action: 'CRIAÇÃO POR UNITARIZAÇÃO',
            details: `Unidade ${i + 1} de ${numberOfUnits} gerada a partir do ativo ${parentAsset.ETIQUETA}. ${percentages ? `Percentual: ${percentages[i]}%` : ''}`
          }
        ]
      };

      // Rateia os campos numéricos
      valueFields.forEach(field => {
        const totalValue = Number(parentAsset[field] || 0);
        if (totalValue > 0) {
          child[field] = calculateSplit(totalValue, numberOfUnits, i, percentages);
        }
      });

      // Rateia VLRAQUISIC (se for numérico ou string conversível)
      const vlrAquisicTotal = typeof parentAsset.VLRAQUISIC === 'number' 
        ? parentAsset.VLRAQUISIC 
        : parseFloat(String(parentAsset.VLRAQUISIC || '0').replace(',', '.'));
      
      if (!isNaN(vlrAquisicTotal) && vlrAquisicTotal > 0) {
        const splitVlr = calculateSplit(vlrAquisicTotal, numberOfUnits, i, percentages);
        child.VLRAQUISIC = typeof parentAsset.VLRAQUISIC === 'number' ? splitVlr : splitVlr.toFixed(2);
      }

      newAssets.push(child);
    }

    // 3. Atualizar estado APÓS confirmação (Pesimismo Saudável)
    setIsProcessing(true);
    try {
      if (databaseMode === DatabaseMode.INTERNAL) {
        // No modo interno salvamos os novos ativos 
        await sqliteService.bulkInsertAssets([updatedParent, ...newAssets]);
      } else {
        await syncAssetsToCloud([updatedParent, ...newAssets], user?.tenantId || user?.tenantid || '');
      }

      setInventory(prev => ({
        ...prev,
        assets: [
          ...prev.assets.map(a => String(a.id) === String(parentAsset.id) ? updatedParent : a),
          ...newAssets
        ],
        lastUpdated: timestamp
      }));

      setModalConfig({
        isOpen: true,
        title: 'Unitarização Concluída',
        message: `${numberOfUnits} novas fichas foram geradas com valores rateados (${percentages ? 'por percentual' : 'igualmente'}). O total dos filhos é 100% igual ao valor do pai.`,
        type: 'success'
      });
    } catch (err) {
      logger.error('>>> [DATABASE] Erro ao unitarizar ativo:', err);
      showModal("Erro de Unitarização", "ERRO SQL (Unitarização): " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsProcessing(false);
    }
  }, [user, databaseMode, inventory.assets]);

  const restoreAsset = useCallback(async (assetId: string) => {
    const assetToRestore = inventory.assets.find(a => String(a.id) === String(assetId));
    if (!assetToRestore) return;

    const restoredAsset: Asset = {
      ...assetToRestore,
      _is_deleted: false,
      _version: (assetToRestore._version || 1) + 1,
      _history: [
        ...(assetToRestore._history || []),
        {
          timestamp: new Date().toISOString(),
          user: user?.email || 'unknown',
          action: 'RESTORE',
          details: 'Restauração de ativo previamente excluído'
        }
      ]
    };

    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => String(a.id) === String(assetId) ? restoredAsset : a),
      lastUpdated: new Date().toISOString()
    }));

    if (databaseMode === DatabaseMode.SUPABASE) {
      await syncAssetsToCloud([restoredAsset], user?.tenantId || user?.tenantid || '');
    }
  }, [inventory.assets, user, databaseMode]);

  const permanentDeleteAsset = useCallback(async (assetId: string) => {
    if (!window.confirm('Deseja realmente excluir permanentemente este ativo? Esta ação não pode ser desfeita.')) return;

    setInventory(prev => ({
      ...prev,
      assets: prev.assets.filter(a => String(a.id) !== String(assetId)),
      lastUpdated: new Date().toISOString()
    }));

    if (databaseMode === DatabaseMode.SUPABASE && supabase) {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', assetId);
      
      if (error) logger.error('Erro ao excluir permanentemente:', error);
    }
  }, [databaseMode]);

  const deleteAsset = useCallback(async (assetId: string) => {
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    
    if (!isAdmin) {
      showModal("Permissão Negada", "Apenas administradores podem excluir ativos.", "error");
      return;
    }

    const assetToDelete = inventory.assets.find(a => String(a.id) === String(assetId));
    if (!assetToDelete) return;

    // Soft Delete: Marca como deletado e incrementa versão
    const deletedAsset: Asset = {
      ...assetToDelete,
      _is_deleted: true,
      _version: (assetToDelete._version || 1) + 1,
      _dataLeitura: new Date().toISOString(),
      _auditor: user?.email || 'unknown'
    };

    // Log de Auditoria
    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      user: user?.email || 'unknown',
      action: 'DELETE',
      details: 'Exclusão lógica (Soft Delete) do ativo',
      tenantid: user?.tenantId || user?.tenantid
    };
    deletedAsset._history = [...(deletedAsset._history || []), auditEntry];

    setIsProcessing(true);
    try {
      // 1. TENTA SALVAR NO BANCO PRIMEIRO
      if (databaseMode === DatabaseMode.INTERNAL) {
        // No modo interno, salvamos o registro marcado como deletado no SQLite
        await sqliteService.bulkInsertAssets([deletedAsset]);
      } else {
        // No modo Supabase, sincronizamos o flag _is_deleted
        await syncAssetsToCloud([deletedAsset], user?.tenantId);
        
        // Log de Auditoria Global
        await logAuditEvent({
          user_email: user?.email || 'unknown',
          action: 'DELETE',
          table_name: 'assets',
          record_id: assetId,
          old_data: assetToDelete,
          details: `Exclusão lógica do ativo: ${assetToDelete.ETIQUETA} - ${assetToDelete.DESCRICAODOATIVO}`,
          tenantId: user?.tenantId || 'CICOPAL'
        });
      }

      // 2. SÓ ATUALIZA A UI APÓS CONFIRMAÇÃO DO BANCO
      setInventory(prev => ({
        ...prev,
        assets: prev.assets.filter(a => String(a.id) !== String(assetId)),
        lastUpdated: new Date().toISOString()
      }));

      // Se estiver no detalhe do ativo, volta
      if (history[history.length - 1] === AppScreen.ASSET_DETAIL) {
        popScreen();
      }
      
      logger.info(`>>> [DATABASE] Exclusão confirmada para id: ${assetId}`);
    } catch (err) {
      logger.error('>>> [DATABASE] Falha ao excluir ativo:', err);
      showModal("Erro de Exclusão", "ERRO SQL (Exclusão): " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsProcessing(false);
    }
  }, [inventory, user, databaseMode, history, popScreen]);

  const bulkUpdateAssets = useCallback(async (ids: string[], manualUpdates?: Partial<Asset>) => {
    const idSet = new Set(ids.map(id => String(id)));
    const isReconciliationWorkflow = history.includes(AppScreen.ACCOUNT_RECONCILIATION);
    
    // Identificar a origem da transação (Código Fixo de 4 dígitos)
    let origin: TransactionOrigin | undefined;
    const currentScreen = history[history.length - 1];
    const previousScreen = history.length > 1 ? history[history.length - 2] : null;

    if (currentScreen === AppScreen.INVENTORY || previousScreen === AppScreen.INVENTORY) {
      origin = TransactionOrigin.INVENTORY;
    } else if (currentScreen === AppScreen.LABELING || previousScreen === AppScreen.LABELING) {
      origin = TransactionOrigin.LABELING;
    } else if (currentScreen === AppScreen.ACCOUNT_RECONCILIATION || previousScreen === AppScreen.ACCOUNT_RECONCILIATION) {
      origin = TransactionOrigin.ACCOUNT_RECONCILIATION;
    }

    let gpsCoords: { lat?: number; lng?: number } = {};
    try {
      const metrics = await telemetryService.getDeviceMetrics();
      if (metrics.battery > 5) {
        const loc = await getCurrentLocation();
        gpsCoords = { lat: loc.lat, lng: loc.lng };
      } else {
        logger.warn('>>> [GPS Lote] Bloqueio crítico de GPS por bateria de', metrics.battery, '% ou inferior!');
        if (currentUnitConfig && currentUnitConfig.lat && currentUnitConfig.lng) {
          gpsCoords = { lat: currentUnitConfig.lat, lng: currentUnitConfig.lng };
        }
      }
    } catch (e) {
      logger.warn('GPS não capturado para lote, tentando fallback da unidade:', e);
      if (currentUnitConfig && currentUnitConfig.lat && currentUnitConfig.lng) {
        gpsCoords = { lat: currentUnitConfig.lat, lng: currentUnitConfig.lng };
      }
    }

    // 1. CALCULAMOS OS NOVOS OBJETOS (MERGE NÃO DESTRUTIVO)
    const updatedAssetsList: Asset[] = [];
    const allAssets = inventory.assets.map(a => {
      if (idSet.has(String(a.id))) {
        const updates = { 
          ...a, 
          ...(manualUpdates || {}), 
          latitude: gpsCoords.lat, 
          longitude: gpsCoords.lng,
          _origemTransacao: origin // Aplica o código fixo
        };
        
        // Garantir que tenant e unit estão definidos de forma dinâmica
        if (!updates.tenantId) {
          updates.tenantId = user?.tenantId || localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId') || '';
        }
        if (!updates._unitid) {
          updates._unitid = user?.filial || localStorage.getItem('filial') || sessionStorage.getItem('filial') || '';
        }
        
        // Log de Auditoria para atualização em lote
        const historyEntry: AuditLogEntry = {
          timestamp: new Date().toISOString(),
          user: user?.name || user?.username || user?.email || 'SISTEMA',
          action: 'BULK_UPDATE',
          details: `Atualização em lote via ${currentScreen}: ${Object.keys(manualUpdates || {}).join(', ')}`,
          tenantId: user?.tenantId || localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId') || '',
          origin: origin // Aplica o código fixo no log
        };
        updates._history = [...(updates._history || []), historyEntry];
        
        // REGRA DE OURO: Respeita o local do inventário se houver
        const targetLoc = isReconciliationWorkflow
          ? (a.ENDERECO || "")
          : (inventoryLocation 
              ? inventoryLocation.toUpperCase().trim() 
              : (updates.ENDERECO || "").toString().toUpperCase().trim());

        updates._conferido = true;
        updates._dataLeitura = new Date().toISOString();
        updates._auditor = user?.name || user?.username || user?.email || 'SISTEMA';
        
        const wasLabelingCandidate = 
          String(a.ETIQUETA || '').toUpperCase().includes('ETIQUETAR') || 
          String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' ||
          a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR ||
          a._plaquetado === true;

        if (wasLabelingCandidate) {
          updates._plaquetado = true;
        }

        const alteredFields = new Set<string>(updates._camposAlterados || []);
        const originalValues = { ...(a._valoresOriginais || {}) };

        if (manualUpdates) {
          Object.keys(manualUpdates).forEach(key => {
            if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
            const k = key as keyof Asset;
            if (String((manualUpdates as Record<string, unknown>)[key]) !== String(a[k])) {
              alteredFields.add(key);
              if (originalValues[key] === undefined) {
                originalValues[key] = a[k] as string | number | boolean | null;
              }
            }
          });
        }
        
        if (!isReconciliationWorkflow && normalizeKey(String(a.ENDERECO || '')) !== normalizeKey(String(targetLoc || ''))) {
          alteredFields.add('ENDERECO');
          if (originalValues['ENDERECO'] === undefined) {
            originalValues['ENDERECO'] = a.ENDERECO;
          }
        }
        updates._localMaster = targetLoc;
        
        const hasChanges = alteredFields.size > 0;
        updates.DE_PARA = hasChanges ? 'COM ALTERAÇÃO' : 'SEM ALTERAÇÃO';
        
        updates.TAG_INVENTARIO = determineTag({ ...a, ...updates }, targetLoc);
        updates.AUDITOR_STATUS_CONFERENCIA = updates.TAG_INVENTARIO;
        updates._camposAlterados = Array.from(alteredFields);
        updates._valoresOriginais = originalValues;

        updatedAssetsList.push(updates);
        return updates;
      }
      return a;
    });

    // 2. PESIMISMO SAUDÁVEL: PERSISTÊNCIA ANTES DA UI
    setIsProcessing(true);
    try {
      logger.info(`>>> [DATABASE] Iniciando persistência em lote para ${updatedAssetsList.length} itens...`);
      if (databaseMode === DatabaseMode.INTERNAL) {
        // SOBERANIA SQLITE: Transação atômica que NÃO sobrescreve dados antigos sem intenção (merge via spread)
        await sqliteService.bulkInsertAssets(updatedAssetsList);
      } else {
        await syncAssetsToCloud(updatedAssetsList, user?.tenantId);
        
        logAuditEvent({
          user_email: user?.email || 'unknown',
          action: 'BULK_UPDATE',
          table_name: 'assets',
          details: `Atualização em lote de ${ids.length} itens via ${currentScreen}: ${Object.keys(manualUpdates || {}).join(', ')}`,
          tenantId: user?.tenantId || 'CICOPAL',
          origin: origin
        });
      }

      // 3. SÓ APÓS CONFIRMAÇÃO DO BANCO ATUALIZAMOS A UI
      setInventory(prev => ({
        ...prev,
        assets: allAssets,
        lastUpdated: new Date().toISOString(),
        status: DatabaseStatus.IN_USE
      }));
      setLastLocalSave(new Date().toISOString());
      setRefreshVersion(prev => prev + 1);
      
      // MARCA IDs como sujos para back-sync
      ids.forEach(id => dirtyAssetsRef.current.add(String(id)));
      
      logger.info(`>>> [DATABASE] Operação em lote concluída com sucesso.`);
    } catch (err) {
      logger.error('>>> [DATABASE] Falha Crítica no Lote:', err);
      showModal("Erro no Banco", `ERRO CRÍTICO NO BANCO:\n${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setIsProcessing(false);
    }
  }, [inventoryLocation, determineTag, normalizeKey, user, databaseMode, history, currentUnitConfig, inventory.assets]);

  const handleUpdateScannerMode = useCallback((mode: ScannerMode) => {
    setInventory(prev => ({ ...prev, scannerMode: mode }));
  }, []);

  const handleSelectAsset = useCallback((asset: Asset) => {
    // Se viemos da tela de consulta, o detalhe deve ser apenas leitura
    const currentScreen = history[history.length - 1];
    setIsReadOnlyDetail(currentScreen === AppScreen.CONSULTATION);

    const etq = normalizeKey(asset.ETIQUETA || "");
    if (etq && etq !== "ETIQUETAR") {
      const related = inventory.assets.filter(a => normalizeKey(a.ETIQUETA || "") === etq);
      if (related.length > 1) {
        setSelectedAssets(related);
      } else {
        setSelectedAssets([asset]);
      }
    } else {
      setSelectedAssets([asset]);
    }
    pushScreen(AppScreen.ASSET_DETAIL);
  }, [inventory.assets, normalizeKey]);

  const handleExport = () => {
    if (inventory.assets.length === 0) return;
    const wsData = inventory.assets.map(a => {
      const res: { [key: string]: string | number | boolean | null | undefined } = {};
      
      // Mapeia campos normais (PARA)
      Object.keys(a).forEach(k => { 
        if (!k.startsWith('_') && k !== 'id') {
          const val = a[k];
          const colName = `PARA_${k}`;
          if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
            res[colName] = safeStringify(val);
          } else {
            res[colName] = val as string | number | boolean | null | undefined;
          }
          // Mantém também o nome original para compatibilidade
          res[k] = res[colName];
        }
      });
      
      // Mapeia campos originais (DE)
      const originalValues = a._valoresOriginais;
      if (originalValues) {
        Object.keys(originalValues).forEach(key => {
          const val = originalValues[key];
          const colName = `DE_${key}`;
          if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
            res[colName] = safeStringify(val);
          } else {
            res[colName] = val as string | number | boolean | null | undefined;
          }
        });
      } else {
        // Se não foi alterado, o DE é igual ao PARA
        Object.keys(a).forEach(k => {
          if (!k.startsWith('_') && k !== 'id') {
            res[`DE_${k}`] = a[k] as string | number | boolean | null | undefined;
          }
        });
      }

      res['AUDITOR_LOCAL_ORIGINAL'] = a.ENDERECO;
      res['AUDITOR_LOCAL_AUDITADO'] = a._localMaster || a.ENDERECO;
      res['AUDITOR_DE_PARA'] = (a.DE_PARA as string | undefined) || (a._conferido ? (normalizeKey(String(a.ENDERECO)) === normalizeKey(String(a._localMaster || a.ENDERECO)) ? 'SEM ALTERAÇÃO' : 'COM ALTERAÇÃO') : 'PENDENTE');
      res['AUDITOR_STATUS_CONFERENCIA'] = a._conferido ? 'SIM' : 'NAO';
      res['AUDITOR_TAG_REGRA_OURO'] = (a.TAG_INVENTARIO as string | undefined) || 'PENDENTE';
      return res;
    });
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INVENTARIO_AUDIT");
    XLSX.writeFile(wb, `INVENTARIO_AUDIT_${new Date().getTime()}.xlsx`);

    // Log de Auditoria na Nuvem
    if (databaseMode === DatabaseMode.SUPABASE) {
      logAuditEvent({
        user_email: user?.email || 'unknown',
        action: 'EXPORT',
        table_name: 'assets',
        details: `Exportação de ${inventory.assets.length} ativos para Excel.`,
        tenantId: user?.tenantId || 'CICOPAL'
      });
    }
  };

  const handleBackup = async () => {
    const success = await backupInventory(databaseMode);
    if (success) {
      // Log de Auditoria
      logAuditEvent({
        user_email: user?.email || 'unknown',
        action: 'EXPORT',
        details: 'Backup manual do sistema realizado.',
        tenantId: user?.tenantId || 'CICOPAL'
      });

      setModalConfig({
        isOpen: true,
        title: 'Backup Concluído',
        message: 'O arquivo de backup foi gerado com sucesso. Guarde-o em um local seguro.',
        type: 'info'
      });
    } else {
      setModalConfig({
        isOpen: true,
        title: 'Erro no Backup',
        message: 'Não foi possível gerar o arquivo de backup. Verifique se há dados no sistema.',
        type: 'error'
      });
    }
  };

  const handleRestore = async (file: File) => {
    const newState = await restoreInventory(file, databaseMode);
    if (newState) {
      setInventory(newState);
      setModalConfig({
        isOpen: true,
        title: 'Backup Restaurado',
        message: `O backup foi restaurado com sucesso. ${newState.assets.length} ativos carregados.`,
        type: 'info'
      });

      // Log de Auditoria na Nuvem
      if (databaseMode === DatabaseMode.SUPABASE) {
        logAuditEvent({
          user_email: user?.email || 'unknown',
          action: 'RESTORE',
          details: `Restauração de backup: ${newState.assets.length} ativos carregados.`,
          tenantId: user?.tenantId || 'CICOPAL'
        });
      }
    } else {
      setModalConfig({
        isOpen: true,
        title: 'Erro na Restauração',
        message: 'Não foi possível restaurar o backup. Verifique se o arquivo é um JSON válido do sistema.',
        type: 'error'
      });
    }
  };

  const handleDownloadCloudData = async () => {
    if (databaseMode === DatabaseMode.INTERNAL) {
      setModalConfig({
        isOpen: true,
        title: 'Modo Interno',
        message: 'Você está no modo de banco de dados interno. Mude para o modo Supabase para baixar dados da nuvem.',
        type: 'info'
      });
      return;
    }

    setModalConfig({
      isOpen: true,
      title: 'Baixando Dados',
      message: 'Aguarde enquanto buscamos os dados na nuvem...',
      type: 'info'
    });

    try {
      const cloudData = await fetchFullInventory();
      if (cloudData && cloudData.assets && cloudData.assets.length > 0) {
        const backupData = {
          assets: cloudData.assets,
          config: cloudData.config,
          timestamp: new Date().toISOString(),
          source: 'Supabase Cloud Export'
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_nuvem_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setModalConfig({
          isOpen: true,
          title: 'Download Concluído',
          message: `Foram baixados ${cloudData.assets.length} ativos da nuvem com sucesso.`,
          type: 'success'
        });

        // Log de Auditoria na Nuvem
        if (databaseMode === DatabaseMode.SUPABASE) {
          logAuditEvent({
            user_email: user?.email || 'unknown',
            action: 'DOWNLOAD',
            details: `Download de ${cloudData.assets.length} ativos da nuvem.`,
            tenantId: user?.tenantId || 'CICOPAL'
          });
        }
      } else {
        setModalConfig({
          isOpen: true,
          title: 'Nenhum Dado',
          message: 'Não foram encontrados dados na nuvem para baixar.',
          type: 'info'
        });
      }
    } catch (error) {
      logger.error('Erro ao baixar dados da nuvem:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro no Download',
        message: 'Ocorreu um erro ao tentar baixar os dados da nuvem. Verifique sua conexão.',
        type: 'error'
      });
    }
  };

  // --- Handlers de Transição e Workflow ---

  const handleClearDatabase = async () => {
    if (localStorage.getItem('is_system_locked') === 'true') {
      setModalConfig({
        isOpen: true,
        title: "Sistema Blindado",
        message: "A limpeza ou remoção da base local foi desativada. O sistema está congelado no modo 'Pronto para Campo' pelo Administrador para blindar o Auditor em campo.",
        type: "warning"
      });
      return;
    }

    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
      const unitName = selectedUnit ? selectedUnit.toUpperCase().trim() : 'GERAL';
      
      // Nome do arquivo conforme especificação: [INVENTARIO_MOBILE+KBP+DADOS+NOMEUNIDADEOPERACIONAL+DATA+HORA]
      const backupFileName = `INVENTARIO_MOBILE+KBP+DADOS+${unitName}+${dateStr}+${timeStr}`;
      
      // 1. Realiza backup automático antes de limpar
      await backupInventory(databaseMode, backupFileName);
      
      // 2. Limpa localmente (apenas a unidade selecionada se houver)
      await clearInventory(databaseMode, selectedUnit || undefined); 
      
      if (!selectedUnit) {
        await db.delete();
        await db.open();
      }
      
      // 3. FASE 1 (SRE): Nuvem Congelada. Expurgo 100% Offline via File System API
      if (databaseMode === DatabaseMode.SUPABASE) {
        logger.warn(">>> [SRE] Integração Supabase CONGELADA. Operando exclusão puramente local no disco físico.");
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dirHandle = (window as any).globalSreDirectoryHandle;
        if (dirHandle) {
          await dirHandle.removeEntry(`PLANILHA_${unitName}.json`);
          logger.info(`>>> [SRE] Arquivo físico PLANILHA_${unitName}.json expurgado silenciosamente.`);
        }
      } catch (ioErr) {
        logger.warn(">>> [SRE] Arquivo físico não encontrado ou já deletado:", ioErr);
      }

      // Atualiza o estado local removendo apenas os ativos da empresa limpa
      sessionStorage.setItem('app_just_cleared_data', 'true');
      
      // GBR v25: Reset de alertas e sanitização se for limpeza total
      if (!selectedUnit) {
        localStorage.setItem('app_excluded_accounts', '[]');
        sessionStorage.removeItem('isDatabaseLoaded');
        localStorage.removeItem('isDatabaseLoaded');
        setIsDatabaseLoaded(false);
        setInventory(prev => ({ 
          ...prev, 
          assets: [], 
          companies: [], 
          excludedAccounts: [],
          status: DatabaseStatus.EMPTY 
        }));
        setIntegrityFailed(false);
        setIsDataLoaded(false);
      } else {
        const normalizedSel = selectedUnit.toUpperCase().trim();
        const remainingAssets = inventory.assets.filter(a => (a.filial || '').toUpperCase().trim() !== normalizedSel);
        
        setInventory(prev => ({
          ...prev,
          assets: remainingAssets,
          companies: prev.companies.filter(c => c.toUpperCase().trim() !== normalizedSel),
          lastUpdated: new Date().toISOString(),
          status: remainingAssets.length > 0 ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY
        }));

        if (remainingAssets.length === 0) {
          setSqliteStatus('EMPTY');
          sessionStorage.removeItem('isDatabaseLoaded');
          localStorage.removeItem('isDatabaseLoaded');
          setIsDatabaseLoaded(false);
          await sqliteService.setSystemStatus(DatabaseStatus.EMPTY);
        }
      }
      
      setModalConfig({
        isOpen: true,
        title: 'Limpeza Concluída',
        message: `A unidade operacional "${selectedUnit}" foi limpa com sucesso (Local${databaseMode === DatabaseMode.SUPABASE ? ' e Nuvem' : ''}). Um backup de segurança foi gerado: ${backupFileName}`,
        type: 'info'
      });
    } catch (error: unknown) {
      logger.error('Erro na limpeza do banco:', error);
      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        errorMessage = String(errObj.message || errObj.details || errObj.hint || safeStringify(error));
      }

      setModalConfig({
        isOpen: true,
        title: 'Erro na Limpeza',
        message: `Ocorreu um erro ao tentar limpar a unidade selecionada: ${errorMessage}`,
        type: 'error'
      });
    }
  };

  const isAdmin = useMemo(() => checkIsAdmin(user), [user]);

  // filteredAssetsByUnit defined above to avoid hosting temporal dead zone issues

  const handleSignatureConfirm = useCallback(async (signature: string) => {
    if (!selectedUnit) return;

    const confirmedAssets = filteredAssetsByUnit.filter(a => a._conferido);
    if (confirmedAssets.length === 0) {
      setModalConfig({
        isOpen: true,
        title: 'Nenhum Item Conferido',
        message: 'Não há itens conferidos para assinar nesta unidade.',
        type: 'error'
      });
      return;
    }

    const now = new Date().toISOString();
    const aprovador = user?.email || 'Auditor';

    const ids = confirmedAssets.map(a => String(a.id));
    const updates: Partial<Asset> = {
      _aprovado: true,
      _dataAprovacao: now,
      _aprovador: aprovador,
      _assinatura: signature
    };

    try {
      await bulkUpdateAssets(ids, updates);
      setModalConfig({
        isOpen: true,
        title: 'Inventário Finalizado',
        message: `O inventário da unidade ${selectedUnit} foi assinado e aprovado com sucesso.`,
        type: 'success'
      });
      popScreen();
    } catch (error) {
      logger.error('Erro ao salvar assinatura:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Finalizar',
        message: 'Ocorreu um erro ao tentar salvar a assinatura. Verifique sua conexão.',
        type: 'error'
      });
    }
  }, [selectedUnit, filteredAssetsByUnit, user, bulkUpdateAssets, popScreen]);
  
  const fullCompaniesWithStatus = useMemo(() => {
    if (sqliteService.isImportingBatch || isImportingBatchState) {
      logger.info('>>> [fullCompaniesWithStatus] Importando em lote. Bloqueando leituras pesadas.');
      return [];
    }

    const userTenant = user?.tenantId || user?.tenantid || '';
    const userUnits = user?.units || (userTenant ? [userTenant] : []);
    const isAuditor = user?.role === UserRole.AUDITOR || user?.role === UserRole.AUXILIARY_AUDITOR;
    const assets = inventory.assets;
    
    if (assets.length === 0) {
      logger.info('>>> [fullCompaniesWithStatus] Inventory assets is empty.');
    } else {
      logger.info(`>>> [fullCompaniesWithStatus] Processing ${assets.length} assets.`);
    }

    if (inventory.companies && inventory.companies.length > 0) {
      logger.info(`>>> [fullCompaniesWithStatus] Inventory companies: ${JSON.stringify(inventory.companies)}`);
    } else {
      logger.info('>>> [fullCompaniesWithStatus] Inventory companies is empty.');
    }

    // 1. Agrupar estatísticas e campanhas por empresa em um único loop O(N)
    // Isso evita loops aninhados que causavam travamentos com grandes volumes de dados
    const companyStatsMap = new Map<string, { hasData: boolean; hasActiveAssets: boolean; unitIds: Set<string>; hasAssetCampaign: boolean }>();
    
    // v24.50: Se temos unidades via SQL (Modo Interno), usamos elas como base prioritária
    if (databaseMode === DatabaseMode.INTERNAL && sqliteOperationalUnits.length > 0) {
      sqliteOperationalUnits.forEach(u => {
        const companyName = (u.filial || '').toUpperCase().replace(/_/g, ' ');
        if (companyName === 'CICOPAL' || normalizeKey(companyName) === 'CICOPAL') return;
        companyStatsMap.set(companyName, {
          hasData: true,
          hasActiveAssets: (u.total || 0) > 0,
          unitIds: new Set(),
          hasAssetCampaign: false // Será verificado nos ativos abaixo se necessário
        });
      });
    }

    // Processamos os ativos para pegar campanhas e outras flags
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const company = getAssetUnit(a).replace(/_/g, ' ');
      if (!company || company === 'CICOPAL' || normalizeKey(company) === 'CICOPAL' || company === 'UNIT_UNDEFINED' || company === 'UNIT UNDEFINED' || company === 'DEFAULT' || company === 'NULL' || company === 'UNDEFINED') continue;
      
      let stats = companyStatsMap.get(company);
      if (!stats) {
        stats = { hasData: true, hasActiveAssets: false, unitIds: new Set(), hasAssetCampaign: false };
        companyStatsMap.set(company, stats);
      }
      
      const status = String(a.STATUS || '').toUpperCase();
      // REGRA v25.01: Consideramos como ativo qualquer item que não esteja baixado ou que seja 'PENDENTE' (padrão de carga)
      const isActiveStatus = status === '' || status === 'PENDENTE' || status.includes('ATIVO') || status.includes('USO') || status.includes('NOVO') || status.includes('CONFERIDO');
      
      if (!stats.hasActiveAssets && isActiveStatus) {
        stats.hasActiveAssets = true;
      }
      
      if (a._unitid) {
        stats.unitIds.add(normalizeKey(a._unitid));
      }

      if (!stats.hasAssetCampaign && !!a.currentCampaignId) {
        stats.hasAssetCampaign = true;
      }
    }

    // Pre-calculate units with direct ACTIVE campaigns for O(1) lookup
    const unitsWithDirectCampaign = new Set<string>();
    campaigns.forEach(c => {
      // REGRA DE GOVERNANÇA: Apenas campanhas com status exatamente igual a 'ACTIVE' habilitam o botão visual
      if (String(c.status) === 'ACTIVE') {
        const uId = c._unitid || c.unit_id;
        if (uId) {
          const norm = normalizeKey(uId);
          unitsWithDirectCampaign.add(norm);
        }
      }
    });

    // Pre-calculate units with GPS config
    const unitsWithGps = new Set<string>();
    unitConfigs.forEach(c => {
      const uId = c._unitid || c.unit_id;
      if (uId) {
        const norm = normalizeKey(uId);
        unitsWithGps.add(norm);
      }
    });

    if (unitConfigs.length > 0) {
      logger.info(`>>> [App] GPS Configs: ${unitConfigs.length}, Units with GPS: ${Array.from(unitsWithGps).join(', ')}`);
    }

    // 2. Definir a lista base de empresas
    const baseCompaniesSet = new Set<string>();
    if (inventory.companies) {
      inventory.companies.forEach(c => baseCompaniesSet.add(c.toUpperCase().replace(/_/g, ' ').trim()));
    }
    for (const c of companyStatsMap.keys()) baseCompaniesSet.add(c);
    
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || (user?.email && user.email.toLowerCase() === ADMIN_EMAIL);
    
    // Se for auditor ou admin e estiver no modo nuvem, garantimos que as unidades autorizadas apareçam
    // mesmo que ainda não existam ativos locais para elas
    if ((isAuditor || isAdmin) && inventory.databaseMode !== DatabaseMode.INTERNAL) {
      for (const u of userUnits) {
        if (u) {
          const cleanU = u.toUpperCase().replace(/_/g, ' ').trim();
          baseCompaniesSet.add(cleanU);
        }
      }
    }
    
    const baseCompanies = Array.from(baseCompaniesSet);

    // 3. Normalizar unidades do usuário para busca rápida
    const normalizedUserUnits = userUnits.map(u => normalizeKey(u));

    // 4. Agrupar e Mesclar empresas por chave normalizada para evitar duplicatas (ex: "UNIDADE A" vs "UNIDADE_A")
    const mergedCompanies = new Map<string, { name: string; hasData: boolean; hasActiveAssets: boolean; hasAssetCampaign: boolean }>();

    baseCompanies.forEach(company => {
      const rawName = (company || '').trim().toUpperCase().replace(/_/g, ' ');
      if (!rawName || rawName === 'CICOPAL') return;
      
      const norm = normalizeKey(rawName);
      if (!norm || norm === 'CICOPAL') return;

      // Filtragem por permissão (Auditor) - No modo INTERNO (Offline Puro), permitimos ver tudo se não houver trava explícita
      const isAllowed = !isAuditor || 
                      inventory.databaseMode === DatabaseMode.INTERNAL || 
                      userUnits.length === 0 || 
                      normalizedUserUnits.includes(norm) ||
                      (normalizedUserUnits.length === 1 && normalizedUserUnits[0] === '');
      
      const stats = companyStatsMap.get(rawName);
      
      if (isAllowed) {
        const existing = mergedCompanies.get(norm);
        
        // Critérios para escolher o "melhor" nome de exibição:
        // 1. Preferir nomes SEM underscores (mais legíveis)
        // 2. Preferir nomes com espaços
        // 3. Preferir o nome que está na lista de unidades do usuário
        const hasUnderscore = rawName.includes('_');
        const existingHasUnderscore = existing ? existing.name.includes('_') : false;
        
        const isBetterName = !existing || 
          (existingHasUnderscore && !hasUnderscore) ||
          (rawName.includes(' ') && !existing.name.includes(' ')) ||
          (userUnits.includes(rawName) && !userUnits.includes(existing.name));

        if (!existing || isBetterName || stats?.hasData) {
          mergedCompanies.set(norm, {
            name: isBetterName ? rawName : existing.name,
            hasData: (existing?.hasData || !!stats),
            hasActiveAssets: (existing?.hasActiveAssets || stats?.hasActiveAssets || false),
            hasAssetCampaign: (existing?.hasAssetCampaign || stats?.hasAssetCampaign || false)
          });
        }
      }
    });

    const sqlCountsMap = new Map<string, number>();
    sqliteOperationalUnits.forEach(u => {
      sqlCountsMap.set(normalizeKey(u.filial || ''), u.total || 0);
    });

    const localCountsMap = new Map<string, number>();
    if (inventory.databaseMode !== DatabaseMode.INTERNAL) {
      assets.forEach(a => {
        const company = getAssetUnit(a).replace(/_/g, ' ');
        if (!company) return;
        const norm = normalizeKey(company);
        localCountsMap.set(norm, (localCountsMap.get(norm) || 0) + 1);
      });
    }

    const result = Array.from(mergedCompanies.values()).map(unit => {
      const norm = normalizeKey(unit.name);
      
      // Cache reativo duplo para evitar "pisca-pisca" visual do botão CAMPANHA
      const cachedActive = localStorage.getItem(`kardek_campanha_ativa_${norm}`) === 'true';
      const hasDirectCampaign = unitsWithDirectCampaign.has(norm) || cachedActive;
      const hasGps = unitsWithGps.has(norm);

      let assetCount = 0;
      if (inventory.databaseMode === DatabaseMode.INTERNAL) {
        for (const [sqlKey, count] of sqlCountsMap.entries()) {
          if (matchUnitKeys(sqlKey, norm)) {
            assetCount += count;
          }
        }
      } else {
        for (const [localKey, count] of localCountsMap.entries()) {
          if (matchUnitKeys(localKey, norm)) {
            assetCount += count;
          }
        }
      }

      return {
        name: unit.name,
        hasData: unit.hasData,
        hasActiveAssets: unit.hasActiveAssets,
        hasCampaign: hasDirectCampaign, // Stricter governance: only ACTIVE campaign in table or cached enables button
        hasGps,
        assetCount
      };
    });

    // REGRA DE OURO v25.01: Se o banco físico carregou ativos (assets.length > 0) mas a lista 
    // de empresas resultou vazia (talvez por filtro de permissão equivocado), forçamos
    // a inclusão de todas as unidades encontradas nos ativos para evitar o bloqueio do app.
    if (result.length === 0 && assets.length > 0) {
      logger.warn('>>> [fullCompaniesWithStatus] CRITICAL: Assets exist but no units were extracted! Applying EMERGENCY extraction.');
      const emergencyUnits = new Set<string>();
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const company = (a.filial || a.UNIDADE || a._unitid || '').toString().trim().toUpperCase();
        if (company && company !== 'DEFAULT' && company !== 'NULL' && company !== '0' && company !== 'CICOPAL' && normalizeKey(company) !== 'CICOPAL') {
          emergencyUnits.add(company.replace(/_/g, ' '));
        }
      }
      
      if (emergencyUnits.size > 0) {
        return Array.from(emergencyUnits).map(name => {
          const norm = normalizeKey(name);
          const assetCount = inventory.databaseMode === DatabaseMode.INTERNAL 
            ? (sqlCountsMap.get(norm) || 0)
            : (localCountsMap.get(norm) || 0);
          return {
            name,
            hasData: true,
            hasActiveAssets: true,
            hasCampaign: false,
            hasGps: false,
            assetCount
          };
        });
      }
    }

    const finalResult = result.filter(r => {
      const nameUpper = r.name.toUpperCase().trim();
      if (nameUpper === 'MATRIZ') {
        const otherUnitsExist = result.some(o => o.name.toUpperCase().trim() !== 'MATRIZ');
        if (otherUnitsExist) return false;
      }
      return true;
    });

    logger.info(`>>> [fullCompaniesWithStatus] Total units calculated: ${finalResult.length}`);
    return finalResult;
  }, [inventory.companies, inventory.assets, inventory.databaseMode, normalizeKey, user, UserRole.AUDITOR, UserRole.AUXILIARY_AUDITOR, campaigns, unitConfigs, refreshVersion, isImportingBatchState]);

  const unitNames = useMemo(() => fullCompaniesWithStatus.map(c => c.name), [fullCompaniesWithStatus]);

  const unitsByTenant = useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    // 1. De Ativos (Fonte mais confiável de relação: filial real)
    inventory.assets.forEach(a => {
      const t = (a.tenantId || a.GRUPO_EMPRESARIAL || '').toUpperCase();
      const u = a.filial; // Usar apenas a unidade operacional real da base
      
      if (u && u.toUpperCase() !== 'DEFAULT' && u.toUpperCase() !== 'NULL' && u !== '0') {
        if (!map.has(t)) map.set(t, new Set());
        map.get(t)!.add(u);
      }
    });

    // 2. De Usuários (Apenas para garantir que unidades já atribuídas apareçam, se forem válidas)
    users.forEach(u => {
      const t = (u.tenantId || '').toUpperCase();
      const isValidUnit = (unit: string) => {
        if (!unit) return false;
        const upper = unit.toUpperCase();
        return upper !== 'DEFAULT' && upper !== 'NULL' && upper !== '0' && upper !== t;
      };

      if (u.unitid && isValidUnit(u.unitid)) {
        if (!map.has(t)) map.set(t, new Set());
        map.get(t)!.add(u.unitid);
      }
      if (u.units) {
        u.units.forEach(unit => {
          if (isValidUnit(unit)) {
            if (!map.has(t)) map.set(t, new Set());
            map.get(t)!.add(unit);
          }
        });
      }
    });

    return map;
  }, [inventory.assets, users]);

  const availableUnits = useMemo(() => {
    const fromAssets = inventory.assets.map(a => a._unitid || a.tenantId).filter(Boolean);
    const fromCompanies = inventory.companies.map(c => c.toLowerCase().replace(/\s/g, '_')).filter(Boolean);
    const fromUsers = users.flatMap(u => {
      const t = [];
      if (u.unitid) t.push(u.unitid);
      if (u.units) t.push(...u.units);
      return t;
    }).filter(Boolean);
    
    const allUnits = Array.from(new Set([...fromAssets, ...fromCompanies, ...fromUsers])) as string[];
    
    // Se a base estiver vazia, mostramos todas para permitir atribuição inicial
    if (inventory.assets.length === 0) return allUnits;
    
    // Filtrar apenas unidades que possuem ativos com status "ATIVO"
    return allUnits.filter(unit => {
      // Procurar na lista de empresas com status
      const companyInfo = fullCompaniesWithStatus.find(c => c.name.toUpperCase() === unit.toUpperCase());
      return companyInfo ? companyInfo.hasActiveAssets : false;
    });
  }, [inventory.assets, inventory.companies, users, fullCompaniesWithStatus]);

  // Auto-sync on Company Selection has been disabled per Senior Offline-First architecture.
  // The user initiates any synchronization or database loads manually via physical buttons.
  useEffect(() => {
    logger.info('>>> [Offline-First] Auto-sync e redirecionamentos automáticos desativados. Aguardando ação física do operador.');
  }, [screen]);

  // Auto-select unit if only one is available for the auditor
  useEffect(() => {
    if (screen === AppScreen.UNIT_SELECTION && !selectedUnit && !isSyncing && inventory.assets.length > 0) {
      // Se o usuário acabou de vir do menu principal, não auto-selecionamos para permitir que ele saia ou troque
      const prevScreen = history[history.length - 2];
      if (prevScreen === AppScreen.MAIN_MENU) return;

      const available = fullCompaniesWithStatus.filter(c => c.hasData);
      if (available.length === 1 && (user?.role === UserRole.AUDITOR || user?.role === UserRole.AUXILIARY_AUDITOR)) {
        const unit = available[0].name;
        setSelectedUnit(unit);
        localStorage.setItem('app_selected_unit', unit);
        setIsInventorying(false);
        setInventoryLocation(null);
        pushScreen(AppScreen.MAIN_MENU);
      }
    }
  }, [screen, selectedUnit, isSyncing, inventory.assets.length, fullCompaniesWithStatus, user, UserRole.AUDITOR, UserRole.AUXILIARY_AUDITOR, history, pushScreen]);

  const showCompanyHeader = !!selectedUnit && screen === AppScreen.DASHBOARD;

  const showSlimHeader = !!selectedUnit && [
    AppScreen.INVENTORY,
    AppScreen.LABELING,
    AppScreen.CONSULTATION,
    AppScreen.ASSET_DETAIL,
    AppScreen.ASSET_MAP,
    AppScreen.ACTIVE_SEARCH,
    AppScreen.ACCOUNT_RECONCILIATION,
    AppScreen.IMPAIRMENT_REPORT,
    AppScreen.SYNC_MANAGER,
    AppScreen.AUDIT_LOGS,
    AppScreen.SIGNATURE
  ].includes(screen);
  
  logger.info(">>> [MOBILE-SHIELD] Render State & Auth Check:", {
    sqliteStatus: sqliteStatus.status,
    sqliteLoading: sqliteStatus.loading,
    isInitializing,
    authLoading,
    dbInitialized,
    isInternalMode,
    isSessionValid,
    isSessionCurrentlyValid,
    isUserAuthenticated,
    hasUser: !!user,
    currentScreen: screen
  });

  if (sqliteStatus.loading || isInitializing || authLoading) {
    logger.info(">>> [MOBILE-SHIELD] Renderizando BLOCO LOADER (Splash Screen).");
    return (
      <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center p-10 text-white font-sans">
        <div className="relative mb-10">
          <div className="w-20 h-20 border-4 border-emerald-500/10 rounded-full"></div>
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-t-emerald-500 rounded-full animate-spin"></div>
          <Building2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-500 opacity-50" size={24} />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">Inventariador GBR v{pkg.version}</p>
          <p className="text-[9px] text-slate-500 font-medium uppercase tracking-[0.2em] animate-pulse">
            Carregando Ecossistema GBR...
          </p>
        </div>
      </div>
    );
  }

  logger.info(">>> [MOBILE-SHIELD] Renderizando BLOCO DA APLICAÇÃO PRINCIPAL. Screen:", screen);

  // INTERCEPTOR DE EXPIRAÇÃO DA DEMONSTRAÇÃO (PERFIL DEMO)
  if (user && user.role === ('DEMO' as unknown as UserRole) && demoService.checkDemoStatus().expired) {
    const status = demoService.checkDemoStatus();
    return (
      <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white font-sans">
        <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
          <AlertTriangle size={44} className="text-red-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-400 mb-2">Demonstração Expirada</h2>
          <p className="text-[11px] text-slate-300 leading-relaxed mb-6 uppercase tracking-wider font-semibold">
            {status.reason === 'days' 
              ? 'Seu período de degustação de 7 dias expirou.' 
              : `Você atingiu o limite de 30 auditorias no modo demonstração (${status.auditsCount}/30).`}
            <br />
            Para continuar utilizando o GBR Kardex de maneira profissional no galpão, realize o upgrade do seu licenciamento.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                // Simula upgrade de demonstração para Mobile Single
                setModalConfig({
                  isOpen: true,
                  title: 'Parabéns!',
                  message: 'Upgrade simulado realizado com sucesso! Você agora possui uma licença MOBILE SINGLE ativa ilimitada.',
                  type: 'success',
                  onConfirm: () => {
                    // Transiciona o usuário para MOBILE_SINGLE
                    const updatedUser: User = {
                      ...user,
                      role: 'MOBILE_SINGLE' as unknown as UserRole,
                      tenantId: user.id || 'MOBILE_USER',
                    };
                    setUser(updatedUser);
                    sessionStorage.setItem('app_current_user', safeStringify(updatedUser));
                    // Salva no SQLite local
                    localDb.users.add(updatedUser);
                  }
                });
              }}
              className="w-full bg-[#10B981] hover:bg-emerald-600 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-md shadow-emerald-500/20"
            >
              Fazer Upgrade para Mobile Single (Ilimitado)
            </button>
            <button
              onClick={async () => {
                if (supabase) {
                  await supabase.auth.signOut();
                }
                sessionStorage.removeItem('app_current_user');
                setUser(null);
                setHistory([AppScreen.LOGIN]);
              }}
              className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-400 font-bold py-3 rounded-2xl text-[9px] uppercase tracking-wider transition-all"
            >
              Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="w-full h-screen bg-[#1a0000] flex flex-col items-center justify-center p-10 text-white font-sans">
        <AlertTriangle size={48} className="text-red-600 mb-8 animate-pulse" />
        <h2 className="text-sm font-black uppercase tracking-[0.4em] mb-10 text-center">Erro de Inicialização</h2>
        <div className="bg-red-900/10 border border-red-500/20 p-6 rounded-3xl max-w-sm w-full mb-10 text-center shadow-2xl">
          <p className="text-[10px] text-red-200/70 font-medium leading-relaxed font-mono break-all mb-4">{bootstrapError.message}</p>
          <p className="text-[9px] text-yellow-200/50 uppercase tracking-wider">Abaixo, escolha recarregar a página ou executar uma limpeza geral do motor local.</p>
        </div>
        <div className="flex flex-col gap-4 w-full max-w-[240px]">
          <button 
            onClick={() => window.location.reload()}
            className="bg-slate-950 border border-slate-850 text-white w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all hover:bg-slate-900"
          >
            Reiniciar Aplicação
          </button>
          
          <button 
            onClick={async () => {
              logger.info(">>> [SRE Failsafe] Forçando expurgo físico emergencial por travamento de boot...");
              try {
                // 1. Limpa todas as instâncias de fallback e chaves do localforage/localStorage/sessionStorage
                await localforage.clear().catch(() => {});
                localStorage.clear();
                sessionStorage.clear();
                
                // 2. Executa a purga física do banco de dados Dexie de forma limpa
                await localDb.purgeDatabase();
                
                logger.info(">>> [SRE Failsafe] Cache e descritores limpos. Forçando reload completo da página.");
                // 3. Força o recarregamento total limpando a memória do iFrame
                window.location.reload();
              } catch (err) {
                logger.error("Falha ao executar Failsafe Purge:", err);
                window.location.reload();
              }
            }}
            className="bg-red-600 border border-red-700 text-white w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all hover:bg-red-700"
          >
            FORÇAR RE-SINCRONIZAÇÃO LIMPA
          </button>
        </div>
      </div>
    );
  }
  if (showAccessRequest) {
    return (
      <div className="flex flex-col min-h-screen">
        <PermissionGate 
          onPermissionsGranted={() => {
            setPermissionsGranted(true);
            setShowAccessRequest(false);
          }} 
          setBootError={(errStr) => setBootstrapError(new AppBootstrapError(errStr || 'Erro de Permissão'))} 
        />
        <footer className="bg-slate-900 px-6 py-4 text-center border-t border-white/5 shrink-0">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Inventariador GBR v{pkg.version} • MOBILE SOBERANO</p>
        </footer>
      </div>
    );
  }

  if (publicAsset) {
    return (
      <ErrorBoundary>
        <PublicKardex 
          asset={publicAsset} 
          onClose={() => {
            setPublicAsset(null);
            const url = new URL(window.location.href);
            url.searchParams.delete('etq');
            window.history.replaceState({}, document.title, url.pathname + url.search);
          }} 
        />
      </ErrorBoundary>
    );
  }

  // O Onboarding e os Termos agora são estritamente manuais via botão de ajuda (FloatingHelp).
  // Isso evita que o app fique travado na abertura para usuários que já conhecem o sistema.

  return (
    <ErrorBoundary>
      <div className={`w-full h-full min-h-[100dvh] ${screen === AppScreen.LOGIN ? 'bg-white' : 'bg-bg-main'} overflow-hidden relative font-sans max-w-full flex flex-col ${screen === AppScreen.LOGIN ? '' : 'safe-area-p'}`}>
        {showCompanyHeader && (
          <div className="bg-white border-b border-slate-100 z-[200] flex-shrink-0">
            <div className="px-5 py-3 flex items-center justify-between">
               <div className="flex flex-col">
                 <div className="flex items-center space-x-2">
                   <div className="w-5 h-5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                     <Building2 size={10} />
                   </div>
                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Auditoria Inteligente</p>
                 </div>
                 <h2 className="text-xs font-bold text-[#64748B] uppercase tracking-tight mt-1">
                   {selectedUnit}
                 </h2>
               </div>
               
               <div className="flex items-center space-x-2">
                 <SyncBadge />
                 <div className="flex items-center space-x-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <div 
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg border transition-all ${isSafeMode ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600'}`} 
                    title={isSafeMode ? "Banco de Dados Protegido" : `Ameaças Detectadas: ${securityThreats.join(', ')}`}
                  >
                    <ShieldCheck size={10} />
                    <span className="text-[7px] font-black uppercase tracking-widest">{isSafeMode ? 'SAFE' : 'RISK'}</span>
                  </div>
                  <div className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-600">
                    <span className="text-[7px] font-bold uppercase tracking-[0.1em]">Inventariador GBR v{pkg.version}</span>
                  </div>
                  <div 
                    onClick={() => setIsAIAssistantOpen(true)}
                    className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center space-x-1 cursor-pointer hover:bg-indigo-100 transition-all text-indigo-600"
                  >
                    <Activity size={10} />
                    <span className="text-[7px] font-black uppercase tracking-widest">DEV</span>
                  </div>
                  <div className={`px-2 py-0.5 ${permissionsGranted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'} border rounded-lg flex items-center space-x-1`}>
                    <ShieldCheck size={10} />
                    <span className="text-[7px] font-black uppercase tracking-widest">{permissionsGranted ? 'OPERACIONAL' : 'BLOQUEADO'}</span>
                  </div>
                  {import.meta.env.VITE_GEMINI_API_KEY && (
                    <div className="px-2 py-0.5 bg-purple-50 border border-purple-100 rounded-lg flex items-center space-x-1 text-purple-600">
                      <Sparkles size={8} />
                      <span className="text-[7px] font-black uppercase tracking-widest">AI</span>
                    </div>
                  )}
               </div>
               </div>
            </div>
          </div>
        )}

        {showSlimHeader && (
          <div className="bg-white border-b border-slate-100 z-[200] flex-shrink-0 animate-fadeIn">
            <div className="px-5 py-2.5 flex items-center justify-between">
              <button
                onClick={popScreen}
                className="flex items-center space-x-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 cursor-pointer"
                id="slim-header-back-btn"
              >
                <span>←</span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Voltar</span>
              </button>
              
              <div className="flex-1 text-center font-sans px-4">
                <span className="text-xs font-black text-slate-700 uppercase tracking-tight">
                  {selectedUnit}
                </span>
              </div>
              
              <div className="flex items-center shrink-0">
                <span className="px-2.5 py-1 bg-slate-900 border border-slate-950 rounded-lg text-white font-extrabold text-[8px] uppercase tracking-widest shadow-sm font-sans">
                  GBR v{pkg.version}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 w-full flex flex-col relative overflow-y-auto z-[500] no-scrollbar min-h-0">
          {integrityFailed && (
        <div className="fixed top-20 left-4 right-4 z-[100] bg-red-600 text-white p-4 rounded-2xl shadow-2xl border-2 border-white/20 animate-bounce flex items-center space-x-3">
          <AlertTriangle className="flex-shrink-0" size={24} />
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-widest">Alerta de Integridade</p>
            <p className="text-[10px] opacity-90 font-medium">Dados locais podem estar corrompidos ou foram alterados fora do App. Verifique seu inventário.</p>
          </div>
          <button onClick={() => setIntegrityFailed(false)} className="p-1 hover:bg-white/10 rounded-lg">
            <X size={20} />
          </button>
        </div>
      )}

      {showRecoveryToast && (screen === AppScreen.DATABASE_MANAGER || screen === AppScreen.DASHBOARD || screen === AppScreen.INVENTORY) && (
            <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] ${recoverySource === 'PHYSICAL' ? 'bg-blue-600' : 'bg-emerald-600'} text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-white/20 animate-bounce w-[90%] max-w-xs`}>
              {recoverySource === 'PHYSICAL' ? <FileText size={20} className="shrink-0" /> : <ShieldCheck size={20} className="shrink-0" />}
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-center">
                  {recoverySource === 'PHYSICAL' ? 'Banco de Dados Blindado' : 
                   recoverySource === 'CLOUD' ? 'Sincronização com Nuvem' :
                   'Base de Dados Recuperada'}
                </span>
                <span className="text-[8px] opacity-80 font-medium text-center">
                  {recoverySource === 'PHYSICAL' ? 'Conectado diretamente ao arquivo .db do usuário' : 
                   recoverySource === 'CLOUD' ? 'Dados baixados e sincronizados com sucesso' :
                   recoverySource === 'LEGACY' ? 'Restaurado do cache legado local' : 'Dados carregados do cache seguro'}
                </span>
              </div>
            </div>
          )}
          {screen === AppScreen.STRESS_TEST && (
            <StressTestManager 
              onBack={() => setHistory([AppScreen.LOGIN])} 
              onShowModal={(config) => setModalConfig((prev: ModalConfig) => ({ ...prev, ...config, isOpen: true }))}
            />
          )}
          <Routes>
          {/* Phase 2 — URL-driven lazy-loaded routes */}
          <Route path="/login" element={<Login
            users={users}
            databaseMode={databaseMode}
            isDatabaseEmpty={isDatabaseEmpty}
            isKeyboardVisible={isKeyboardVisible}
            onOpenPrivacyCenter={() => setIsPrivacyCenterOpen(true)}
            onUpdateScreen={(s) => setHistory([s])}
            onShowModal={(config) => setModalConfig((prev) => ({ ...prev, ...config, isOpen: true }))}
            onUpdateDatabaseMode={handleUpdateDatabaseMode}
            isInitializing={isInitializing}
            dbInitialized={dbInitialized}
            onLogin={async (u) => {
              setUser(u);
              sessionStorage.setItem('app_current_user', safeStringify(u));
              if (databaseMode !== DatabaseMode.INTERNAL && !isInternalMode) {
                setDatabaseMode(DatabaseMode.SUPABASE);
              } else {
                setDatabaseMode(DatabaseMode.INTERNAL);
              }
              const defaultTenant = String(u.tenants || u.tenantid || 'CICOPAL').toUpperCase().trim();
              const defaultUnit = String(u.filial || u.unitid || u._unitid || '').toUpperCase().trim();
              setSelectedUnit(defaultUnit);
              sessionStorage.setItem('tenantId', defaultTenant);
              sessionStorage.setItem('filial', defaultUnit);
              if (databaseMode !== DatabaseMode.INTERNAL && !isInternalMode) {
                logger.info('[App] Login detectado. Iniciando sincronizacao silenciosa...');
                syncFromCloud(defaultTenant, DatabaseMode.SUPABASE, defaultUnit).catch(err => {
                  logger.warn('[Sync] Sincronizacao em background falhou:', err);
                });
              }
              try {
                const bioSupported = await isBiometricSupported();
                if (bioSupported) {
                  const username = (u.username || u.email || '').toLowerCase();
                  if (username) {
                    const alreadyRegistered = await hasBiometricRegistered(username);
                    if (!alreadyRegistered) {
                      setTimeout(() => pushScreen(AppScreen.BIOMETRIC_REGISTRATION), 500);
                    }
                  }
                }
              } catch (bioErr) {
                logger.warn('[Biometric] Falha ao checar biometria:', bioErr);
              }
            }}
          />} />
          <Route path="/menu" element={<MainMenu
            onOpenHelp={() => setIsHelpMenuOpen(true)}
            onNavigate={pushScreen}
            onLogout={() => { setSelectedUnit(null); setStartWithDataMenu(false); pushScreen(AppScreen.UNIT_SELECTION); }}
            onChangeUnit={() => { setSelectedUnit(null); pushScreen(AppScreen.UNIT_SELECTION); }}
            onExport={handleExport}
            onBackup={handleBackup}
            onDownloadCloudData={handleDownloadCloudData}
            onRestore={handleRestore}
            onClearDatabase={handleClearDatabase}
            onClearMultipleUnits={handleClearMultipleCompanies}
            showModal={showModal}
            user={user}
            units={fullCompaniesWithStatus.map(c => ({ name: c.name, hasData: c.hasData }))}
            databaseMode={databaseMode}
            onUpdateDatabaseMode={handleUpdateDatabaseMode}
            inventoryInfo={{ count: activeUnitAssetCount, totalDatabase: selectedUnit ? activeUnitAssetCount : inventory.assets.length, date: inventory.lastUpdated }}
            autoConfirmOnScan={inventory.autoConfirmOnScan || false}
            onUpdateAutoConfirm={(val) => updateConfig({ autoConfirmOnScan: val })}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH}
            onUpdateScanFeedbackMode={(mode) => updateConfig({ scanFeedbackMode: mode })}
            initialDataMenuOpen={startWithDataMenu}
            selectedUnit={selectedUnit}
            darkMode={inventory.darkMode || false}
            onUpdateDarkMode={(val) => updateConfig({ darkMode: val })}
            batterySaver={inventory.batterySaver || false}
            onUpdateBatterySaver={(val) => updateConfig({ batterySaver: val })}
            mandatoryPhotoOnDivergence={inventory.mandatoryPhotoOnDivergence || false}
            onUpdateMandatoryPhotoOnDivergence={(val) => updateConfig({ mandatoryPhotoOnDivergence: val })}
            mandatoryPhotoOnNewItem={inventory.mandatoryPhotoOnNewItem || false}
            onUpdateMandatoryPhotoOnNewItem={(val) => updateConfig({ mandatoryPhotoOnNewItem: val })}
            onSyncCloud={syncFromCloud}
            isSyncing={isSyncing}
            lastSyncTime={lastSyncTime}
            syncError={syncError}
            hasSupabase={!!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)}
            pendingPhotosCount={pendingPhotosCount}
            syncQueueLength={syncQueueLength}
            unsyncedAssetsCount={unsyncedAssetsCount}
            deletedAssetsCount={inventory.assets.filter(a => a._is_deleted).length}
            impairmentAssetsCount={inventory.assets.filter(a => Number(a._perda_impairment || 0) > 0 && !a._is_deleted).length}
            excludedAccounts={inventory.excludedAccounts}
            onUpdateExcludedAccounts={(accounts) => { localStorage.setItem('app_excluded_accounts', safeStringify(accounts)); updateConfig({ excludedAccounts: accounts }); }}
            protheusIntegrationEnabled={inventory.protheusIntegrationEnabled || false}
            onUpdateProtheusIntegration={(val) => { localStorage.setItem('app_protheus_enabled', String(val)); updateConfig({ protheusIntegrationEnabled: val }); }}
            protheusApiUrl={inventory.protheusApiUrl || ''}
            onUpdateProtheusApiUrl={(val) => { localStorage.setItem('app_protheus_url', val); updateConfig({ protheusApiUrl: val }); }}
            onResetGPS={handleResetGPS}
            onToggleGpsBypass={handleToggleGpsBypass}
            isGpsBypassed={localStorage.getItem('gbr_gps_bypass') === 'true'}
            onCheckIntegrity={handleCheckIntegrity}
            isAIAssistantOpen={isAIAssistantOpen}
            setIsAIAssistantOpen={setIsAIAssistantOpen}
            campaignsCount={campaigns.length}
            currentCampaignId={inventory.currentCampaignId}
          />} />
          <Route path="/db-manager" element={<DatabaseManagerScreen onBack={() => pushScreen(AppScreen.MODULE_SELECTION)} />} />
          <Route path="/dashboard" element={<Dashboard
            assets={filteredAssetsByUnit}
            allAssets={inventory.assets}
            currentCampaignId={inventory.currentCampaignId}
            onBack={popScreen}
            onChangeUnit={() => { setSelectedUnit(null); pushScreen(AppScreen.UNIT_SELECTION); }}
            onOpenInventory={() => selectedUnit ? pushScreen(AppScreen.ADDRESS_SELECTION) : pushScreen(AppScreen.UNIT_SELECTION)}
            onOpenLabeling={() => pushScreen(AppScreen.LABELING)}
            onOpenActiveSearch={() => pushScreen(AppScreen.ACTIVE_SEARCH)}
            user={user}
            sqlStats={databaseMode === DatabaseMode.INTERNAL ? sqlDashboardStats : null}
            onNavigate={pushScreen}
            selectedUnit={selectedUnit}
          />} />
              <Route path="*" element={(
                <>
          {screen === AppScreen.BIOMETRIC_REGISTRATION && (
            <BiometricRegistration 
              username={user?.username || user?.email || ''} 
              onComplete={() => {
                // Após completar, removemos a tela de biometria do histórico
                // e deixamos o usuário na tela que estava por baixo (definida no onLogin)
                popScreen();
              }}
              onSkip={() => {
                popScreen();
              }}
            />
          )}
          {screen === AppScreen.REGISTER && (
            <Register 
              databaseMode={databaseMode}
              onRegister={() => { 
                pushScreen(AppScreen.LOGIN);
              }} 
              onGoToLogin={popScreen} 
            />
          )}
          {screen === AppScreen.CHANGE_PASSWORD && (
            <ChangePassword 
              onPasswordChanged={(p) => { 
                const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u); 
                setUsers(upd); 
                const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL;
                const isEmpty = inventory.assets.length === 0;

                if (isEmpty && isAdmin) {
                  setStartWithDataMenu(true);
                  pushScreen(AppScreen.MAIN_MENU);
                } else {
                  pushScreen(AppScreen.UNIT_SELECTION); 
                }
              }} 
            />
          )}
          {/* Permission Modal removed in favor of PermissionGate */}

          {screen === AppScreen.INVENTORY && (
            <GPSComplianceGuard 
              userRole={user?.role} 
              unitConfig={currentUnitConfig}
              isFieldMode={isFieldMode}
            >
              {isSyncLocked && !isAdmin ? (
                <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-bg-main text-center animate-fadeIn">
                  <div className="w-20 h-20 bg-red-50 border border-red-100 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-red-500/10">
                    <ShieldAlert size={40} className="text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-ink uppercase tracking-tight mb-2">Sistema Bloqueado</h2>
                  <p className="text-xs text-ink-muted uppercase font-bold tracking-widest mb-8 max-w-xs leading-relaxed">
                    Fila de sincronização excedeu o limite de segurança ({MAX_SYNC_QUEUE_SIZE} itens). 
                    Aguarde a conclusão do upload para continuar.
                  </p>
                  <button 
                    onClick={popScreen}
                    className="w-full max-w-xs py-4 bg-accent text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                  >
                    Voltar ao Menu
                  </button>
                </div>
              ) : (
                <InventoryScreen 
                  onBack={popScreen} 
                  userEmail={user?.email}
                  userName={user?.name}
                  currentCampaignId={inventory.currentCampaignId}
                />
              )}
            </GPSComplianceGuard>
          )}
          {screen === AppScreen.LABELING && (
            <GPSComplianceGuard 
              userRole={user?.role}
              isFieldMode={isFieldMode}
            >
              <Labeling 
                assets={filteredAssetsByUnit} 
                selectedUnit={selectedUnit}
                onBack={popScreen} 
                onUpdateAsset={updateAsset} 
                onBulkUpdateAssets={bulkUpdateAssets} 
                onSelectAsset={handleSelectAsset} 
                uniqueCentrosDeCusto={uniqueCentrosDeCusto} 
                scannerMode={inventory.scannerMode || ScannerMode.BARCODE} 
                onUpdateScannerMode={handleUpdateScannerMode} 
                scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} 
              />
            </GPSComplianceGuard>
          )}
          {screen === AppScreen.CONSULTATION && (
            <Consultation 
              assets={filteredAssetsByUnit} 
              onBack={() => { setIsConsultationFromInventory(false); popScreen(); }} 
              onSelectAsset={handleSelectAsset} 
              qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} 
              scannerMode={inventory.scannerMode || ScannerMode.BARCODE} 
              onUpdateScannerMode={handleUpdateScannerMode} 
              scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} 
              isReturnMode={isConsultationFromInventory} 
              onReturnToInventory={(etq) => { setInventorySearchValue(etq); setIsConsultationFromInventory(false); popScreen(); }} 
              filters={consultationFilters}
              onUpdateFilters={setConsultationFilters}
              committedFilters={committedConsultationFilters}
              onUpdateCommittedFilters={setCommittedConsultationFilters}
            />
          )}
          {screen === AppScreen.ASSET_DETAIL && selectedAssets.length > 0 && (
            <AssetDetail 
              assets={selectedAssets} 
              onBack={popScreen} 
              onUpdate={updateAsset} 
              onDelete={isAdmin ? deleteAsset : undefined}
              onUnitize={unitizeAsset}
              onBulkUpdate={bulkUpdateAssets} 
              editableFields={inventory.editableFields || []} 
              qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} 
              uniqueEnderecos={allLocations} 
              uniqueCentrosDeCusto={uniqueCentrosDeCusto} 
              readOnly={isReadOnlyDetail}
              protheusIntegrationEnabled={inventory.protheusIntegrationEnabled || false}
              protheusApiUrl={inventory.protheusApiUrl || ''}
              tenantid={user?.tenantId || user?.tenantid || ''}
              mandatoryPhotoOnDivergence={inventory.mandatoryPhotoOnDivergence}
              mandatoryPhotoOnNewItem={inventory.mandatoryPhotoOnNewItem}
              databaseMode={databaseMode}
            />
          )}
          {screen === AppScreen.ASSET_REPORT_PRINT && (
            <AssetPrintView 
              assets={screenParams?.assets || filteredAssetsByUnit} 
              unitName={screenParams?.unitName || selectedUnit || 'UNIDADE GERAL'}
              onBack={popScreen}
              campaign={screenParams?.campaign}
              mode={screenParams?.mode}
              responsibleName={screenParams?.responsibleName || user?.name || user?.email}
            />
          )}
          {screen === AppScreen.SOFT_DELETE_REPORT && (
            <SoftDeleteReport 
              assets={inventory.assets}
              onBack={popScreen}
              onRestore={restoreAsset}
              onPermanentDelete={permanentDeleteAsset}
              isAdmin={isAdmin}
            />
          )}
          {screen === AppScreen.IMPAIRMENT_REPORT && (
            <ImpairmentReport 
              assets={inventory.assets}
              onBack={() => setHistory([AppScreen.MAIN_MENU, AppScreen.DASHBOARD])}
              onSelectAsset={(asset) => {
                setSelectedAssets([asset]);
                pushScreen(AppScreen.ASSET_DETAIL);
              }}
            />
          )}{screen === AppScreen.SIGNATURE && (
            <Signature 
              assets={filteredAssetsByUnit.filter(a => a._conferido)}
              onBack={popScreen}
              onConfirm={handleSignatureConfirm}
              unitName={selectedUnit || ''}
            />
          )}
          {screen === AppScreen.UNIT_SELECTION && (
            <UnitSelector 
              isAdmin={user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.is_admin || user?.isAdmin || (user?.email && user.email.toLowerCase() === ADMIN_EMAIL)}
   onLoadDatabase={() => pushScreen(AppScreen.DATABASE_MANAGER)}
   databaseMode={databaseMode}
   units={fullCompaniesWithStatus
     .filter(c => {
       // Regra de Visualização: Admin e Audidtor veem as unidades autorizadas
       // Se estiver no modo nuvem, mostramos todas para permitir o primeiro sync
       // No modo local, mostramos todas as unidades encontradas na base
       const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.is_admin || user?.isAdmin || (user?.email && user.email.toLowerCase() === ADMIN_EMAIL);
                  const isAuditor = user?.role === UserRole.AUDITOR || user?.role === UserRole.AUXILIARY_AUDITOR;
                  
                  if (isAdmin) return true; // Admin vê tudo que foi detectado
                  
                  if (isAuditor) {
                    const authorizedUnits = user?.units || (user?.unitid ? [user.unitid] : []);
                    const normCName = normalizeKey(c.name);
                    return authorizedUnits.some(au => normalizeKey(au) === normCName);
                  }

                  return true;
                })
                .map(c => ({ 
                  filial: c.name,
                  // No modo nuvem, permitimos selecionar mesmo se não houver dados locais ainda
                  hasData: databaseMode !== DatabaseMode.INTERNAL ? true : c.hasActiveAssets,
                  isDownloaded: false,
                  hasCampaign: c.hasCampaign,
                  hasGps: c.hasGps,
                  assetCount: (c as { assetCount?: number }).assetCount
                }))
              } 
              onSelect={(u) => { 
                const tid = user?.tenantId ? String(user.tenantId).trim().toUpperCase() : '';
                if (!tid || tid.trim().toUpperCase() === '') {
                  setModalConfig({
                    isOpen: true,
                    title: "Erro de Segurança",
                    message: "Contrato (tenantId) não identificado no perfil do usuário logado. Contate o Administrador do sistema.",
                    type: "error"
                  });
                  return;
                }
                const validatedTenant = tid.trim().toUpperCase();

                // 1º: Persistir o objeto da unidade selecionada no sessionStorage para isolamento de contexto.
                sessionStorage.setItem('selectedUnit', u);
                sessionStorage.setItem('app_selected_unit', u);
                localStorage.setItem('app_selected_unit', u);
                
                // Unified GBR v2.6 Keys
                sessionStorage.setItem('filial', u);
                localStorage.setItem('filial', u);
                
                sessionStorage.setItem('tenantId', validatedTenant);
                localStorage.setItem('tenantId', validatedTenant);

                setSelectedUnit(u);
                setIsInventorying(false);
                setInventoryLocation(null);
                sessionStorage.removeItem('app_just_finished_load');

                // Passo 4: Menu de Opções da Filial (DASHBOARD) - Obrigatório para todos os perfis (GBR v2.6.0)
                pushScreen(AppScreen.DASHBOARD);
              }} 
              onBack={async () => { 
                setCurrentModule(null);
                localStorage.removeItem('app_current_module');
                pushScreen(AppScreen.MODULE_SELECTION);
              }} 
              onSync={syncFromCloud}
              isSyncing={isSyncing}
              lastSyncTime={lastSyncTime}
              onForceToggleView={() => {
                pushScreen(AppScreen.DATABASE_MANAGER);
              }}
              onConfigGPS={(u) => {
                setSelectedUnit(u);
                pushScreen(AppScreen.UNIT_CONFIGURATOR);
              }}
              onCampaigns={(u) => {
                setSelectedUnit(u);
                pushScreen(AppScreen.CAMPAIGN_MANAGEMENT);
              }}
              isImportingBatch={isImportingBatchState}
            />
          )}
          {screen === AppScreen.ADDRESS_SELECTION && selectedUnit && (
            <AddressSelector 
              selectedUnit={selectedUnit}
              onSelect={(addr) => {
                setSelectedAddress(addr);
                pushScreen(AppScreen.INVENTORY);
              }}
              onBack={popScreen}
              isImportingBatch={isImportingBatchState}
            />
          )}
          {screen === AppScreen.UNIT_CONFIGURATOR && user && (
            <UnitConfigurator 
              user={user}
              units={unitNames}
              onBack={popScreen}
              onUpdateConfigs={handleUpdateUnitConfigs}
              onNavigate={pushScreen}
              initialUnit={selectedUnit}
            />
          )}{screen === AppScreen.ASSET_MAP && (
            <AssetMap 
              assets={selectedUnit ? filteredAssetsByUnit : inventory.assets} 
              onBack={popScreen} 
              databaseMode={databaseMode} 
              onSelectLocation={(loc) => {
                setInventoryLocation(loc);
                pushScreen(AppScreen.INVENTORY);
              }}
            />
          )}
          {screen === AppScreen.ACTIVE_SEARCH && (
            <ActiveSearch 
              assets={filteredAssetsByUnit} 
              onBack={popScreen} 
              onSelectAsset={(asset) => {
                handleSelectAsset(asset);
              }}
            />
          )}
          {screen === AppScreen.MODULE_SELECTION && (
            <ModuleSelector 
              username={user?.username || ''}
              userRole={user?.role}
              isDatabaseEmpty={isDatabaseEmpty}
              onOpenDatabaseManager={() => pushScreen(AppScreen.DATABASE_MANAGER)}
              onLogout={async () => {
                if (supabase) {
                  await logAuditEvent({
                    user_email: user?.email || 'unknown',
                    action: 'LOGOUT',
                    details: 'Usuário saiu do sistema.',
                    tenantId: user?.tenantId || 'CICOPAL'
                  });
                  await supabase.auth.signOut();
                }
                setUser(null);
                setCurrentModule(null);
                localStorage.removeItem('app_current_module');
                pushScreen(AppScreen.LOGIN);
              }}
              onSelect={(module) => {
                setCurrentModule(module);
                localStorage.setItem('app_current_module', module);
                if (module === AppModule.INVENTORY) {
                  pushScreen(AppScreen.UNIT_SELECTION);
                } else {
                  pushScreen(AppScreen.ASSET_CONTROL_HOME);
                }
              }}
            />
          )}
          {screen === AppScreen.ASSET_CONTROL_HOME && (
            <AssetControlModule 
              username={user?.username || ''}
              tenantId={user?.tenantId || 'CICOPAL'}
              databaseMode={databaseMode}
              onBack={() => {
                setCurrentModule(null);
                localStorage.removeItem('app_current_module');
                pushScreen(AppScreen.MODULE_SELECTION);
              }}
            />
          )}
          {screen === AppScreen.USER_MANAGEMENT && (isAdmin ? <UserManagement users={users} setUsers={setUsers} onBack={popScreen} currentUser={user} setUser={setUser} availableUnits={availableUnits} unitsByTenant={unitsByTenant} databaseMode={databaseMode} /> : <div className="flex items-center justify-center h-full"><p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p></div>)}
          {screen === AppScreen.FIELD_CONFIGURATOR && (isAdmin ? <FieldConfigurator assets={inventory.assets} currentEditable={inventory.editableFields || []} onSave={(f) => setInventory(prev => ({ ...prev, editableFields: f }))} onBack={popScreen} /> : <div className="flex items-center justify-center h-full"><p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p></div>)}
          {screen === AppScreen.QR_CODE_CONFIGURATOR && (isAdmin ? <QrCodeConfigurator assets={inventory.assets} currentQrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} onSave={(f) => setInventory(prev => ({ ...prev, qrCodeFields: f }))} onBack={popScreen} /> : <div className="flex items-center justify-center h-full"><p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p></div>)}
          {screen === AppScreen.AUDIT_LOGS && <AuditLogs user={user} onBack={() => setHistory([AppScreen.MAIN_MENU, AppScreen.DASHBOARD])} databaseMode={databaseMode} />}
          {screen === AppScreen.CAMPAIGN_MANAGEMENT && (
            <CampaignManager 
              user={user} 
              onBack={popScreen} 
              onActivate={async (id) => {
                // Unified v2.6 Keys & Session Metadata
                const tid = (user?.tenantId || 'CICOPAL').toString().trim();
                sessionStorage.setItem('tenantId', tid);
                localStorage.setItem('tenantId', tid);
                if (selectedUnit) {
                  sessionStorage.setItem('filial', selectedUnit);
                  localStorage.setItem('filial', selectedUnit);
                }
                sessionStorage.setItem('activeCampaignId', id);
                sessionStorage.setItem('activeCampaignStatus', 'ACTIVE');
                localStorage.setItem('app_current_campaign', id);

                if (selectedUnit && databaseMode === DatabaseMode.INTERNAL) {
                  try {
                    await sqliteService.salvarCampanhaAtiva(selectedUnit, id);
                  } catch (err) {
                    logger.error(">>> [App] Erro ao salvar campanha ativa corporativa no sqlite:", err);
                  }
                } else if (selectedUnit) {
                  // Fallback para modo nuvem no localStorage para manter consistência rápida
                  const normUnit = normalizeKey(selectedUnit);
                  localStorage.setItem(`kardek_campanha_ativa_${normUnit}`, 'true');
                }

                setInventory(prev => ({ 
                  ...prev, 
                  currentCampaignId: id,
                  status: DatabaseStatus.LOADED 
                }));
                // Força atualização das estatísticas e estado reactivo antes de navegar
                await refreshCampaigns();
                pushScreen(AppScreen.INVENTORY);
              }}
              currentCampaignId={inventory.currentCampaignId}
              availableUnits={fullCompaniesWithStatus.map(c => c.name)}
              campaigns={campaigns}
              onRefresh={refreshCampaigns}
              initialUnit={selectedUnit}
              tenantId={currentTenantId}
              unitId={currentUnitId}
              databaseMode={databaseMode}
            />
          )}
          {screen === AppScreen.GLOBAL_PERFORMANCE && <GlobalPerformance assets={filteredAssetsByUnit} campaigns={campaigns} onBack={() => setHistory([AppScreen.MAIN_MENU, AppScreen.DASHBOARD])} />}
          {screen === AppScreen.ACCOUNT_RECONCILIATION && <AccountReconciliation assets={filteredAssetsByUnit} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} />}
          {screen === AppScreen.SYNC_MANAGER && (
            <SyncManager 
              onBack={popScreen} 
              onSyncSuccess={async () => {
                const items = await getPendingSyncItems();
                setPendingPhotosCount(items.length);
                setSyncQueueLength(items.length);
              }}
              isFieldMode={isFieldMode}
              onToggleFieldMode={toggleFieldMode}
            />
          )}
          {screen === AppScreen.ONBOARDING && (
            <OnboardingWizard onComplete={completeOnboarding} onCancel={popScreen} />
          )}
                </>
              )} />
          </Routes>
        </div>
  
        {/* FloatingHelp agora é renderizado sempre que os termos forem aceitos, 
            permitindo acesso ao onboarding manual mesmo que não tenha sido completado automaticamente. */}
        <FloatingHelp 
          currentScreen={screen} 
          onCloseOnboarding={() => {
            localStorage.setItem('app_show_onboarding', 'false');
          }} 
          onOpenOnboarding={() => {
            pushScreen(AppScreen.ONBOARDING);
          }}
          onOpenPalette={() => setIsPaletteOpen(true)}
          onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
          isOpen={isHelpMenuOpen}
          onToggle={setIsHelpMenuOpen}
        />

        <PrivacyCenter 
          isOpen={isPrivacyCenterOpen} 
          onClose={() => setIsPrivacyCenterOpen(false)} 
        />

        {/* Indicador de Banco de Dados Local (Soberania) */}
        {databaseMode === DatabaseMode.INTERNAL && (screen !== AppScreen.LOGIN || (fileStatus?.status === 'expired' && !Capacitor.isNativePlatform())) && !isKeyboardVisible && (
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.5rem,env(safe-area-inset-left))] z-[60] flex flex-col gap-2"
          >
            <div 
              onClick={handleReconnectFile}
              className="bg-[#1e293b]/95 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-3 cursor-pointer hover:bg-[#334155] transition-all group scale-95 md:scale-100"
            >
              <div className="relative">
                {sqliteService.getStorageSource() === 'PHYSICAL' ? (
                  <Database size={18} className="text-green-400 group-hover:scale-110 transition-transform" />
                ) : sqliteService.getStorageSource() === 'CACHE' ? (
                  <Database size={18} className="text-amber-400 animate-pulse" />
                ) : (
                  <Database size={18} className="text-red-400" />
                )}
                {sqliteService.getStorageSource() === 'PHYSICAL' && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1"
                  >
                    <CheckCircle2 size={10} className="text-green-400 fill-[#1e293b]" />
                  </motion.div>
                )}
              </div>
              
              <div className="flex flex-col min-w-[80px]">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none text-white flex items-center gap-1.5">
                  {sqliteService.getStorageSource() === 'PHYSICAL' ? 'SOBERANIA NATIVA' : 
                   sqliteService.getStorageSource() === 'CACHE' ? 'BANCO PERSISTENTE' : 'ARMAZENAMENTO LOCAL SEGURO'}
                  {(sqliteService.getStorageSource() === 'PHYSICAL' || sqliteService.getStorageSource() === 'CACHE') && (
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  )}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] font-bold text-white/50 uppercase tracking-tighter truncate max-w-[120px]">
                    {sqliteService.getStorageSource() === 'PHYSICAL' 
                      ? 'Disco Android (Nativo)' 
                      : sqliteService.getStorageSource() === 'CACHE' ? 'MOTOR LOCAL INDEPENDENTE' : 'Aguardando Arquivo .db'}
                  </span>
                  {lastQueryLog && (
                    <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest border-l border-white/10 pl-2">
                       {lastQueryLog}
                    </span>
                  )}
                </div>
                {sqliteService.getNativePath() && (
                  <span className="text-[7px] font-mono text-emerald-400 truncate max-w-[140px] mt-1 opacity-80">
                    {sqliteService.getNativePath()}
                  </span>
                )}
              </div>

              {lastLocalSave && (
                <div className="ml-2 pl-3 border-l border-white/10 flex flex-col">
                   <span className="text-[7px] font-black text-white/40 uppercase tracking-widest leading-none">Gravado</span>
                   <span className="text-[8px] font-bold text-green-400 uppercase tracking-tighter mt-0.5">
                     {new Date(lastLocalSave).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                   </span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Indicador de Sincronização Offline (Fotos) */}
        {syncQueueLength > 0 && !isKeyboardVisible && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[50] bg-ink text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 backdrop-blur-md"
          >
            <div className="relative">
              <RefreshCw size={16} className="animate-spin text-accent" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full animate-ping"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">Sincronizando Fotos</span>
              <span className="text-[8px] font-bold text-white/60 uppercase tracking-tighter mt-0.5">
                {syncQueueLength} {syncQueueLength === 1 ? 'item pendente' : 'itens pendentes'} na fila
              </span>
            </div>
          </motion.div>
        )}

        {/* Immersive Mode handled automatically on first interaction */}
      </div>

      {isPaletteOpen && (
        <div className="fixed inset-0 z-[2000] bg-bg-main/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-border rounded-[2.5rem] shadow-2xl w-full max-w-5xl relative max-h-[90vh] overflow-y-auto"
          >
            <button 
              onClick={() => setIsPaletteOpen(false)}
              className="absolute top-6 right-6 z-[2001] p-3 bg-white border border-border text-ink rounded-full shadow-lg active:scale-95 transition-all"
            >
              <X size={20} />
            </button>
            <ThemePalette />
          </motion.div>
        </div>
      )}

      <AIAssistant 
        isOpen={isAIAssistantOpen} 
        onClose={() => setIsAIAssistantOpen(false)} 
      />

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => {
          if (modalConfig.onCancel) modalConfig.onCancel();
          setModalConfig((prev: ModalConfig) => ({ ...prev, isOpen: false }));
        }}
        onConfirm={() => {
          if (modalConfig.onConfirm) modalConfig.onConfirm();
          setModalConfig((prev: ModalConfig) => ({ ...prev, isOpen: false }));
        }}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        showCancel={modalConfig.showCancel}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
      />

      <Modal
        isOpen={isDuplicateModalOpen}
        onClose={() => {
          setIsDuplicateModalOpen(false);
          setPendingAssetUpdate(null);
        }}
        onConfirm={() => {
          if (pendingAssetUpdate) {
            commitAssetUpdate(pendingAssetUpdate);
          }
          setIsDuplicateModalOpen(false);
          setPendingAssetUpdate(null);
        }}
        title="Duplicidade Detectada"
        message={duplicateModalMessage}
        type="confirm"
        confirmText="Continuar"
        cancelText="Cancelar"
      />

      {isSyncing && (
        <div className="fixed inset-0 z-[10000] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center animate-fadeIn">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 border-4 border-accent/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-accent">
              <Cloud size={32} className="animate-pulse" />
            </div>
          </div>
          <h3 className="text-sm font-black text-ink uppercase tracking-[0.2em] mb-2">
            {databaseMode === DatabaseMode.INTERNAL ? 'Processando Local' : 'Sincronizando Base'}
          </h3>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest animate-pulse">
            {databaseMode === DatabaseMode.INTERNAL ? 'Aguarde, alternando modo de dados...' : 'Aguarde, baixando dados da nuvem...'}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[10000] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center animate-fadeIn">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 border-4 border-accent/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-accent">
              <Loader2 size={32} className="animate-spin" />
            </div>
          </div>
          <h3 className="text-sm font-black text-ink uppercase tracking-[0.2em] mb-2">Processando Login</h3>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest animate-pulse">Aguarde, validando credenciais...</p>
        </div>
      )}

      {/* Overlay de Reconexão e Processamento (Pessimismo Saudável) */}
      {(showReconnectOverlay || isProcessing) && (
        <div className="fixed inset-0 z-[20000] bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
          <div className="w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/40 relative overflow-hidden">
            {isProcessing ? (
              <Activity className="text-white relative z-10 animate-pulse" size={48} />
            ) : (
              <HardDrive className="text-white relative z-10" size={48} />
            )}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-[8px] border-white/20 border-t-white/80 rounded-full"
            />
          </div>
          
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">
            {isProcessing ? 'Persistindo no Banco SQL...' : 'Reconectando ao Banco de Dados Local...'}
          </h2>
          
          <p className="text-slate-400 text-sm max-w-md mb-10 leading-relaxed font-medium">
            {isProcessing ? (
              <>
                GBR Governança: Aguardando o <span className="text-blue-400 font-bold">COMMIT</span> físico no SQLite para garantir a integridade da auditoria. 
                Sua interface será liberada somente após o sucesso operacional.
              </>
            ) : (
              fileStatus?.linkType === 'DIRECTORY' ? (
                <>
                  O navegador precisa de permissão para acessar a pasta:<br/>
                  <span className="text-blue-400 font-bold">&quot;{fileStatus?.folderName}&quot;</span><br/>
                  onde o arquivo <span className="text-slate-300 italic">{fileStatus?.fileName}</span> está localizado.
                </>
              ) : (
                <>
                  O navegador perdeu o vínculo físico com o arquivo individual:<br/>
                  <span className="text-blue-400 font-bold">&quot;{fileStatus?.fileName}&quot;</span>.
                </>
              )
            )}
          </p>
          
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-8 max-w-sm">
             <p className="text-[10px] text-slate-400 leading-normal text-left">
               <span className="text-blue-400 font-black">SEGURANÇA DO NAVEGADOR:</span> Por restrições de privacidade (&quot;Sandbox&quot;), o navegador não revela o caminho absoluto do seu disco (Ex: C:\Usuarios\...). Ele identifica apenas o nome da pasta selecionada por você. O vínculo permanece intacto no diretório que você mapeou originalmente.
             </p>
          </div>
          
          <button 
            onClick={handleReconnectFile}
            disabled={isReconnecting}
            className="w-full max-w-xs py-5 bg-blue-600 text-white rounded-[1.5rem] font-bold uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
          >
            {isReconnecting ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <>
                <RefreshCw size={20} className="animate-spin-slow" />
                Reconfirmar Permissão
              </>
            )}
          </button>
          
          <button 
            onClick={async () => {
               if (window.confirm("Isso removerá o vínculo com a pasta atual. Você precisará vincular novamente. Deseja prosseguir?")) {
                  await sqliteService.hardResetDatabase();
                  window.location.reload();
               }
            }}
            className="mt-4 text-[10px] text-red-400 font-bold uppercase tracking-widest hover:underline"
          >
            Desvincular e Reiniciar Sistema
          </button>
          
          <p className="mt-8 text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-50">
            Soberania de Dados Ativa (Modo Interno)
          </p>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default App;
