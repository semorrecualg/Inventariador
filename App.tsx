
// v24.50.2 - Force Update to MPULMON Project
console.log(">>> [System] Versão GBR v24.50.2 - Iniciando com novo projeto Supabase...");
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { startSecurityMonitor, checkRuntimeIntegrity } from './services/securityService';
import { AppModule, AppScreen, User, Asset, InventoryState, DatabaseStatus, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, DatabaseMode, SearchFilters, UserRole, AuditLogEntry, TransactionOrigin, InventoryCampaign, UnitConfig, ModalConfig, NavigationParams } from './types';
import { getAssetUnit, normalizeKey } from './utils/schema';

// Extend Window interface for pushScreen
declare global {
  interface Window {
    pushScreen?: (s: AppScreen, params?: NavigationParams) => void;
    clickResetTimeout?: ReturnType<typeof setTimeout>;
  }
}
import Modal from './components/Modal';
import Login from './components/Login';
import Register from './components/Register';
import MainMenu from './components/MainMenu';
import DatabaseLoader from './components/DatabaseLoader';
import AssetDetail from './components/AssetDetail';
import SoftDeleteReport from './components/SoftDeleteReport';
import ImpairmentReport from './components/ImpairmentReport';
import Inventory from './components/Inventory';
import Labeling from './components/Labeling'; 
import GPSComplianceGuard from './components/GPSComplianceGuard';
import Signature from './components/Signature';
import { getCurrentLocation } from './utils/gpsUtils';
import { indoorNavigation } from './services/indoorNavigationService';
import UnitSelector from './components/UnitSelector';
import Dashboard from './components/Dashboard';
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
import UnitConfigurator from './components/UnitConfigurator';
import StressTestManager from './components/StressTestManager';

import { sqliteService } from './services/sqliteService';
import { Filesystem } from '@capacitor/filesystem';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import AIAssistant from './components/AIAssistant';
import { motion } from 'framer-motion';
import { APP_LOGO } from './constants';
import { DEFAULT_EDITABLE_FIELDS } from './constants/schema';
import { Building2, ShieldCheck, FileText, Loader2, RefreshCw, X, ShieldAlert, Sparkles, AlertTriangle, Activity, HardDrive, Database, CheckCircle2, Cloud } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveInventory, loadInventory, clearInventory, clearMultipleInventories, backupInventory, restoreInventory, saveConfigOnly } from './services/persistenceService';
// Global logging helper
const logAuditEvent = (entry: Parameters<typeof sqliteService.logAuditEvent>[0]) => sqliteService.logAuditEvent(entry);
import { isBiometricSupported, hasBiometricRegistered } from './services/biometricService';
import { safeStringify } from './services/utils';

import { requestPersistentStorage } from './services/localDbService';

const ADMIN_EMAIL = "semorr@gmail.com";
const ADMIN_EMAIL_ALT = "semorr@gmail.com.br";
const MAX_SYNC_QUEUE_SIZE = 5000; // Limite de segurança para fila de sincronização (Carga em Massa)

// Helper para verificar se um usuário é admin
const checkIsAdmin = (u: User | null | undefined) => {
  if (!u) return false;
  const email = u.email?.toLowerCase() || '';
  return u.role === UserRole.ADMIN || 
         u.role === UserRole.MASTER || 
         u.isAdmin || 
         email === ADMIN_EMAIL.toLowerCase() || 
         email === ADMIN_EMAIL_ALT.toLowerCase();
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
    console.error("App Crash:", error, errorInfo);
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

// App Component
// Polyfills p/ Androids Antigos (WebView < 92)
if (typeof window !== 'undefined' && window.crypto && !window.crypto.randomUUID) {
  // @ts-expect-error - polyfill intentional
  window.crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

const updateLoaderMessage = (title: string, subtitle?: string) => {
  const loader = document.getElementById('app-loader');
  if (loader) {
    const h1 = loader.querySelector('h1');
    const p = loader.querySelector('p');
    if (h1) h1.textContent = title;
    if (p && subtitle) p.textContent = subtitle;
  }
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('app_current_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email) {
        // Normalizar admin para semorr@gmail.com
        const lowerEmail = parsed.email.toLowerCase();
        if (lowerEmail === 'semorr@gmail.com' || lowerEmail === 'semorr@gmail.com.br') {
          parsed.is_admin = true;
          parsed.isAdmin = true;
          parsed.role = UserRole.ADMIN;
          // FORCE CICOPAL for Master User if missing
          if (!parsed._tenantid || parsed._tenantid === '') {
            parsed._tenantid = 'CICOPAL';
            parsed.tenantid = 'CICOPAL';
          }
          if (!parsed._unitid || parsed._unitid === '') {
            parsed._unitid = 'MATRIZ';
            parsed.unitid = 'MATRIZ';
          }
        }
        // Normalizar flags de admin
        const is_admin = parsed.is_admin || parsed.isAdmin || parsed.role === UserRole.ADMIN || parsed.role === UserRole.MASTER;
        parsed.is_admin = is_admin;
        parsed.isAdmin = is_admin;
        
        // Limpar DEFAULT
        const normalizeValue = (v: unknown) => {
          if (!v) return '';
          const s = String(v).toUpperCase();
          return (s === 'DEFAULT' || s === 'NULL' || s === '0' || s === 'default') ? '' : String(v);
        };
        parsed._tenantid = normalizeValue(parsed._tenantid || parsed.tenantid);
        parsed._unitid = normalizeValue(parsed._unitid || parsed.unitid);
        parsed.tenantid = parsed._tenantid;
        parsed.unitid = parsed._unitid;
        
        if (Array.isArray(parsed.units)) {
          parsed.units = parsed.units.filter((u: unknown) => normalizeValue(u) !== '');
        }
        if (Array.isArray(parsed.tenants)) {
          parsed.tenants = parsed.tenants.filter((t: unknown) => normalizeValue(t) !== '');
        }
      }
      return parsed;
    } catch { return null; }
  });

  // ESTADOS DE NAVEGAÇÃO E CORE (v2.6.5 - Anti ReferenceError)
  const [history, setHistory] = useState<AppScreen[]>(() => {
    try {
      const saved = localStorage.getItem('app_screen_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        const history = Array.isArray(parsed) && parsed.length > 0 ? parsed : [AppScreen.LOGIN];
        return history.filter(s => s !== AppScreen.ONBOARDING);
      }
      return [AppScreen.LOGIN];
    } catch { return [AppScreen.LOGIN]; }
  });

  const [screenParams, setScreenParams] = useState<NavigationParams | null>(() => {
    try {
      const saved = localStorage.getItem('app_screen_params');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  const databaseMode = DatabaseMode.INTERNAL;

  const pushScreen = useCallback((s: AppScreen, params?: NavigationParams) => {
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

    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) {
      console.log(`>>> [Navigation] Resetting history to: ${s}`);
      setHistory([s]);
    } else {
      console.log(`>>> [Navigation] Pushing screen: ${s}`);
      setHistory(prev => [...prev, s]);
    }
  }, [databaseMode]);

  const popScreen = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.length > 1 ? prev.slice(0, -1) : [AppScreen.MAIN_MENU];
      const newScreen = newHistory[newHistory.length - 1];
      console.log(`>>> [Navigation] Popping screen back to: ${newScreen}`);
      if (newScreen !== AppScreen.ASSET_DETAIL) {
        setSelectedAssets([]);
      }
      return newHistory;
    });
  }, []);

  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showModal = useCallback((title: string, message: string, type: 'success' | 'error' | 'info' | 'confirm' | 'warning') => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type,
    });
  }, []);

  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedUnit, setSelectedUnit] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('app_selected_unit');
      return saved || null;
    } catch { return null; }
  });

  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('app_current_campaign_id');
      return saved || null;
    } catch { return null; }
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [hasAcceptedTerms] = useState<boolean>(() => {
    return localStorage.getItem('app_terms_accepted') === 'true';
  });

  const [isPrivacyCenterOpen, setIsPrivacyCenterOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(true);
  const [securityThreats, setSecurityThreats] = useState<string[]>([]);
  const [syncQueueLength, setSyncQueueLength] = useState(0);
  const [isSyncLocked] = useState(false);
  const [showReconnectOverlay, setShowReconnectOverlay] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [fileStatus, setFileStatus] = useState<{status: string, path: string, folderName?: string, fileName?: string, linkType?: string} | null>(null);

  const [isFieldMode, setIsFieldMode] = useState<boolean>(() => {
    return localStorage.getItem('app_field_mode') === 'true';
  });

  const [, setCurrentModule] = useState<AppModule | null>(() => {
    const saved = localStorage.getItem('app_current_module');
    return (saved as AppModule) || null;
  });

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Expose pushScreen to window for components that need it
  useEffect(() => {
    window.pushScreen = pushScreen;
    return () => {
      delete window.pushScreen;
    };
  }, [pushScreen]);

  // Controle de Back Button Físico (Android/Capacitor/Native v2.6)
  useEffect(() => {
    let backListener: { remove: () => void } | null = null;
    
    const setupBackListener = async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        const listener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          // BLOQUEIO v2.6: Não permite sair se houver overlays persistentes ou telas de sistema
          const hasModal = !!document.querySelector('.z-\\[12000\\]'); // Photo preview
          
          if (hasModal) {
            console.log('[Native] Back Button: Fechando modal de evidência.');
            return;
          }

          if (screen !== AppScreen.LOGIN && screen !== AppScreen.HOME) {
            popScreen();
          } else if (canGoBack) {
            window.history.back();
          } else {
            CapacitorApp.exitApp();
          }
        });
        backListener = listener;
      } catch {
        // Silencioso no Browser
      }
    };

    setupBackListener();
    return () => {
      if (backListener) backListener.remove();
    };
  }, [screen, popScreen]);


  // Handlers

  const handleReconnectFile = async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    
    try {
      console.log(">>> [DBA] Iniciando processo de reconexão manual...");
      const success = await sqliteService.requestFilePermission();
      
      if (success) {
        // ESSENCIAL: Aguarda o serviço ler os dados do arquivo físico recém-liberado
        await sqliteService.init(true);
        
        // Aguarda um pequeno delay para o OS processar a permissão
        await new Promise(r => setTimeout(r, 800));
        
        // Recarrega os dados do inventário para o estado do React
        const loaded = await loadInventory(databaseMode);
        
        // v25.01: Se carregou dados (mesmo que do cache), atualizamos o estado
        if (loaded && (loaded as InventoryState).status !== DatabaseStatus.ERROR) {
          // Garantir que empresas estão extraídas
          if (loaded.companies.length === 0 && loaded.assets.length > 0) {
             console.log(">>> [DBA] Extraindo unidades de " + loaded.assets.length + " ativos...");
             loaded.companies = [...new Set(loaded.assets.map(a => {
               return (a.UNIDADE_OPERACIONAL || a.UNIDADE || a._unidade || a._unitid || '').toString().trim().toUpperCase();
             }))].filter(Boolean);
          }
          
          if (loaded.assets.length > 0 && loaded.companies.length === 0) {
            console.error(">>> [DBA] CRÍTICO: Ativos carregados mas nenhuma unidade operacional mapeada!");
            alert("Atenção: Os dados foram carregados, mas nenhuma 'Unidade Operacional' foi identificada. Verifique se as colunas da planilha Excel estão corretas (Ex: UNIDADE, LOCAL, FILIAL).");
          } else {
            console.log(">>> [DBA] Carga de unidades OK: " + loaded.companies.length + " encontradas.");
          }
          
          // v24.50.1: Refresh unit list using optimized query
          if (loaded.assets.length > 0) {
             const units = await sqliteService.getOperationalUnits();
             if (units && units.length > 0) {
                console.log(`>>> [DBA] Unidades sincronizadas via Query: ${units.length}`);
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
             console.log(`>>> [DBA] Unidades sincronizadas via Query Real-Time: ${units.length}`);
             setInventory(prev => ({ ...prev, companies: units }));
          } else {
             console.warn(">>> [DBA] Nenhuma unidade encontrada via Query após reconexão.");
          }
          
          if (loaded.assets.length > 0 || units.length > 0) {
            setSqliteStatus('ACTIVE');
            await sqliteService.setSystemStatus(DatabaseStatus.ACTIVE);
          }
          console.log(`>>> [DBA] Reconexão manual concluída: ${loaded.assets.length} ativos carregados.`);
        } else {
          console.error(">>> [DBA] Falha ao recarregar inventário após permissão.");
        }
      } else {
        // Se falhou ou usuário cancelou, não fazemos nada, o overlay permanece.
        console.warn(">>> [DBA] Permissão não concedida ou negada.");
      }
    } catch (err) {
      console.error('Erro ao reconectar arquivo:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  // Config
  const updateConfig = useCallback((updates: Partial<InventoryState>) => {
    setInventory(prev => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString()
    }));
  }, []);

  // Monitor de Sincronização
  useEffect(() => {
    // Modo Soberano ativado
  }, [databaseMode]);

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
             localStorage.removeItem('app_current_user');
             window.location.reload();
          }
        });
      }
    });

    return () => clearInterval(monitorId);
  }, []);

  useEffect(() => {
    localStorage.setItem('app_screen_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (screenParams) {
      localStorage.setItem('app_screen_params', JSON.stringify(screenParams));
    } else {
      localStorage.removeItem('app_screen_params');
    }
  }, [screenParams]);

  useEffect(() => {
    if (selectedUnit) {
      localStorage.setItem('app_selected_unit', selectedUnit);
      sqliteService.saveConfig('selectedUnit', selectedUnit);
    } else {
      localStorage.removeItem('app_selected_unit');
    }
  }, [selectedUnit]);

  useEffect(() => {
    if (currentCampaignId) {
      localStorage.setItem('app_current_campaign_id', currentCampaignId);
      sqliteService.saveConfig('currentCampaignId', currentCampaignId);
    } else {
      localStorage.removeItem('app_current_campaign_id');
    }
  }, [currentCampaignId]);

  const getInitialInventoryState = (mode: DatabaseMode): InventoryState => ({ 
    assets: [], 
    companies: [], 
    lastUpdated: null, 
    status: DatabaseStatus.EMPTY,
    editableFields: DEFAULT_EDITABLE_FIELDS,
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
    excludedAccounts: JSON.parse(localStorage.getItem('app_excluded_accounts') || '["131105001", "131105002"]'),
    databaseMode: mode,
    hasCompletedOnboarding: localStorage.getItem('app_onboarding_completed') === 'true'
  });

  // Limpeza preventiva v2.6
  useEffect(() => {
    if (sqliteService) {
      sqliteService.vacuum();
    }
  }, []);

  const [inventory, setInventory] = useState<InventoryState>(() => {
    const mode = (localStorage.getItem('app_database_mode') as DatabaseMode) || DatabaseMode.INTERNAL;
    return getInitialInventoryState(mode);
  });

  console.log("App render - hasCompletedOnboarding:", inventory.hasCompletedOnboarding);

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [sqliteStatus, setSqliteStatus] = useState<DatabaseStatus | string>(DatabaseStatus.EMPTY);
  const [campaigns, setCampaigns] = useState<InventoryCampaign[]>([]);

  const [unitConfigs, setUnitConfigs] = useState<UnitConfig[]>([]);

  useEffect(() => {
    document.body.dataset.isProcessing = String(isLoading || isSyncing || isOCRProcessing);
  }, [isLoading, isSyncing, isOCRProcessing]);
  const [downloadedUnits, setDownloadedUnits] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_downloaded_units');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [isCloudUpdatePending] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastLocalSave, setLastLocalSave] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

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

    // --- HANDSHAKE DE PERMISSÕES SOBERANAS (v2.6) ---
    const requestSystemPermissions = async () => {
      if (Capacitor.isNativePlatform()) {
        console.log(">>> [Capacitor] Solicitando permissões de sistema...");
        try {
          await Camera.requestPermissions();
          await Geolocation.requestPermissions();
          console.log(">>> [Capacitor] Handshake de permissões concluído.");
        } catch (err) {
          console.warn(">>> [Capacitor] Falha no handshake de permissões:", err);
        }
      }
    };
    requestSystemPermissions();
    
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const [showRecoveryToast] = useState(false);
  const [recoverySource, setRecoverySource] = useState<'PHYSICAL' | 'CACHE' | 'LEGACY' | 'CLOUD' | null>(null);
  const [integrityFailed, setIntegrityFailed] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyAssetsRef = useRef<Set<string>>(new Set());
  const inventoryRef = useRef<InventoryState>(inventory);

  const [refreshVersion, setRefreshVersion] = useState(0);

  const currentTenantId = useMemo(() => {
    // 1. Prioridade: Tenant do usuário logado
    let t = (user?._tenantid || user?.tenantid || '').trim();
    
    // 2. Fallback: Se for Admin/Gestor e não tiver tenant, assume CICOPAL
    const isAdmin = !!(user?.isAdmin || user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (!t && isAdmin) t = 'CICOPAL';
    
    // 3. Segurança v25.10: Se ainda estiver vazio e houver ativos carregados, 
    // tenta extrair o tenant do primeiro ativo válido para manter o contexto
    if (!t && inventory.assets.length > 0) {
      const firstValid = inventory.assets.find(a => a._tenantid || a.GRUPO_EMPRESARIAL);
      if (firstValid) t = (firstValid._tenantid || firstValid.GRUPO_EMPRESARIAL || '').trim();
    }

    return t || '';
  }, [user, inventory.assets]);

  const currentUnitId = useMemo(() => {
    return (selectedUnit || user?._unitid || user?.unitid || '').trim();
  }, [selectedUnit, user]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  // Monitor de Soberania de Arquivos (Modo Físico)
  useEffect(() => {
    if (databaseMode === DatabaseMode.INTERNAL) {
      const checkFileStatus = async () => {
        // Evita polling agressivo durante tentativa de reconexão ou link manual, ou quando na tela de carga dedicada
        if (isReconnecting || screen === AppScreen.DATABASE_MANAGER || screen === AppScreen.LOAD_DATABASE) return;

        const result = await sqliteService.getFileStatus();
        if (result.status === 'busy') return; // Ignora pacificamente se houver gravação em curso
        
        setFileStatus(result as { status: string; path: string; fileName?: string });
        
        const isRestricted = result.status === 'permission_denied' || result.status === 'prompt' || result.status === 'expired';
        
        if (isRestricted && !isReconnecting) {
          // Só abrimos o overlay se NÃO houver dados carregados ou se estivermos em Dashboard (onde integridade é vital)
          // v24.5.1: Se o sistema JA está inicializado (isInitialized), ignoramos status 'prompt' temporários do navegador
          const isReallyDisconnected = !sqliteService.getIsInitialized() || result.status === 'permission_denied' || result.status === 'expired';
          
          if (!showReconnectOverlay && isReallyDisconnected && (!isDataLoaded || inventoryRef.current.assets.length === 0 || screen === 'DASHBOARD')) {
            console.warn(`>>> [DBA] Vínculo expirado ou inacessível (${result.status}). Abrindo overlay.`);
            setShowReconnectOverlay(true);
          }
        } else if (result.status === 'linked' || result.status === 'granted') {
          if (showReconnectOverlay) {
            console.log(">>> [DBA] Vínculo reestabelecido. Fechando overlay.");
            setShowReconnectOverlay(false);
          }
          
          // Sincronização reativa e proteção contra UI vazia
          if (!isDataLoaded || inventoryRef.current.assets.length === 0) {
            const status = sqliteService.getDbStatus();
            if (status === DatabaseStatus.ACTIVE) {
              console.log(">>> [DBA] Permissão reestabelecida. Recarregando banco físico com soberania...");
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
  }, [databaseMode, isReconnecting, showReconnectOverlay, screen, isDataLoaded]);

  // Carregamento de Campanhas e Configurações de GPS
  const refreshCampaigns = useCallback(async () => {
    let tenantId = currentTenantId;
    const unitId = currentUnitId;
    
    // Fallback de segurança para Tenant caso o useMemo esteja em delay
    if (!tenantId) {
      tenantId = (user?._tenantid || user?.tenantid || '').trim();
      if (!tenantId && !!(user?.isAdmin || user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER)) {
        tenantId = 'CICOPAL';
      }
    }

    console.log(`>>> [Governance] refreshCampaigns INICIADO em ${new Date().toLocaleTimeString()}`);
    
    if (!tenantId) return;

    try {
      if (databaseMode === DatabaseMode.INTERNAL) {
        await sqliteService.forceSync();
      }

      const gpsData = await sqliteService.getUnitConfigs(tenantId);
      setUnitConfigs(gpsData);
      setInventory(prev => ({ ...prev, unitConfigs: gpsData }));

      const fetchUnitId = screen === AppScreen.CAMPAIGN_MANAGEMENT ? null : unitId;
      const campaignData = await sqliteService.getCampaigns(tenantId, fetchUnitId);
      
      setCampaigns([...(campaignData || [])]);
      setRefreshVersion(prev => prev + 1);
    } catch (err) {
      console.error('>>> [Governance] ERRO CRÍTICO no Refresh:', err);
    }
  }, [currentTenantId, currentUnitId, databaseMode, user, screen]);

  // --- CAMPAIGN MANAGEMENT SOBERANA (v2.6) ---
  const handleActivateCampaign = useCallback(async (campaignId: string) => {
    try {
      setIsSyncing(true);
      console.log(`>>> [Soberania] Ativando campanha: ${campaignId}`);

      // 1. Persistência no SQLite Soberano
      await sqliteService.executeRaw(`UPDATE campaigns SET status = 'ACTIVE' WHERE id = '${campaignId}'`);
      await sqliteService.executeRaw(`UPDATE campaigns SET status = 'FINISHED' WHERE id != '${campaignId}' AND status = 'ACTIVE'`);
      
      // 2. Atualização de Estado Local
      setCurrentCampaignId(campaignId);
      
      // 3. Auditoria Física
      await sqliteService.logAuditEvent({
        user_email: user?.email || 'SOBERANO_USER',
        action: 'CAMPAIGN_ACTIVATE',
        details: `Campanha ativada no SQLite: ${campaignId}`,
        _tenantid: currentTenantId,
        _unitid: selectedUnit || campaignId
      });

      // 4. Sincronização de Visão
      await refreshCampaigns();
      
      setInventory(prev => ({ 
        ...prev, 
        status: DatabaseStatus.LOADED 
      }));

      // 5. Navegação
      pushScreen(AppScreen.INVENTORY);
      
      showModal('Sucesso', 'Campanha ativada com sucesso no Banco Soberano.', 'success');
    } catch (err) {
      console.error(">>> [Soberania] Erro ao ativar campanha:", err);
      showModal('Erro', 'Não foi possível ativar a campanha no SQLite.', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [user, currentTenantId, selectedUnit, refreshCampaigns, pushScreen, showModal]);

  // Hook simplificado para garantir que configs de GPS estejam no inventory (usado por guards)
  useEffect(() => {
    if (user?.tenantid) {
       sqliteService.getUnitConfigs(user.tenantid).then(configs => {
         setUnitConfigs(configs);
         setInventory(prev => ({ ...prev, unitConfigs: configs }));
       }).catch(err => console.error(">>> [App] Erro ao carregar UnitConfigs:", err));
    }
  }, [user?.tenantid, databaseMode]);

  // Sincronização Reativa Obrigatória no Foco (Governança GBR)
  useEffect(() => {
    const criticalScreens = [
      AppScreen.MAIN_MENU, 
      AppScreen.UNIT_SELECTION, 
      AppScreen.CAMPAIGN_MANAGEMENT,
      AppScreen.DASHBOARD
    ];
    
    if (criticalScreens.includes(screen)) {
      console.log(`>>> [Governance] Re-leitura obrigatória do banco ao focar: ${screen}`);
      refreshCampaigns();
    }
  }, [screen, refreshCampaigns]);

  // Efeito de reparo automático de GPS para ativos conferidos sem coordenadas
  useEffect(() => {
    if (inventory.assets.length > 0 && inventory.unitConfigs && inventory.unitConfigs.length > 0) {
      let hasRepaired = false;
      const repairedAssets = inventory.assets.map(a => {
        const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
        if (isConferido && (!a._lat || !a._lng)) {
          const unitId = a.UNIDADE || a._unidade;
          const config = inventory.unitConfigs?.find(c => c.unit_id === unitId);
          if (config && config.lat && config.lng) {
            hasRepaired = true;
            return { ...a, _lat: config.lat, _lng: config.lng };
          }
        }
        return a;
      });

      if (hasRepaired) {
        console.log('>>> [GPS] Reparo automático de coordenadas aplicado a ativos conferidos sem GPS.');
        setInventory(prev => ({ ...prev, assets: repairedAssets }));
        saveInventory({ ...inventory, assets: repairedAssets });
      }
    }
  }, [inventory.assets.length, inventory.unitConfigs?.length]);

  const handleUpdateUnitConfig = async (unitId: string, lat: number, lng: number) => {
    if (!user) return;
    
    const configToSave: UnitConfig = {
      _tenantid: user.tenantid || 'default',
      _unitid: unitId,
      tenant_id: user.tenantid || 'default',
      unit_id: unitId,
      lat: lat,
      lng: lng,
      radius_meters: currentUnitConfig?.radius_meters || 500,
      is_active: true,
      updated_by: user.email,
      updated_at: new Date().toISOString()
    };

    console.log('>>> [App] Atualizando Âncora GPS para Unidade:', unitId);
    
    try {
      await sqliteService.saveUnitConfig(configToSave);
      
      // PERSISTÊNCIA SOBERANA (v2.6)
      await sqliteService.saveConfig(`gps_ref_${unitId}_lat`, String(lat));
      await sqliteService.saveConfig(`gps_ref_${unitId}_lng`, String(lng));
      
      // Atualiza o estado local imediatamente para refletir a mudança
      const updatedConfigs = await sqliteService.getUnitConfigs(user.tenantid);
      setInventory(prev => ({
        ...prev,
        unitConfigs: updatedConfigs,
        lastUpdated: new Date().toISOString()
      }));
      
      // Se estiver em modo interno, força salvamento no SQLite físico
      if (databaseMode === DatabaseMode.INTERNAL) {
        saveInventory({
          ...inventory,
          unitConfigs: updatedConfigs,
          lastUpdated: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Erro ao salvar configuração de GPS:', err);
    }
  };

  const currentUnitConfig = useMemo(() => {
    if (!selectedUnit || !inventory.unitConfigs) return null;
    return inventory.unitConfigs.find(c => c.unit_id === selectedUnit) || null;
  }, [inventory.unitConfigs, selectedUnit]);

  // Gestão do Ciclo de Vida da Navegação Indoor
  useEffect(() => {
    if (selectedUnit) {
      // O início já é feito no onSelect do UnitSelector com validação de perímetro
      // mas garantimos que pare ao sair da unidade
    } else {
      indoorNavigation.stopTracking();
    }
    
    return () => {
      indoorNavigation.stopTracking();
    };
  }, [selectedUnit]);

  const handleDownloadUnit = useCallback(async (unitName: string) => {
    if (isSyncing) return;
    
    // No modo INTERNO, o download é irrelevante pois os dados já estão locais
    if (databaseMode === DatabaseMode.INTERNAL) {
      console.log('>>> [Download] Modo Mobile Puro detectado. Download ignorado.');
      return;
    }

    if (!navigator.onLine) {
      setModalConfig({
        isOpen: true,
        title: 'Sem Conexão',
        message: 'Você precisa estar online para baixar os dados da unidade para uso offline.',
        type: 'error'
      });
      return;
    }

    setIsSyncing(true);
    try {
      // Sincroniza a unidade específica da nuvem
      await syncFromCloud(user?.tenants || user?.tenantid, databaseMode, unitName);
      
      // Marca como baixada
      setDownloadedUnits(prev => {
        if (prev.includes(unitName)) return prev;
        const next = [...prev, unitName];
        localStorage.setItem('app_downloaded_units', safeStringify(next));
        return next;
      });

      setModalConfig({
        isOpen: true,
        title: 'Download Concluído',
        message: `Os dados da unidade ${unitName} foram baixados com sucesso e estão disponíveis para uso offline.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Erro ao baixar unidade:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro no Download',
        message: 'Ocorreu um erro ao tentar baixar os dados da unidade. Verifique sua conexão.',
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [databaseMode, isSyncing, user]);

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

  // syncFromCloud removido para Soberania Técnica

  // Sincronismo em Tempo Real (Desativado)
  useEffect(() => {
    return;
  }, [databaseMode]);

  // Sincronismo Pendente (Desativado)
  useEffect(() => {
    return;
  }, [user, isCloudUpdatePending, isSyncing, databaseMode]);

  const [inventorySearchValue, setInventorySearchValue] = useState<string | null>(null);
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
        CONTACONTABIL: '',
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
        CONTACONTABIL: '',
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
    } catch {
      return null;
    }
  });

  // Apply theme class to body
  useEffect(() => {
    const body = document.body;
    body.classList.remove('theme-internal', 'theme-dark');
    
    if (inventory.darkMode) {
      body.classList.add('theme-dark');
    } else {
      body.classList.add('theme-internal');
    }
  }, [inventory.darkMode]);

  // Load inventory from IndexedDB on mount
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      const currentLoader = document.getElementById('app-loader');
      if (currentLoader && !currentLoader.classList.contains('hidden')) {
        window.alert("SAFETY TRIGGER: Splash demorou +5s. Forçando entrada.");
        console.warn(">>> [Safety] Splash Screen timeout atingido (5s). Forçando liberação...");
        currentLoader.classList.add('hidden');
        if (currentLoader.parentNode) {
          setTimeout(() => currentLoader.remove(), 500);
        }
        setIsDataLoaded(true);
      }
    }, 8000); // Aumentado para 8s para dar tempo de ver os alertas

    const init = async () => {
      try {
        console.log(">>> [Initialize] Iniciando ciclo de vida do app...");
        window.alert("Passo 1: Iniciando Boot");
        updateLoaderMessage("Carregando...", "Validando permissões...");
        
        // TRIGGER DE PERMISSÕES NATIVO (Solicitado p/ Android v24.50)
        if (Capacitor.isNativePlatform()) {
          try {
            window.alert("Passo 2: Permissões Filesystem");
            console.log(">>> [Native] Solicitando permissões de Filesystem...");
            await Filesystem.requestPermissions();
          } catch (permErr) {
            console.warn(">>> [Native] Falha na solicitação de permissões:", permErr);
          }
        }

        window.alert("Passo 3: Persistência");
        updateLoaderMessage("Carregando...", "Habilitando storage...");
        // Solicita persistência durável
        await requestPersistentStorage();
        
        console.log(`App init - Soberania Nativa Ativada.`);
        
    // RESTORE OPERATIONAL CONTEXT FROM SQLITE SOBERANIA (v2.6)
    try {
      window.alert("Passo 4: SQLite Config");
      updateLoaderMessage("Carregando...", "Restaurando contexto...");
      
      // Force init sqlite explicitly here with extra safety
      try {
        console.log(">>> [Boot] Chamada segura SQLite init...");
        await sqliteService.init(true);
      } catch (sqErr) {
        console.error(">>> [Boot] Falha ao acordar SQLite:", sqErr);
        // Não trava aqui, deixa o fluxo fatal capturar se for realmente impeditivo
      }

      const savedUnit = await sqliteService.getConfig('selectedUnit');
      const savedCampaign = await sqliteService.getConfig('currentCampaignId');
      
      if (savedUnit && !selectedUnit) {
        console.log(`>>> [Boot] Restaurando Unidade Operacional: ${savedUnit}`);
        setSelectedUnit(savedUnit);
      }
      
      if (savedCampaign && !currentCampaignId) {
        console.log(`>>> [Boot] Restaurando Campanha Ativa: ${savedCampaign}`);
        setCurrentCampaignId(savedCampaign);
      }
    } catch (err) {
      console.warn(">>> [Boot] Falha ao restaurar meta-configurações:", err);
    }

        let savedInventory: InventoryState | null = null;
        try {
          window.alert("Passo 5: Carregando Dados");
          updateLoaderMessage("Carregando...", "Lendo banco de dados...");
          savedInventory = await loadInventory(databaseMode);
          
          // BLOCO DE AUDITORIA SIMPLIFICADO (Solicitado p/ evitar hangs)
          /* 
          if (databaseMode === DatabaseMode.INTERNAL && savedInventory) {
             // ... auditoria pesada ...
          }
          */
          
          // Recupera o status do SQLite para Soberania de Dados
          if (databaseMode === DatabaseMode.INTERNAL) {
            const status = sqliteService.getDbStatus();
            const source = sqliteService.getStorageSource();
            setSqliteStatus(status === DatabaseStatus.ACTIVE ? DatabaseStatus.LOADED : status);
            setRecoverySource(source === 'PHYSICAL' ? 'PHYSICAL' : 'CACHE');
          }

          if (savedInventory && savedInventory.assets && savedInventory.assets.length > 0) {
            window.alert("Passo 6: Restaurando Ativos");
            const saved = savedInventory;
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
            
            if (!recoverySource) setRecoverySource('CACHE');
            setIntegrityFailed(false);
          } else {
            // Fallback legacy
            // window.alert("Passo 6: Base Vazia");
          }
        } catch (e) { 
          window.alert("ERRO NO DADOS: " + String(e));
          console.error("Data load failed", e); 
        } finally {
          // window.alert("Passo Final: Liberando");
          console.log(">>> [Initialize] Concluído. Liberando UI.");
          clearTimeout(safetyTimeout);
          setIsDataLoaded(true);
          // @ts-expect-error - appStarted is a custom property
          window.appStarted = true;
          const currentLoader = document.getElementById('app-loader');
          if (currentLoader) {
            currentLoader.classList.add('hidden');
            if (currentLoader.parentNode) {
              setTimeout(() => currentLoader.remove(), 500);
            }
          }
        }
      } catch (fatal) {
        console.error(">>> [FATAL] Boot failure:", fatal);
        setBootError(String(fatal));
        window.alert("ERRO FATAL NO BOOT: " + String(fatal));
        updateLoaderMessage("Erro Crítico", String(fatal));
        setIsDataLoaded(true); // Tenta forçar render mesmo com erro
        
        // Garantir que o loader seja removido
        const currentLoader = document.getElementById('app-loader');
        if (currentLoader) {
          currentLoader.classList.add('hidden');
          if (currentLoader.parentNode) {
            setTimeout(() => currentLoader.remove(), 500);
          }
        }

        // Se for erro de banco, força a tela de Loader como solicitado pelo usuário
        const errorStr = String(fatal).toUpperCase();
        if (errorStr.includes('SQLITE') || errorStr.includes('DATABASE') || errorStr.includes('DIRECTORY') || errorStr.includes('FILESYSTEM')) {
           console.warn(">>> [Soberania] Forçando tela de DatabaseLoader devido a erro de motor.");
           setHistory([AppScreen.LOAD_DATABASE]);
        }
      }
    };
    init();
  }, [databaseMode, selectedUnit, currentCampaignId, recoverySource]);


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
        console.error('Erro ao decodificar dados do QR Code:', e);
      }
    } else if (etqParam && !publicAsset) {
      // 1. Tenta encontrar no inventário local
      const foundLocal = inventory.assets.find(a => normalizeKey(a.ETIQUETA || "") === normalizeKey(etqParam));
      if (foundLocal) {
        setPublicAsset(foundLocal);
      }
    }

    const currentScreen = history[history.length - 1] || AppScreen.LOGIN;

    // 1. If no user, must be at LOGIN, REGISTER or ONBOARDING or STRESS_TEST
    if (!user && currentScreen !== AppScreen.LOGIN && currentScreen !== AppScreen.REGISTER && currentScreen !== AppScreen.ONBOARDING && currentScreen !== AppScreen.STRESS_TEST) {
      setHistory([AppScreen.LOGIN]);
      return;
    }

    // 1.5 If user is logged in but on LOGIN or REGISTER, go to appropriate screen
    if (user && (currentScreen === AppScreen.LOGIN || currentScreen === AppScreen.REGISTER)) {
      const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.MASTER || user.isAdmin || user.email.toLowerCase() === ADMIN_EMAIL;
      setHistory([isAdmin ? AppScreen.MODULE_SELECTION : AppScreen.UNIT_SELECTION]);
      return;
    }

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
  }, [isDataLoaded, user, history, selectedAssets.length, selectedUnit]);

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('app_users');
      const userList: User[] = saved ? JSON.parse(saved) : [];
      
      // Admin Padrão
      const adminIndex = userList.findIndex(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
      if (adminIndex === -1) {
        userList.push({ 
          username: "ADMINISTRADOR", 
          name: "ADMINISTRADOR GLOBAL",
          email: ADMIN_EMAIL, 
          password: "Glaucio@1970", 
          role: UserRole.ADMIN,
          is_admin: true,
          isAdmin: true, 
          mustChangePassword: false,
          _tenantid: '',
          tenantid: ''
        });
      } else if (userList[adminIndex].password === 'admin') {
        // Atualiza a senha se for a padrão antiga para facilitar o acesso do usuário
        userList[adminIndex].password = "Glaucio@1970";
        userList[adminIndex].mustChangePassword = false;
      }
      
      return userList;
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('app_users', JSON.stringify(users));
  }, [users]);

  // Busca de usuários (Fisicamente Soberana)
  useEffect(() => {
    // Busca de usuários concluída
  }, [user?.email]);

  const [inventoryLocation, setInventoryLocation] = useState<string | null>(() => {
    return localStorage.getItem('app_inventory_location') || null;
  });

  const [isInventorying, setIsInventorying] = useState<boolean>(() => {
    return localStorage.getItem('app_is_inventorying') === 'true';
  });

  const [isReadOnlyDetail, setIsReadOnlyDetail] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [publicAsset, setPublicAsset] = useState<Asset | null>(null);

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
          console.warn("O modo tela cheia não está habilitado ou permitido neste ambiente (comum em visualizações dentro de iframes).");
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
            console.warn(`Falha ao solicitar tela cheia: ${err.message}. Isso pode ocorrer em ambientes de visualização.`);
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
      console.error("Fullscreen toggle failed", e);
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
  const [pendingAssetUpdate, setPendingAssetUpdate] = useState<Asset | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateModalMessage, setDuplicateModalMessage] = useState("");

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (inventory.assets.length > 0 && inventory.status !== DatabaseStatus.EMPTY) {
        e.preventDefault();
        e.returnValue = 'Inventário em curso. Deseja realmente sair? Seus dados estão salvos no dispositivo.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [inventory]);

  const [manualLocations, setManualLocations] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_manual_locations');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const { locationsWithStats, allLocations, uniqueCentrosDeCusto } = useMemo(() => {
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

      const assetUnitId = normalizeKey(a._unitid || '');
      const assetUnitOp = normalizeKey(a.UNIDADE_OPERACIONAL || '');
      const assetTenant = normalizeKey(a._tenantid || a.GRUPO_EMPRESARIAL || '');
      
      // Se houver unidade selecionada, o ativo deve pertencer a ela (por ID ou Nome)
      if (currentCompKey && 
          assetUnitId !== currentCompKey && 
          assetUnitOp !== currentCompKey && 
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
    const assetCompKey = normalizeKey(asset.UNIDADE_OPERACIONAL || asset._unitid || asset._tenantid || asset.GRUPO_EMPRESARIAL || '');
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
          
          const shouldSyncCloud = false;
          
          if (shouldSyncCloud) {
            setIsSyncing(true);
            try {
              await saveInventory(inventory, dirtyAssets, true);
              setLastSyncTime(inventory.lastUpdated || new Date().toISOString());
              setSyncError(null);
            } catch (err) {
              setSyncError('Erro na sincronização');
              console.error('Sync error:', err);
            } finally {
              setIsSyncing(false);
            }
          } else {
            // FAST PATH: Salva apenas a config se não houver necessidade de sync pesado
            // Os ativos já estão sendo salvos incrementalmente via saveAssetIncremental
            const { assets: _assets, ...config } = inventory;
            if (_assets.length > 0) {
              // Assets are saved incrementally, so we only log here for debug
              console.debug('Config sync: assets present but skipped in this path', _assets.length);
            }
            await saveConfigOnly(config as unknown as Omit<InventoryState, 'assets'>);
          }
          
          dirtyAssetsRef.current.clear();
        }
        localStorage.setItem('app_screen_history', safeStringify(history));
        localStorage.setItem('app_current_user', safeStringify(user));
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
      } catch { console.warn("Storage cap reached"); }
    }, 3000); // Reduzido de 10s para 3s para maior segurança de dados
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedUnit, inventoryLocation, isInventorying, isDataLoaded, consultationFilters, committedConsultationFilters]);


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



      // 3. Atualiza o estado local
      sessionStorage.setItem('app_just_cleared_data', 'true');
      const normalizedToClear = companiesToClear.map(c => c.toUpperCase().trim());
      const remainingAssets = inventory.assets.filter(a => !normalizedToClear.includes((a.UNIDADE_OPERACIONAL || '').toUpperCase().trim()));
      
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
      console.error('Erro na limpeza em massa:', error);
      
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
      console.log('>>> [Integrity] Iniciando verificação manual...');
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
      console.error('Erro ao verificar integridade:', error);
      return { success: false, message: "Erro técnico durante a verificação de integridade." };
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
    if (val) {
      localStorage.setItem('gbr_gps_bypass', 'true');
      setModalConfig({
        isOpen: true,
        title: 'Bypass de GPS Ativado',
        message: 'O sistema agora usará coordenadas simuladas (Brasília) para testes em desktop.',
        type: 'success'
      });
    } else {
      localStorage.removeItem('gbr_gps_bypass');
      setModalConfig({
        isOpen: true,
        title: 'Bypass de GPS Desativado',
        message: 'O sistema voltará a exigir localização real.',
        type: 'info'
      });
    }
  };

  const handleUpdateUnitConfigs = useCallback((configs: UnitConfig[]) => {
    setInventory(prev => ({ ...prev, unitConfigs: configs }));
    setUnitConfigs(configs);
    refreshCampaigns();
  }, [refreshCampaigns]);

  const completeOnboarding = useCallback(() => {
    try {
      console.log("Finalizando onboarding - Início da função");
      
      // 1. Persistência imediata
      localStorage.setItem('app_onboarding_completed', 'true');
      console.log("Finalizando onboarding - LocalStorage persistido");
      
      // 2. Atualização de estado
      setInventory(prev => {
        console.log("Finalizando onboarding - Atualizando estado do inventário");
        const newState = { ...prev, hasCompletedOnboarding: true };
        saveInventory(newState).catch(e => console.error('Erro ao salvar no IndexedDB:', e));
        return newState;
      });
      
      // 3. Navegação forçada se necessário
      const currentScreen = history[history.length - 1];
      if (currentScreen === AppScreen.ONBOARDING || currentScreen === AppScreen.LOGIN) {
        const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        console.log("Finalizando onboarding - Redirecionando usuário. isAdmin:", isAdmin);
        setHistory([isAdmin ? AppScreen.MODULE_SELECTION : AppScreen.UNIT_SELECTION]);
      }
    } catch (error) {
      console.error("Erro crítico no completeOnboarding:", error);
    }
  }, [history, user, ADMIN_EMAIL]);

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  useEffect(() => {
    // Monitoramento de Hardware: Bateria (Soberania de Operação v2.6.6)
    const nav = navigator as unknown as { getBattery: () => Promise<{ level: number, addEventListener: (type: string, listener: () => void) => void }> };
    if ('getBattery' in navigator) {
      nav.getBattery().then((battery) => {
        const updateBattery = () => setBatteryLevel(battery.level * 100);
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
      });
    }
  }, []);

  const commitAssetUpdate = useCallback(async (updatedAsset: Asset) => {
    // Check-point de Integridade v2.6.6: Bloqueio em caso de energia insuficiente
    if (batteryLevel !== null && batteryLevel < 5) {
      alert("🛑 BATERIA CRÍTICA (< 5%): Gravações no SQLite bloqueadas para evitar corrupção do banco. Conecte ao carregador.");
      return;
    }

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

    setIsProcessing(true);
    try {
      const timestamp = new Date().toISOString();
      const updates = { ...updatedAsset } as Asset;
      
      const currentScreen = history[history.length - 1];
      const isReconciliationWorkflow = history.includes(AppScreen.ACCOUNT_RECONCILIATION);
      const targetLoc = isReconciliationWorkflow
          ? (updates.ENDERECO || "")
          : (inventoryLocation 
              ? inventoryLocation.toUpperCase().trim() 
              : (updates.ENDERECO || "").toString().toUpperCase().trim());

      const index = inventory.assets.findIndex(a => String(a.id) === String(updates.id));
      const existingAsset = index !== -1 ? inventory.assets[index] : null;

      // Metadados de Auditoria v2.6.5
      updates._lastUpdated = timestamp;
      if (updates._conferido) {
        updates._dataLeitura = updates._dataLeitura || timestamp;
      }
      updates._auditor = user?.name || user?.username || user?.email || 'SISTEMA';
      updates._origemTransacao = origin;

      // Log de Auditoria
      const historyEntry: AuditLogEntry = {
        timestamp,
        user: updates._auditor,
        action: index === -1 ? 'CREATE' : 'UPDATE',
        details: `Item ${index === -1 ? 'criado' : 'atualizado'} no local ${targetLoc} via ${currentScreen}`,
        tenantid: user?.tenantid || '',
        origin: origin
      };
      updates._history = [...(updates._history || []), historyEntry];

      // Campos alterados e garantias de integridade
      const alteredFields = new Set<string>(updates._camposAlterados || []);
      const originalValues = { ...(existingAsset?._valoresOriginais || {}) };

      if (existingAsset) {
        const wasLabelingCandidate = 
          String(existingAsset.ETIQUETA || '').toUpperCase().includes('ETIQUETAR') || 
          String(existingAsset._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' ||
          existingAsset.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR ||
          existingAsset._plaquetado === true;

        if (wasLabelingCandidate) {
          updates._plaquetado = true;
        }

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
      }
      
      updates._camposAlterados = Array.from(alteredFields);
      updates._valoresOriginais = originalValues;
      if (!updates._tenantid) updates._tenantid = user?.tenantid || '';
      if (!updates._unitid) updates._unitid = user?.unitid || '';

      // PESIMISMO SAUDÁVEL: Persistência no SQLite Local (Soberania Nativa)
      await sqliteService.bulkInsertAssets([updates]);
      
      // 3. Log de Auditoria Interno (Check-point de Integridade v2.6.6)
      await sqliteService.logAuditEvent({
        user_email: user?.email || 'SOBERANO_USER',
        action: updates._isNew ? 'INSERT_SOBRA' : 'UPDATE_CONFERIDO',
        details: `Ativo ${updates.ETIQUETA} persistido no path: ${sqliteService.getNativePath() || 'INTERNAL.db'}`,
        _tenantid: updates._tenantid,
        _unitid: updates._unitid
      });

      // SÓ APÓS CONFIRMAÇÃO DO BANCO ATUALIZAMOS A UI
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
      setLastLocalSave(new Date().toISOString());
      console.log(`>>> [DATABASE] Operação confirmada e UI sincronizada para id: ${updatedAsset.id}`);
    } catch (err) {
      console.error(">>> [DATABASE] Falha Crítica de Escrita:", err);
      alert("ERRO SQL: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  }, [history, inventoryLocation, databaseMode, user, inventory.assets]);

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
      tenantid: user?.tenantid,
      origin: updatedAsset._origemTransacao
    };
    
    const assetWithHistory = {
      ...assetWithGps,
      _campaignId: inventory.currentCampaignId || assetWithGps._campaignId,
      _version: nextVersion,
      _history: [...(assetWithGps._history || []), auditEntry],
      _auditor: user?.email || assetWithGps._auditor,
      _dataLeitura: new Date().toISOString()
    };

    // Captura GPS de forma ASSÍNCRONA mas PRIORITÁRIA para o primeiro commit
    if (updatedAsset._conferido) {
      console.log(`>>> [GPS] Iniciando captura prioritária para item ${updatedAsset.id}...`);
      
      try {
        // REGRA DE RIGOR: Aguarda até 3 segundos pela posição GPS antes de salvar
        // Se falhar ou timeout, usa fallback da unidade
        const loc = await Promise.race([
          getCurrentLocation(),
          new Promise<{lat: number, lng: number}>((_, reject) => setTimeout(() => reject(new Error('GPS Timeout')), 5000))
        ]).catch(e => {
          console.warn('>>> [GPS] Falha na captura rápida (v2.6), verificando âncora de segurança:', e);
          if (currentUnitConfig?.lat && currentUnitConfig?.lng && currentUnitConfig.lat !== 0) {
            return { lat: currentUnitConfig.lat, lng: currentUnitConfig.lng };
          }
          // Se não houver âncora, retorna objeto vazio para sinalizar falta de GPS
          return { lat: undefined, lng: undefined };
        }) as { lat?: number; lng?: number };

        if (loc.lat !== undefined && loc.lng !== undefined) {
          console.log(`>>> [GPS] Capturado para Kardex: ${loc.lat}, ${loc.lng}`);
          
          // Injeta GPS no objeto e no registro da auditoria
          assetWithHistory._lat = loc.lat;
          assetWithHistory._lng = loc.lng;
          
          // Atualiza a última entrada da trilha com a posição exata
          const lastIndex = assetWithHistory._history.length - 1;
          if (lastIndex >= 0) {
            assetWithHistory._history[lastIndex].details += ` [GPS: ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}]`;
          }
        } else {
          console.warn('>>> [GPS] Nenhuma localização obtida (Hardware Timeout + Sem Âncora). Gravando sem coordenadas.');
        }
      } catch (e) {
        console.error(">>> [GPS] Erro fatal na lógica de captura:", e);
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

    // 3. Atualizar estado (Pesimismo Saudável - SQLite Nativo)
    setIsProcessing(true);
    try {
      await sqliteService.bulkInsertAssets([updatedParent, ...newAssets]);

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
      console.error('>>> [DATABASE] Erro ao unitarizar ativo:', err);
      alert("ERRO SQL (Unitarização): " + (err instanceof Error ? err.message : String(err)));
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

    // Modo Soberano: Apenas save local
    await sqliteService.bulkInsertAssets([restoredAsset]);
  }, [inventory.assets, user, databaseMode]);

  const permanentDeleteAsset = useCallback(async (assetId: string) => {
    if (!window.confirm('Deseja realmente excluir permanentemente este ativo? Esta ação não pode ser desfeita.')) return;

    setInventory(prev => ({
      ...prev,
      assets: prev.assets.filter(a => String(a.id) !== String(assetId)),
      lastUpdated: new Date().toISOString()
    }));
  }, []);

  const addNewLocation = (newLocation: string) => {
    const upperCaseLocation = newLocation.toUpperCase().trim();
    if (upperCaseLocation && !allLocations.includes(upperCaseLocation)) {
      setManualLocations(prev => {
        const next = [...prev, upperCaseLocation];
        localStorage.setItem('app_manual_locations', safeStringify(next));
        return next;
      });
    }
  };

  const deleteAsset = useCallback(async (assetId: string) => {
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    
    if (!isAdmin) {
      alert("Apenas administradores podem excluir ativos.");
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
      tenantid: user?.tenantid
    };
    deletedAsset._history = [...(deletedAsset._history || []), auditEntry];

    setIsProcessing(true);
    try {
      // 1. TENTA SALVAR NO BANCO PRIMEIRO (MODO SOBERANO)
      await sqliteService.bulkInsertAssets([deletedAsset]);

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
      
      console.log(`>>> [DATABASE] Exclusão confirmada para id: ${assetId}`);
    } catch (err) {
      console.error('>>> [DATABASE] Falha ao excluir ativo:', err);
      alert("ERRO SQL (Exclusão): " + (err instanceof Error ? err.message : String(err)));
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
      const loc = await getCurrentLocation();
      gpsCoords = { lat: loc.lat, lng: loc.lng };
    } catch (e) {
      console.warn('GPS não capturado para lote, tentando fallback da unidade:', e);
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
          _lat: gpsCoords.lat, 
          _lng: gpsCoords.lng,
          _origemTransacao: origin // Aplica o código fixo
        };
        
        // Garantir que tenant e unit estão definidos
        if (!updates._tenantid) updates._tenantid = user?.tenantid || '';
        if (!updates._unitid) updates._unitid = user?.unitid || '';
        
        // Log de Auditoria para atualização em lote
        const historyEntry: AuditLogEntry = {
          timestamp: new Date().toISOString(),
          user: user?.name || user?.username || user?.email || 'SISTEMA',
          action: 'BULK_UPDATE',
          details: `Atualização em lote via ${currentScreen}: ${Object.keys(manualUpdates || {}).join(', ')}`,
          tenantid: user?.tenantid || '',
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
      console.log(`>>> [DATABASE] Iniciando persistência em lote para ${updatedAssetsList.length} itens (Modo Soberano)...`);
      // SOBERANIA SQLITE: Transação atômica
      await sqliteService.bulkInsertAssets(updatedAssetsList);

      // Audit Log em LOTE
      await sqliteService.logAuditEvent({
        user_email: user?.email || 'SOBERANO_USER',
        action: 'BULK_UPDATE',
        details: `Atualização em lote de ${updatedAssetsList.length} itens. IDs: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`,
        _tenantid: user?.tenantid,
        _unitid: user?.unitid
      });

      // 3. SÓ APÓS CONFIRMAÇÃO DO BANCO ATUALIZAMOS A UI
      setInventory(prev => ({
        ...prev,
        assets: allAssets,
        lastUpdated: new Date().toISOString(),
        status: DatabaseStatus.IN_USE
      }));
      setLastLocalSave(new Date().toISOString());
      
      // MARCA IDs como sujos para back-sync
      ids.forEach(id => dirtyAssetsRef.current.add(String(id)));
      
      console.log(`>>> [DATABASE] Operação em lote concluída com sucesso.`);
    } catch (err) {
      console.error('>>> [DATABASE] Falha Crítica no Lote:', err);
      // alert("ERRO SQL (Lote): " + (err instanceof Error ? err.message : String(err)));
      // No mobile real, alerts são melhores para erros de banco
      window.alert(`ERRO CRÍTICO NO BANCO:\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [inventoryLocation, determineTag, normalizeKey, user, databaseMode, history, currentUnitConfig, inventory.assets]);

  const handleUpdateScannerMode = useCallback((mode: ScannerMode) => {
    setInventory(prev => ({ ...prev, scannerMode: mode }));
  }, []);

  const handleUpdateSearchMode = useCallback((mode: InventorySearchMode) => {
    setInventory(prev => ({ ...prev, inventorySearchMode: mode }));
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

    // Log de Auditoria
    logAuditEvent({
      user_email: user?.email || 'unknown',
      action: 'EXPORT',
      table_name: 'assets',
      details: `Exportação de ${inventory.assets.length} ativos para Excel.`,
      _tenantid: user?._tenantid || user?.tenantid
    });
  };

  const handleBackup = async () => {
    const success = await backupInventory(databaseMode);
    if (success) {
      // Log de Auditoria
      logAuditEvent({
        user_email: user?.email || 'unknown',
        action: 'EXPORT',
        details: 'Backup manual do sistema realizado.',
        _tenantid: user?._tenantid || user?.tenantid
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

      // Log de Auditoria
      logAuditEvent({
        user_email: user?.email || 'unknown',
        action: 'RESTORE',
        details: `Restauração de backup: ${newState.assets.length} ativos carregados.`,
        _tenantid: user?._tenantid || user?.tenantid
      });
    } else {
      setModalConfig({
        isOpen: true,
        title: 'Erro na Restauração',
        message: 'Não foi possível restaurar o backup. Verifique se o arquivo é um JSON válido do sistema.',
        type: 'error'
      });
    }
  };

  // --- Handlers de Transição e Workflow ---
  const handleDataLoaded = useCallback(async (assets: Asset[], companies: string[]) => {
    console.log('>>> [App] handleDataLoaded iniciado. Ativos:', assets.length);
    
    // 1. Unidades (Usamos as já calculadas via SQL pelo Loader para performance)
    let finalCompanies = (companies && companies.length > 0) ? companies : [];
    
    // Regra v25.01: Se as empresas vieram vazias mas há ativos, tentamos extrair por Query SQL "Limpa"
    if (finalCompanies.length === 0 && assets.length > 0) {
      console.warn('>>> [App] handleDataLoaded: Unidades vazias. Tentando extração de emergência via SQL...');
      try {
        const sqlUnits = await sqliteService.getOperationalUnits();
        if (sqlUnits && sqlUnits.length > 0) {
          finalCompanies = sqlUnits;
        } else {
          // Fallback total se a query falhar: Extração direta dos objetos
          finalCompanies = [...new Set(assets.map(a => 
            (a.UNIDADE_OPERACIONAL || a.UNIDADE || a._unidade || a._unitid || '').toString().trim().toUpperCase()
          ))].filter(Boolean);
        }
      } catch (err) {
        console.error('>>> [App] Erro na extração de emergência de unidades:', err);
      }
    }

    // 2. Atualização de Estado
    const newInventory: InventoryState = { 
      ...inventory, 
      assets, 
      companies: finalCompanies,
      lastUpdated: new Date().toISOString(),
      status: DatabaseStatus.LOADED
    };
    
    setInventory(newInventory);
    setIsDataLoaded(true);
    setSqliteStatus('ACTIVE');
    
    // 3. Persistência de Segurança (Cache) - Importante para o modo Interno
    try {
      await saveInventory(newInventory, assets);
      await sqliteService.setSystemStatus(DatabaseStatus.ACTIVE);
    } catch (e) {
      console.warn('>>> [App] Falha ao persistir cache após carga:', e);
    }

    // 4. Loop Guard: Evita que o redirect de "base vazia" dispare imediatamente ao voltar
    sessionStorage.setItem('app_just_finished_load', 'true');
    sessionStorage.removeItem('app_just_cleared_data');
    
    // 5. Navegação: Sempre retorna para a seleção de unidade (fluxo padrão)
    console.log('>>> [App] Iniciando transição de pós-carga...');
    setStartWithDataMenu(false);
    
    // Defer para permitir que o sistema processe o estado grande
    setTimeout(() => {
      console.log('>>> [App] Executando redirecionamento para Seleção de Unidade.');
      if (history.includes(AppScreen.LOAD_DATABASE) || history.includes(AppScreen.DATABASE_MANAGER)) {
        const newHistory = history.filter(s => s !== AppScreen.LOAD_DATABASE && s !== AppScreen.DATABASE_MANAGER);
        if (newHistory[newHistory.length - 1] !== AppScreen.UNIT_SELECTION) {
          newHistory.push(AppScreen.UNIT_SELECTION);
        }
        setHistory(newHistory);
        localStorage.setItem('app_screen_history', safeStringify(newHistory));
      } else {
        pushScreen(AppScreen.UNIT_SELECTION);
      }
    }, 150);
  }, [history, pushScreen]);

  const handleClearDatabase = async () => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
      const unitName = selectedUnit ? selectedUnit.toUpperCase().trim() : 'GERAL';
      
      // Nome do arquivo conforme especificação
      const backupFileName = `INVENTARIO_MOBILE+KBP+DADOS+${unitName}+${dateStr}+${timeStr}`;
      
      // 1. Realiza backup automático antes de limpar
      await backupInventory(databaseMode, backupFileName);
      
      // 2. Limpa localmente (apenas a unidade selecionada se houver)
      await clearInventory(databaseMode, selectedUnit || undefined); 
      
      // 3. Log de Auditoria
      logAuditEvent({
        user_email: user?.email || 'unknown',
        action: 'DELETE',
        table_name: 'assets',
        details: `Limpeza de banco de dados (Unidade: ${selectedUnit || 'GERAL'})`,
        _tenantid: user?._tenantid || user?.tenantid
      });

      // Atualiza o estado local removendo apenas os ativos da empresa limpa
      sessionStorage.setItem('app_just_cleared_data', 'true');
      if (selectedUnit) {
        const normalizedSel = selectedUnit.toUpperCase().trim();
        const remainingAssets = inventory.assets.filter(a => (a.UNIDADE_OPERACIONAL || '').toUpperCase().trim() !== normalizedSel);
        
        if (remainingAssets.length === 0) {
          setSqliteStatus('EMPTY');
          await sqliteService.setSystemStatus(DatabaseStatus.EMPTY);
        }

        setInventory(prev => ({
          ...prev,
          assets: remainingAssets,
          lastUpdated: new Date().toISOString(),
          status: remainingAssets.length > 0 ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY
        }));
      } else {
        // Se não houver empresa selecionada, limpa tudo (comportamento padrão de segurança)
        setSqliteStatus('EMPTY');
        await sqliteService.setSystemStatus(DatabaseStatus.EMPTY);
        setInventory(prev => ({ 
          ...prev,
          assets: [], 
          companies: [], 
          lastUpdated: null, 
          status: DatabaseStatus.EMPTY
        }));
      }
      
      setModalConfig({
        isOpen: true,
        title: 'Limpeza Concluída',
        message: `A unidade operacional "${selectedUnit}" foi limpa com sucesso. Um backup de segurança foi gerado: ${backupFileName}`,
        type: 'info'
      });
    } catch (error: unknown) {
      console.error('Erro na limpeza do banco:', error);
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

  const filteredAssetsByUnit = useMemo(() => {
    if (!selectedUnit) return inventory.assets; 
    const selKey = normalizeKey(selectedUnit);
    const filtered = [];
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      // Verifica _unitid (Prioridade), UNIDADE_OPERACIONAL ou _tenantid/GRUPO_EMPRESARIAL
      const assetUnitId = normalizeKey(a._unitid || '');
      const assetUnitOp = normalizeKey(a.UNIDADE_OPERACIONAL || '');
      const assetTenant = normalizeKey(a._tenantid || a.GRUPO_EMPRESARIAL || '');
      
      if (assetUnitId === selKey || 
          assetUnitOp === selKey || 
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
  }, [inventory.assets, selectedUnit, normalizeKey]);

  const filteredAssetsByLocation = useMemo(() => {
    if (!inventoryLocation) return [];
    
    const virtualName = "PENDENTES DE ETIQUETAGEM / SEM ENDERECO";
    const targetKey = normalizeKey(inventoryLocation);
    // v2.6.8: Normalização extrema para bater com o agrupamento
    const isOrphanVirtual = inventoryLocation.trim().toUpperCase() === virtualName || targetKey === normalizeKey(virtualName);
    
    const result = [];
    
    for (let i = 0; i < filteredAssetsByUnit.length; i++) {
      const a = filteredAssetsByUnit[i];
      // USAR NORMALIZAÇÃO SOBERANA PARA BATER COM O AGRUPAMENTO
      const effectiveLoc = a._localMaster || a.ENDERECO || a.LOCALIZACAO || a.CENTRO_CUSTO || 'SEM LOCAL';
      const assetLocKey = normalizeKey(effectiveLoc);
      
      if (isOrphanVirtual) {
        // No modo órfão, consideramos itens sem endereço explícito ou que caíram no fallback default
        const assetLocUpper = String(effectiveLoc).trim().toUpperCase();
        if (!assetLocKey || assetLocUpper === 'SEM LOCAL' || assetLocUpper === '' || assetLocKey === normalizeKey(virtualName)) {
          result.push(a);
        }
      } else if (assetLocKey === targetKey) {
        result.push(a);
      }
    }

    if (result.length === 0 && !isOrphanVirtual && filteredAssetsByUnit.length > 0) {
       console.warn(`>>> [UX] ALERTA: Nenhum ativo encontrado para '${inventoryLocation}'.`);
       console.log(`>>> [UX] Target Key: '${targetKey}'`);
       const samples = filteredAssetsByUnit.slice(0, 5).map(a => {
         const loc = a._localMaster || a.ENDERECO || a.LOCALIZACAO || a.CENTRO_CUSTO || 'SEM LOCAL';
         return { original: loc, key: normalizeKey(loc) };
       });
       console.log(`>>> [UX] Amostras de chaves na unidade:`, samples);
    }

    // Se for virtual, ordena por Centro de Custo e injeta cabeçalhos para agrupamento visual
    if (isOrphanVirtual) {
       result.sort((a, b) => (a.CENTRODECUSTO || "").localeCompare(b.CENTRODECUSTO || ""));
       
       const groupedResult = [];
       let currentCC = null;
       
       for (let j = 0; j < result.length; j++) {
         const asset = result[j];
         const cc = asset.CENTRODECUSTO || "CENTRO DE CUSTO NÃO DEFINIDO";
         
         if (cc !== currentCC) {
           groupedResult.push({ 
             isHeader: true, 
             title: cc, 
             id: `header-${cc}`,
             _is_header: true // Adicional para garantir detecção
           });
           currentCC = cc;
         }
         groupedResult.push(asset);
       }
       
       console.log(`>>> [UX] Filtro concluído (COM AGRUPAMENTO). Total itens: ${groupedResult.length}`);
       return groupedResult;
    }
    
    console.log(`>>> [UX] Filtro concluído. Encontrados: ${result.length} ativos para o endereço '${inventoryLocation}'`);
    return result;
  }, [filteredAssetsByUnit, inventoryLocation]);

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
      console.error('Erro ao salvar assinatura:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Finalizar',
        message: 'Ocorreu um erro ao tentar salvar a assinatura. Verifique sua conexão.',
        type: 'error'
      });
    }
  }, [selectedUnit, filteredAssetsByUnit, user, bulkUpdateAssets, popScreen]);
  
  const fullCompaniesWithStatus = useMemo(() => {
    const userTenant = user?.tenantid || '';
    const userUnits = user?.units || (userTenant ? [userTenant] : []);
    const isAuditor = user?.role === UserRole.AUDITOR || user?.role === UserRole.AUXILIARY_AUDITOR;
    const assets = inventory.assets;
    
    if (assets.length === 0) {
      console.log('>>> [fullCompaniesWithStatus] Inventory assets is empty.');
    } else {
      console.log(`>>> [fullCompaniesWithStatus] Processing ${assets.length} assets.`);
    }

    if (inventory.companies && inventory.companies.length > 0) {
      console.log(`>>> [fullCompaniesWithStatus] Inventory companies: ${JSON.stringify(inventory.companies)}`);
    } else {
      console.log('>>> [fullCompaniesWithStatus] Inventory companies is empty.');
    }

    // 1. Agrupar estatísticas e campanhas por empresa em um único loop O(N)
    // Isso evita loops aninhados que causavam travamentos com grandes volumes de dados
    const companyStatsMap = new Map<string, { hasData: boolean; hasActiveAssets: boolean; unitIds: Set<string>; hasAssetCampaign: boolean }>();
    
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const company = getAssetUnit(a).replace(/_/g, ' ');
      if (!company) continue;
      
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

      if (!stats.hasAssetCampaign && !!a._campaignId) {
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
      console.log(`>>> [App] GPS Configs: ${unitConfigs.length}, Units with GPS: ${Array.from(unitsWithGps).join(', ')}`);
    }

    // 2. Definir a lista base de empresas
    const baseCompaniesSet = new Set<string>();
    if (inventory.companies) {
      inventory.companies.forEach(c => baseCompaniesSet.add(c.toUpperCase().replace(/_/g, ' ').trim()));
    }
    for (const c of companyStatsMap.keys()) baseCompaniesSet.add(c);
    
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email.toLowerCase() === ADMIN_EMAIL;
    
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
      if (!rawName) return;
      
      const norm = normalizeKey(rawName);
      if (!norm) return;

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

    const result = Array.from(mergedCompanies.values()).map(unit => {
      const norm = normalizeKey(unit.name);
      const hasDirectCampaign = unitsWithDirectCampaign.has(norm);
      const hasGps = unitsWithGps.has(norm);

      return {
        name: unit.name,
        hasData: unit.hasData,
        hasActiveAssets: unit.hasActiveAssets,
        hasCampaign: hasDirectCampaign, // Stricter governance: only ACTIVE campaign in table enables button
        hasGps
      };
    });

    // REGRA DE OURO v25.01: Se o banco físico carregou ativos (assets.length > 0) mas a lista 
    // de empresas resultou vazia (talvez por filtro de permissão equivocado), forçamos
    // a inclusão de todas as unidades encontradas nos ativos para evitar o bloqueio do app.
    if (result.length === 0 && assets.length > 0) {
      console.warn('>>> [fullCompaniesWithStatus] CRITICAL: Assets exist but no units were extracted! Applying EMERGENCY extraction.');
      const emergencyUnits = new Set<string>();
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const company = (a.UNIDADE_OPERACIONAL || a.UNIDADE || a._unitid || '').toString().trim().toUpperCase();
        if (company && company !== 'DEFAULT' && company !== 'NULL' && company !== '0') {
          emergencyUnits.add(company.replace(/_/g, ' '));
        }
      }
      
      if (emergencyUnits.size > 0) {
        return Array.from(emergencyUnits).map(name => ({
          name,
          hasData: true,
          hasActiveAssets: true,
          hasCampaign: false,
          hasGps: false
        }));
      }
    }

    console.log(`>>> [fullCompaniesWithStatus] Total units calculated: ${result.length}`);
    return result;
  }, [inventory.companies, inventory.assets, inventory.databaseMode, normalizeKey, user, UserRole.AUDITOR, UserRole.AUXILIARY_AUDITOR, campaigns, unitConfigs, refreshVersion]);

  const unitNames = useMemo(() => fullCompaniesWithStatus.map(c => c.name), [fullCompaniesWithStatus]);

  const unitsByTenant = useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    // 1. De Ativos (Fonte mais confiável de relação: UNIDADE_OPERACIONAL real)
    inventory.assets.forEach(a => {
      const t = (a.GRUPO_EMPRESARIAL || a._tenantid || '').toUpperCase();
      const u = a.UNIDADE_OPERACIONAL; // Usar apenas a unidade operacional real da base
      
      if (u && u.toUpperCase() !== 'DEFAULT' && u.toUpperCase() !== 'NULL' && u !== '0') {
        if (!map.has(t)) map.set(t, new Set());
        map.get(t)!.add(u);
      }
    });

    // 2. De Usuários (Apenas para garantir que unidades já atribuídas apareçam, se forem válidas)
    users.forEach(u => {
      const t = (u.tenantid || '').toUpperCase();
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
    const fromAssets = inventory.assets.map(a => a._unitid || a._tenantid).filter(Boolean);
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

  // Monitoramento de Estado Inicial e Redirecionamento de Segurança (v2.6.2)
  useEffect(() => {
    // SOBERANIA: Precisamos garantir que o Admin passe pela tela de carga se o banco SQL não estiver ACTIVE,
    // mesmo que existam dados no cache (isEmpty pode ser falso mas o banco físico pode estar vazio ou offline).
    const isPhysicalEmpty = sqliteStatus !== 'ACTIVE';
    const isEmpty = inventory.assets.length === 0 || fullCompaniesWithStatus.length === 0;
    const isTrulyEmpty = (isEmpty || (databaseMode === DatabaseMode.INTERNAL && isPhysicalEmpty)) && isAdmin;
    
    // Agora monitoramos tanto UNIT_SELECTION quanto MODULE_SELECTION para o Admin
    const isMainLanding = screen === AppScreen.UNIT_SELECTION || screen === AppScreen.MODULE_SELECTION;
    
    if (isMainLanding && isTrulyEmpty && !isSyncing && isDataLoaded) {
      // Evita loop: utiliza sessionStorage para persistir o bloqueio mesmo após refresh ou pop
      const hasJustFinishedLoad = sessionStorage.getItem('app_just_finished_load') === 'true';
      if (hasJustFinishedLoad) {
        console.log('>>> [LoopGuard] Redirecionamento ignorado: Carga acabara de ser concluída.');
        return;
      }

      console.warn(">>> [Governance] SOBERANIA: Banco SQL não ativado ou Vazio. Redirecionando para Carga de Dados.");
      pushScreen(AppScreen.LOAD_DATABASE);
    }
  }, [screen, selectedUnit, sqliteStatus, inventory.assets.length, fullCompaniesWithStatus.length, databaseMode, isAdmin, isSyncing, isDataLoaded, pushScreen]);

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

  const showCompanyHeader = !!selectedUnit && 
    screen !== AppScreen.LOGIN && 
    screen !== AppScreen.REGISTER && 
    screen !== AppScreen.UNIT_SELECTION && 
    screen !== AppScreen.MAIN_MENU &&
    screen !== AppScreen.INVENTORY &&
    screen !== AppScreen.ASSET_DETAIL &&
    screen !== AppScreen.LABELING;
  
  console.log("App render - screen:", screen, "selectedUnit:", selectedUnit, "hasCompletedOnboarding:", inventory.hasCompletedOnboarding, "hasAcceptedTerms:", hasAcceptedTerms);

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
      <div className="w-full h-full min-h-[100dvh] bg-bg-main overflow-hidden relative font-sans max-w-full flex flex-col safe-area-p">
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
               
               <div className="flex items-center space-x-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <div 
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg border transition-all ${isSafeMode ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600'}`} 
                    title={isSafeMode ? "Banco de Dados Protegido" : `Ameaças Detectadas: ${securityThreats.join(', ')}`}
                  >
                    <ShieldCheck size={10} />
                    <span className="text-[7px] font-black uppercase tracking-widest">{isSafeMode ? 'SAFE' : 'RISK'}</span>
                  </div>
                  <div className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-600">
                    <span className="text-[7px] font-bold uppercase tracking-[0.1em]">Native v2.6</span>
                  </div>
                  <div 
                    onClick={() => setIsAIAssistantOpen(true)}
                    className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center space-x-1 cursor-pointer hover:bg-indigo-100 transition-all text-indigo-600"
                  >
                    <ShieldCheck size={10} />
                    <span className="text-[7px] font-black uppercase tracking-widest">Sovereign</span>
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
        )}
        
        <div className="flex-1 relative overflow-y-auto z-[500] no-scrollbar">
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

      {showRecoveryToast && (
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
          {screen === AppScreen.LOGIN && (
            <Login 
              users={users} 
              databaseMode={databaseMode}
              isDatabaseEmpty={inventory.assets.length === 0}
              isKeyboardVisible={isKeyboardVisible}
              onOpenPrivacyCenter={() => setIsPrivacyCenterOpen(true)}
              onUpdateScreen={(s) => setHistory([s])}
              onShowModal={(config) => setModalConfig((prev: ModalConfig) => ({ ...prev, ...config, isOpen: true }))}
              onLogin={async (u) => { 
                setUser(u); 
                localStorage.setItem('app_current_user', safeStringify(u));
                
                if (u.mustChangePassword) { 
                  pushScreen(AppScreen.CHANGE_PASSWORD); 
                } else { 
                  // Se for ADMIN, vai para seleção de módulo
                  // Se for AUDITOR, vai para seleção de unidade (empresa)
                  const isAdmin = u.role === UserRole.ADMIN || u.role === UserRole.MASTER || u.isAdmin || u.email.toLowerCase() === ADMIN_EMAIL;
                  if (isAdmin) {
                    pushScreen(AppScreen.MODULE_SELECTION); 
                  } else {
                    pushScreen(AppScreen.UNIT_SELECTION);
                  }
                }

                // Oferecer registro de biometria se suportado e ainda não registrado
                const bioSupported = await isBiometricSupported();
                if (bioSupported) {
                  const username = (u.username || u.email || '').toLowerCase();
                  if (username) {
                    const alreadyRegistered = await hasBiometricRegistered(username);
                    if (!alreadyRegistered) {
                      pushScreen(AppScreen.BIOMETRIC_REGISTRATION);
                    }
                  }
                }
              }} 
            />
          )}
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
          {screen === AppScreen.MAIN_MENU && (
            <MainMenu 
              onOpenHelp={() => setIsHelpMenuOpen(true)}
              onNavigate={pushScreen} 
              onLogout={() => { 
                // Agora "Sair" do menu principal volta para a seleção de unidade
                setSelectedUnit(null); 
                setStartWithDataMenu(false);
                pushScreen(AppScreen.UNIT_SELECTION); 
              }} 
              onExport={handleExport} 
              onBackup={handleBackup}
              onRestore={handleRestore}
              onClearDatabase={handleClearDatabase} 
              onClearMultipleUnits={handleClearMultipleCompanies}
              showModal={showModal}
              user={user} 
              units={fullCompaniesWithStatus.map(c => ({ name: c.name, hasData: c.hasData }))}
              databaseMode={databaseMode}
              inventoryInfo={{ 
                count: filteredAssetsByUnit.length, 
                totalDatabase: selectedUnit ? filteredAssetsByUnit.length : inventory.assets.length, 
                date: inventory.lastUpdated 
              }} 
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
              deletedAssetsCount={inventory.assets.filter(a => a._is_deleted).length}
              impairmentAssetsCount={inventory.assets.filter(a => Number(a._perda_impairment || 0) > 0 && !a._is_deleted).length}
              excludedAccounts={inventory.excludedAccounts}
              onUpdateExcludedAccounts={(accounts) => {
                localStorage.setItem('app_excluded_accounts', safeStringify(accounts));
                updateConfig({ excludedAccounts: accounts });
              }}
              protheusIntegrationEnabled={inventory.protheusIntegrationEnabled || false}
              onUpdateProtheusIntegration={(val) => {
                localStorage.setItem('app_protheus_enabled', String(val));
                updateConfig({ protheusIntegrationEnabled: val });
              }}
              protheusApiUrl={inventory.protheusApiUrl || ''}
              onUpdateProtheusApiUrl={(val) => {
                localStorage.setItem('app_protheus_url', val);
                updateConfig({ protheusApiUrl: val });
              }}
              onResetGPS={handleResetGPS}
              onToggleGpsBypass={handleToggleGpsBypass}
              isGpsBypassed={localStorage.getItem('gbr_gps_bypass') === 'true'}
              onCheckIntegrity={handleCheckIntegrity}
              isAIAssistantOpen={isAIAssistantOpen}
              setIsAIAssistantOpen={setIsAIAssistantOpen}
              campaignsCount={campaigns.length}
              sqliteStatus={sqliteStatus}
            />
          )}
          {screen === AppScreen.LOAD_DATABASE && (
            (isAdmin || bootError) ? (
              <DatabaseLoader 
                onOpenHelp={() => setIsHelpMenuOpen(true)}
                onBack={popScreen} 
                isSyncing={isSyncing}
                excludedAccounts={inventory.excludedAccounts}
                campaigns={campaigns}
                user={user}
                databaseMode={databaseMode}
                showModal={showModal}
                onRestore={(state) => {
                  setInventory(state);
                  popScreen();
                }}
                onClearDatabase={handleClearDatabase}
                onDataLoaded={handleDataLoaded} 
              />
            ) : (

              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <ShieldAlert size={48} className="text-red-500 mb-4" />
                <p className="text-ink-muted uppercase font-black tracking-widest mb-2">Acesso Restrito</p>
                <p className="text-[10px] text-ink-muted uppercase font-bold mb-6">Você não tem permissão para acessar esta área.</p>
                <button 
                  onClick={() => pushScreen(AppScreen.UNIT_SELECTION)}
                  className="px-6 py-3 bg-accent text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all"
                >
                  Voltar para Seleção
                </button>
              </div>
            )
          )}
          {screen === AppScreen.INVENTORY && (
            <GPSComplianceGuard 
              userRole={user?.role} 
              unitConfig={currentUnitConfig}
              isFieldMode={isFieldMode}
            >
              {isSyncLocked ? (
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
                <Inventory 
                  isLoading={isLoading}
                  isOCRProcessing={isOCRProcessing}
                  setIsOCRProcessing={setIsOCRProcessing}
                  assets={inventoryLocation ? filteredAssetsByLocation : filteredAssetsByUnit} 
                  allAssets={inventory.assets} 
                  onBack={popScreen} 
                  onUpdateAsset={updateAsset} 
                  onBulkUpdateAssets={bulkUpdateAssets} 
                  onSelectAsset={handleSelectAsset} 
                  selectedLocation={inventoryLocation} 
                  setSelectedLocation={setInventoryLocation} 
                  isInventorying={isInventorying} 
                  setIsInventorying={setIsInventorying} 
                  selectedUnit={selectedUnit} 
                  onAddNewLocation={addNewLocation} 
                  locationsWithStats={locationsWithStats} 
                  scannerMode={inventory.scannerMode || ScannerMode.BARCODE} 
                  onUpdateScannerMode={handleUpdateScannerMode} 
                  searchMode={inventory.inventorySearchMode || InventorySearchMode.MANUAL} 
                  onUpdateSearchMode={handleUpdateSearchMode} 
                  autoConfirmOnScan={inventory.autoConfirmOnScan || false} 
                  scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} 
                  onOpenConsultation={() => { setIsConsultationFromInventory(true); pushScreen(AppScreen.CONSULTATION); }} 
                  onOpenSignature={() => pushScreen(AppScreen.SIGNATURE)}
                  inventorySearchValue={inventorySearchValue} 
                  clearInventorySearchValue={() => setInventorySearchValue(null)} 
                  immersiveMode={inventory.immersiveMode || false} 
                  onToggleFullscreen={toggleFullscreen}
                  batterySaver={inventory.batterySaver || false}
                  databaseMode={inventory.databaseMode}
                  user={user}
                  currentCampaignId={currentCampaignId || undefined}
                  unitConfig={currentUnitConfig}
                  onUpdateUnitConfig={handleUpdateUnitConfig}
                />
              )}
            </GPSComplianceGuard>
          )}
          {screen === AppScreen.LABELING && (
            <GPSComplianceGuard 
              userRole={user?.role}
              isFieldMode={isFieldMode}
            >
              <Labeling assets={filteredAssetsByUnit} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} uniqueCentrosDeCusto={uniqueCentrosDeCusto} scannerMode={inventory.scannerMode || ScannerMode.BARCODE} onUpdateScannerMode={handleUpdateScannerMode} scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} />
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
              isOCRProcessing={isOCRProcessing}
              setIsOCRProcessing={setIsOCRProcessing}
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
              tenantid={user?.tenantid || ''}
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
              onBack={popScreen}
              onSelectAsset={(asset) => {
                setSelectedAssets([asset]);
                pushScreen(AppScreen.ASSET_DETAIL);
              }}
            />
          )}
          {screen === AppScreen.DATABASE_MANAGER && (
            <DatabaseLoader 
              onBack={popScreen} 
              databaseMode={databaseMode}
              user={user}
              onOpenHelp={() => setIsHelpMenuOpen(true)}
              showModal={(title, message, type) => setModalConfig({ 
                isOpen: true, title, message, type, 
                showCancel: false, confirmText: 'OK' 
              })}
              campaigns={campaigns}
              excludedAccounts={inventory.excludedAccounts}
              isSyncing={isSyncing}
              onRestore={(state) => {
                setInventory(state);
                popScreen();
              }}
              onClearDatabase={handleClearDatabase}
              onDataLoaded={handleDataLoaded} 
            />
          )}
          {screen === AppScreen.SIGNATURE && (
            <Signature 
              assets={filteredAssetsByUnit.filter(a => a._conferido)}
              onBack={popScreen}
              onConfirm={handleSignatureConfirm}
              unitName={selectedUnit || ''}
            />
          )}
          {screen === AppScreen.UNIT_SELECTION && (
            <UnitSelector 
              isAdmin={user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email.toLowerCase() === ADMIN_EMAIL}
              onLoadDatabase={() => pushScreen(AppScreen.LOAD_DATABASE)}
              databaseMode={databaseMode}
              units={fullCompaniesWithStatus
                .filter(c => {
                  // Regra de Visualização: Admin e Audidtor veem as unidades autorizadas
                  // Se estiver no modo nuvem, mostramos todas para permitir o primeiro sync
                  // No modo local, mostramos todas as unidades encontradas na base
                  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email.toLowerCase() === ADMIN_EMAIL;
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
                  name: c.name, 
                  // No modo nuvem, permitimos selecionar mesmo se não houver dados locais ainda
                  hasData: databaseMode !== DatabaseMode.INTERNAL ? true : c.hasActiveAssets,
                  isDownloaded: downloadedUnits.includes(c.name),
                  hasCampaign: c.hasCampaign,
                  hasGps: c.hasGps
                }))
              } 
              onSelect={async (u) => { 
                // 1. Validação de Âncora (GPS) - Entrada no Perímetro da Unidade
                const config = inventory.unitConfigs[u];
                const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email.toLowerCase() === 'semorr@gmail.com';
                
                // Ignora validação rigorosa se for Admin em modo dev ou se a unidade não tiver GPS configurado
                if (config && config.lat && config.lng && !isFieldMode && !isAdmin) {
                  try {
                    setIsLoading(true);
                    console.log(`>>> [GPS] Validando perímetro para unidade: ${u}`);
                    const currentPos = await getCurrentLocation(true);
                    const isValid = indoorNavigation.validatePerimeter(currentPos, { lat: config.lat, lng: config.lng });
                    
                    if (!isValid) {
                      alert(`BLOQUEIO DE SEGURANÇA: Você está fora do perímetro autorizado para a unidade ${u}.\n\nPresença física obrigatória para iniciar o inventário.`);
                      setIsLoading(false);
                      return;
                    }
                    
                    // Sucesso: Define a Âncora e inicia o sistema de odometria indoor
                    indoorNavigation.setAnchor({ lat: config.lat, lng: config.lng });
                    indoorNavigation.startTracking();
                    
                    // Token de Sessão Offline (Validade 12h)
                    const sessionToken = `session_${u}_${Date.now()}`;
                    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
                    await sqliteService.execute('INSERT OR REPLACE INTO session_tokens (unit_id, token, expires_at) VALUES (?, ?, ?)', [u, sessionToken, expiresAt]);
                    
                    console.log('>>> [INDOOR] Sessão validada e âncora ativada.');
                  } catch {
                    alert('GPS OBRIGATÓRIO: Não conseguimos validar sua posição. Verifique se o GPS está ligado.');
                    setIsLoading(false);
                    return;
                  } finally {
                    setIsLoading(false);
                  }
                } else if (config && config.lat && config.lng) {
                   // Se for admin ou field mode, apenas seta a âncora sem bloquear
                   indoorNavigation.setAnchor({ lat: config.lat, lng: config.lng });
                   indoorNavigation.startTracking();
                }

                setSelectedUnit(u); 
                setIsInventorying(false); 
                setInventoryLocation(null); 
                sessionStorage.removeItem('app_just_finished_load');
                
                /* syncFromCloud removed */
                
                pushScreen(AppScreen.MAIN_MENU); 
              }} 
              onDownload={handleDownloadUnit}
              onBack={async () => { 
                const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email.toLowerCase() === ADMIN_EMAIL;
                if (isAdmin) {
                  setCurrentModule(null);
                  localStorage.removeItem('app_current_module');
                  pushScreen(AppScreen.MODULE_SELECTION);
                } else {
                  setUser(null); 
                  setSelectedUnit(null); 
                  pushScreen(AppScreen.LOGIN); 
                }
              }} 
              onSync={() => {}}
              isSyncing={false}
              lastSyncTime={lastSyncTime}
              onConfigGPS={(u) => {
                setSelectedUnit(u);
                pushScreen(AppScreen.UNIT_CONFIGURATOR);
              }}
              onCampaigns={(u) => {
                setSelectedUnit(u);
                pushScreen(AppScreen.CAMPAIGN_MANAGEMENT);
              }}
            />
          )}
          {screen === AppScreen.UNIT_CONFIGURATOR && user && (
            <UnitConfigurator 
              user={user}
              units={unitNames}
              onBack={popScreen}
              onUpdateConfigs={handleUpdateUnitConfigs}
              initialUnit={selectedUnit}
            />
          )}
          {screen === AppScreen.DASHBOARD && (
            <Dashboard 
              assets={filteredAssetsByUnit} 
              allAssets={inventory.assets}
              currentCampaignId={currentCampaignId || undefined}
              onBack={popScreen} 
              onOpenActiveSearch={() => pushScreen(AppScreen.ACTIVE_SEARCH)}
              user={user}
            />
          )}
          {screen === AppScreen.ASSET_MAP && (
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
              onOpenDatabaseManager={() => pushScreen(AppScreen.DATABASE_MANAGER)}
              onLogout={async () => {
                setUser(null);
                setCurrentModule(null);
                localStorage.removeItem('app_current_module');
                pushScreen(AppScreen.LOGIN);
              }}
              onSelect={(module) => {
                setCurrentModule(module);
                localStorage.setItem('app_current_module', module);
                if (module === AppModule.INVENTORY) {
                  const isSystemAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL;
                  const isEmpty = inventory.assets.length === 0 || fullCompaniesWithStatus.length === 0;
                  if (isEmpty && isSystemAdmin) {
                    pushScreen(AppScreen.LOAD_DATABASE);
                  } else {
                    pushScreen(AppScreen.UNIT_SELECTION);
                  }
                } else {
                  pushScreen(AppScreen.ASSET_CONTROL_HOME);
                }
              }}
            />
          )}
          {screen === AppScreen.ASSET_CONTROL_HOME && (
            <AssetControlModule 
              username={user?.username || ''}
              tenantid={user?.tenantid || ''}
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
          {screen === AppScreen.AUDIT_LOGS && <AuditLogs user={user} onBack={popScreen} databaseMode={databaseMode} />}
          {screen === AppScreen.CAMPAIGN_MANAGEMENT && (
            <CampaignManager 
              user={user} 
              onBack={popScreen} 
              onActivate={handleActivateCampaign}
              currentCampaignId={currentCampaignId || undefined}
              availableUnits={fullCompaniesWithStatus.map(c => c.name)}
              campaigns={campaigns}
              onRefresh={refreshCampaigns}
              initialUnit={selectedUnit}
              tenantId={currentTenantId}
              unitId={currentUnitId}
              databaseMode={databaseMode}
            />
          )}
          {screen === AppScreen.GLOBAL_PERFORMANCE && <GlobalPerformance assets={filteredAssetsByUnit} campaigns={campaigns} onBack={popScreen} />}
          {screen === AppScreen.ACCOUNT_RECONCILIATION && <AccountReconciliation assets={filteredAssetsByUnit} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} />}
          {screen === AppScreen.SYNC_MANAGER && (
            <SyncManager 
              onBack={popScreen} 
              onSyncSuccess={async () => {
                const items = await getPendingSyncItems();
                setSyncQueueLength(items.length);
              }}
              isFieldMode={isFieldMode}
              onToggleFieldMode={toggleFieldMode}
            />
          )}
          {screen === AppScreen.ONBOARDING && (
            <OnboardingWizard onComplete={completeOnboarding} onCancel={popScreen} />
          )}
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
        {databaseMode === DatabaseMode.INTERNAL && (screen !== AppScreen.LOGIN || fileStatus?.status === 'expired') && !isKeyboardVisible && (
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
              
              <div className="flex flex-col min-w-[120px]">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none text-white flex items-center gap-3 line-clamp-1">
                  {sqliteStatus === 'ACTIVE' && sqliteService.getStorageSource() === 'PHYSICAL' ? 'ARMAZENAMENTO FÍSICO ATIVO' : 
                   sqliteStatus === 'LOADED' && sqliteService.getStorageSource() === 'PHYSICAL' ? 'SOBERANIA ATIVA (AGUARDANDO)' :
                   sqliteService.getStorageSource() === 'PHYSICAL' ? 'FÍSICO CONECTADO' :
                   sqliteService.getStorageSource() === 'CACHE' ? 'BANCO PERSISTENTE' : 'MEMÓRIA VOLÁTIL'}
                  {(sqliteService.getStorageSource() === 'PHYSICAL' || sqliteService.getStorageSource() === 'CACHE') && (
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  )}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[7px] font-bold text-white/50 uppercase tracking-tighter truncate max-w-[120px]">
                    {sqliteService.getLastDiscWrite() ? `Última escrita: ${sqliteService.getLastDiscWrite()}` : 'Pronto para Auditoria'}
                  </span>
                </div>

                {sqliteService.getNativePath() && (
                  <div className="flex items-center gap-1 overflow-hidden mt-0.5 border-t border-white/5 pt-1">
                    <Database size={6} className="text-emerald-400/60" />
                    <span className="text-[6px] font-mono text-emerald-400 truncate max-w-[150px] opacity-80">
                      {sqliteService.getNativePath()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {lastLocalSave && (
              <div className="ml-2 pl-3 border-l border-white/10 flex flex-col">
                 <span className="text-[7px] font-black text-white/40 uppercase tracking-widest leading-none">Gravado</span>
                 <span className="text-[8px] font-bold text-green-400 uppercase tracking-tighter mt-0.5">
                   {new Date(lastLocalSave).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                 </span>
              </div>
            )}
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
            Processando Local
          </h3>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest animate-pulse">
            Aguarde, atualizando base local...
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
