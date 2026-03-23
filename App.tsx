
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { startSecurityMonitor, checkRuntimeIntegrity } from './services/securityService';
import { AppModule, AppScreen, User, Asset, InventoryState, DatabaseStatus, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, DatabaseMode, SearchFilters, UserRole, AuditLogEntry, TransactionOrigin } from './types';
import Modal from './components/Modal';
import Login from './components/Login';
import Register from './components/Register';
import MainMenu from './components/MainMenu';
import DatabaseLoader from './components/DatabaseLoader';
import AssetDetail from './components/AssetDetail';
import Inventory from './components/Inventory';
import Labeling from './components/Labeling'; 
import Signature from './components/Signature';
import { getCurrentLocation } from './utils/gpsUtils';
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
import TrustOnboarding from './components/TrustOnboarding';
import AuditLogs from './components/AuditLogs';
import CampaignManager from './components/CampaignManager';
import FloatingHelp from './components/FloatingHelp';
import PrivacyCenter from './components/PrivacyCenter';

import { motion } from 'motion/react';
import { Building2, ShieldCheck, Cloud, Loader2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveInventory, loadInventory, clearInventory, clearMultipleInventories, backupInventory, restoreInventory } from './services/persistenceService';
import { Session } from '@supabase/supabase-js';
import { getAssetByTag, fetchFullInventory, clearCloudInventory, subscribeToInventoryChanges, subscribeToAssetChanges, syncAssetsToCloud, syncConfigToCloud, syncUsersToCloud, fetchUsersFromCloud, supabase, ensureUserProfile } from './services/supabaseService';
import { getPendingSyncItems, processSyncQueue } from './services/syncService';

const ADMIN_EMAIL = "semorr@gmail.com";

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
          <div className="w-20 h-20 bg-white border border-border rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-red-500/10 overflow-hidden p-1">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const logoFallback = document.createElement('img');
                logoFallback.src = 'https://picsum.photos/seed/gbr/200/200';
                logoFallback.className = 'w-full h-full object-contain';
                e.currentTarget.parentElement?.appendChild(logoFallback);
              }}
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

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('app_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(() => {
    return localStorage.getItem('app_accepted_terms') === 'true';
  });

  const [showOnboardingTips, setShowOnboardingTips] = useState<boolean>(() => {
    return localStorage.getItem('app_show_onboarding') !== 'false';
  });

  const [isPrivacyCenterOpen, setIsPrivacyCenterOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(true);
  const [securityThreats, setSecurityThreats] = useState<string[]>([]);
  const [syncQueueLength, setSyncQueueLength] = useState(0);

  // Monitor de Sincronização Offline
  useEffect(() => {
    const checkSyncQueue = async () => {
      const { getSyncQueueLength } = await import('./services/syncService');
      const len = await getSyncQueueLength();
      setSyncQueueLength(len);
    };

    checkSyncQueue();
    const interval = setInterval(checkSyncQueue, 10000); // Check every 10s

    const handleSynced = () => checkSyncQueue();
    window.addEventListener('gbr_photo_synced', handleSynced);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gbr_photo_synced', handleSynced);
    };
  }, []);

  const [, setCurrentModule] = useState<AppModule | null>(() => {
    const saved = localStorage.getItem('app_current_module');
    return (saved as AppModule) || null;
  });

  // Monitor de Segurança e Integridade (Blindagem Técnica)
  useEffect(() => {
    // Check inicial
    const initialCheck = checkRuntimeIntegrity();
    if (!initialCheck.isSafe) {
      setIsSafeMode(false);
      setSecurityThreats(initialCheck.threats);
    }

    // Monitor contínuo
    const monitorId = startSecurityMonitor((threats) => {
      setIsSafeMode(false);
      setSecurityThreats(threats);
      
      // Se detectar debugger ou scripts maliciosos, forçamos logout por segurança
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



  const [history, setHistory] = useState<AppScreen[]>(() => {
    try {
      const saved = localStorage.getItem('app_screen_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [AppScreen.LOGIN];
      }
      return [AppScreen.LOGIN];
    } catch { return [AppScreen.LOGIN]; }
  });

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  const [selectedUnit, setSelectedUnit] = useState<string | null>(() => {
    return localStorage.getItem('app_selected_unit') || null;
  });

  const [isLoading, setIsLoading] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const [inventory, setInventory] = useState<InventoryState>({ 
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
    databaseMode: (localStorage.getItem('app_database_mode') as 'INTERNAL' | 'SUPABASE') || 'INTERNAL'
  });

  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(() => {
    try {
      const saved = localStorage.getItem('app_database_mode');
      if (saved) return saved as DatabaseMode;
      // Se houver configuração de Supabase, o padrão deve ser SUPABASE para facilitar para o auditor
      if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        return DatabaseMode.SUPABASE;
      }
      return DatabaseMode.INTERNAL;
    } catch { return DatabaseMode.INTERNAL; }
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showRecoveryToast, setShowRecoveryToast] = useState(false);
  const [isCloudUpdatePending, setIsCloudUpdatePending] = useState(false);
  const [pendingPhotosCount, setPendingPhotosCount] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyAssetsRef = useRef<Set<string>>(new Set());

  // Efeito para garantir que a lista de empresas esteja sempre populada a partir dos ativos se estiver vazia
  useEffect(() => {
    if (inventory.assets.length > 0 && (!inventory.companies || inventory.companies.length === 0)) {
      const extractedCompanies = Array.from(new Set(inventory.assets.map(a => (a.EMPRESA || '').trim().toUpperCase()))).filter(Boolean);
      if (extractedCompanies.length > 0) {
        setInventory(prev => ({ ...prev, companies: extractedCompanies }));
      }
    }
  }, [inventory.assets, inventory.companies]);

  const pushLocalChanges = useCallback(async (skipLoadingState = false) => {
    if (databaseMode === DatabaseMode.INTERNAL) return;
    
    const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
    if (!hasSupabase) return;

    const dirtyIds = Array.from(dirtyAssetsRef.current);
    if (dirtyIds.length === 0) return;

    const dirtyAssets = dirtyIds.map(id => inventory.assets.find(a => String(a.id) === id)).filter(Boolean) as Asset[];

    if (dirtyAssets.length > 0) {
      if (!skipLoadingState) setIsSyncing(true);
      try {
        // Sincroniza os ativos e ESPERA a conclusão (Push)
        await syncAssetsToCloud(dirtyAssets, user?.tenantId);
        
        // Sincroniza a config também para garantir que o timestamp suba
        const configToSync = { ...inventory };
        // @ts-expect-error - assets is removed for sync
        delete configToSync.assets;
        await syncConfigToCloud(configToSync as Omit<InventoryState, 'assets'>, user?.tenantId);

        dirtyAssetsRef.current.clear();
        setLastSyncTime(new Date().toISOString());
        setSyncError(null);
      } catch (err) {
        setSyncError('Erro ao enviar alterações locais');
        console.error('Push error:', err);
        throw err;
      } finally {
        if (!skipLoadingState) setIsSyncing(false);
      }
    }
  }, [databaseMode, inventory]);

  const syncFromCloud = useCallback(async (explicitTenantId?: string | string[], explicitMode?: DatabaseMode) => {
    const mode = explicitMode || databaseMode;
    if (mode === DatabaseMode.INTERNAL) return;
    
    const rawTenantId = explicitTenantId || user?.tenantId || 'default';
    const tenantId = Array.isArray(rawTenantId) ? rawTenantId : [rawTenantId];
    
    // Se não temos tenantId e estamos em modo nuvem, não faz sentido tentar sincronizar
    if (tenantId.length === 0) {
      console.log('Sincronização ignorada: Nenhum tenantId disponível.');
      return;
    }

    setIsSyncing(true);
    try {
      // 1. REGRA DE OURO: SINCRONISMO DE SAÍDA PRIMEIRO (AUDITOR -> SERVIDOR)
      await pushLocalChanges(true); 
      await processSyncQueue();
      
      const pendingItems = await getPendingSyncItems();
      setPendingPhotosCount(pendingItems.length);

      // 2. SINCRONISMO DE ENTRADA (SERVIDOR -> AUDITOR)
      // Passamos o tenantId e o unitId selecionado (se houver)
      const cloudData = await fetchFullInventory(tenantId, selectedUnit || undefined);
      if (cloudData && cloudData.assets && cloudData.assets.length > 0) {
        setInventory(prev => {
          // Se a config da nuvem não trouxer a lista de empresas, extraímos dos ativos
          const cloudCompanies = cloudData.config.companies || [];
          const extractedCompanies = Array.from(new Set(cloudData.assets.map(a => (a.EMPRESA || '').trim().toUpperCase()))).filter(Boolean);
          const finalCompanies = cloudCompanies.length > 0 ? cloudCompanies : extractedCompanies;

          const newState: InventoryState = {
            ...prev,
            ...cloudData.config,
            assets: cloudData.assets,
            companies: finalCompanies,
            status: DatabaseStatus.LOADED,
            lastUpdated: new Date().toISOString()
          };
          saveInventory(newState).catch(e => console.error('Erro ao salvar inventário sincronizado:', e));
          return newState;
        });
        setLastSyncTime(new Date().toISOString());
        setSyncError(null);
        setShowRecoveryToast(true);
        setTimeout(() => setShowRecoveryToast(false), 5000);
      } else {
        setLastSyncTime(new Date().toISOString());
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
      console.error('Erro ao sincronizar da nuvem:', error);
      setSyncError('Erro na conexão');
    } finally {
      setIsSyncing(false);
    }
  }, [databaseMode, user?.tenantId, inventory]);

  // Real-time Cloud Sync Listener
  useEffect(() => {
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
      setInventory(prev => ({
        ...prev,
        assets: prev.assets.map(a => String(a.id) === String(assetId) ? { ...a, _photoUrl: photoUrl } : a)
      }));
      updatePendingCount();
    };

    window.addEventListener('gbr_photo_synced', handlePhotoSynced);
    
    // Expose map opener for Dashboard
    (window as unknown as { onOpenMap: () => void }).onOpenMap = () => pushScreen(AppScreen.ASSET_MAP);

    // Check periodically
    const interval = setInterval(updatePendingCount, 10000);

    if (databaseMode === DatabaseMode.INTERNAL) return () => {
      window.removeEventListener('gbr_photo_synced', handlePhotoSynced);
      delete (window as unknown as { onOpenMap?: () => void }).onOpenMap;
      clearInterval(interval);
    };

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

    const assetSubscription = subscribeToAssetChanges(user?.tenants || user?.tenantId || 'default', (payload) => {
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
        saveInventory(newState).catch(e => console.error('Erro ao salvar inventário sincronizado em tempo real:', e));
        return newState;
      });
    });

    return () => {
      if (subscription) subscription.unsubscribe();
      if (assetSubscription) assetSubscription.unsubscribe();
    };
  }, [databaseMode, inventory.lastUpdated, user]);

  // Efeito para forçar sincronização se houver atualização pendente e o usuário for auditor
  useEffect(() => {
    if (isCloudUpdatePending && !user?.isAdmin && user?.email !== ADMIN_EMAIL) {
      setModalConfig({
        isOpen: true,
        title: 'Atualização do Banco de Dados',
        message: 'O Administrador realizou uma nova carga de dados. Para não perder seu trabalho, enviaremos suas alterações locais para a nuvem antes de baixar a nova base.',
        type: 'confirm',
        onConfirm: async () => {
          setIsCloudUpdatePending(false);
          try {
            // 1. Envia o que tiver de local primeiro
            await pushLocalChanges();
            // 2. Baixa a nova base
            await syncFromCloud();
          } catch (e) {
            console.error("Falha na sincronização segura:", e);
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
  }, [isCloudUpdatePending, user, syncFromCloud, pushLocalChanges]);

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
        DATAAQUSIC_START: '',
        DATAAQUSIC_END: '',
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
        DATAAQUSIC_START: '',
        DATAAQUSIC_END: '',
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

  // Apply theme class to body based on databaseMode and darkMode
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

  // Load inventory from IndexedDB on mount
  useEffect(() => {
    const init = async () => {
      let savedInventory: InventoryState | null = null;
      try {
        savedInventory = await loadInventory();
        const saved = savedInventory;
        
        // Se não houver dados locais e estivermos em modo nuvem, tenta sincronizar (apenas se houver usuário logado)
        if ((!saved || !saved.assets || saved.assets.length === 0) && databaseMode !== DatabaseMode.INTERNAL && user) {
          await syncFromCloud();
          return;
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
          setShowRecoveryToast(true);
          setTimeout(() => setShowRecoveryToast(false), 5000);
        } else {
          // Fallback to localStorage for migration
          const legacy = localStorage.getItem('inventory_data');
          if (legacy) {
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
              setShowRecoveryToast(true);
              setTimeout(() => setShowRecoveryToast(false), 5000);
            }
          }
        }
      } catch (e) { 
        console.error("Data load failed", e); 
      } finally {
        setIsDataLoaded(true);
        
        // @ts-expect-error - appStarted is a custom property for the loader fallback
        window.appStarted = true;
        // Remove o loader do index.html o mais rápido possível
        const loader = document.getElementById('app-loader');
        if (loader) {
          loader.classList.add('hidden');
          setTimeout(() => loader.remove(), 500);
        }

        // Verifica se há atualizações na nuvem logo após o carregamento inicial (em background)
        if (databaseMode !== DatabaseMode.INTERNAL) {
          try {
            const cloudData = await fetchFullInventory(user?.tenantId);
            if (cloudData && cloudData.config && cloudData.config.lastUpdated) {
              const cloudTime = new Date(cloudData.config.lastUpdated).getTime();
              const localTime = savedInventory?.lastUpdated ? new Date(savedInventory.lastUpdated).getTime() : 0;
              
              const isLocalEmpty = !savedInventory || !savedInventory.assets || savedInventory.assets.length === 0;

              // Se a base local estiver vazia e houver dados na nuvem, sincroniza AUTOMATICAMENTE
              if (isLocalEmpty && cloudData.assets && cloudData.assets.length > 0) {
                console.log('Base local vazia detectada. Sincronizando automaticamente com a nuvem...');
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
                setShowRecoveryToast(true);
                setTimeout(() => setShowRecoveryToast(false), 5000);
              } 
              // Se a base local estiver vazia E a nuvem também estiver vazia para este tenant
              else if (isLocalEmpty && (!cloudData.assets || cloudData.assets.length === 0)) {
                console.warn(`Nenhum dado encontrado na nuvem para a unidade: ${user?.tenantId}`);
                if (user?.tenantId === 'default') {
                  setSyncError(`Unidade 'default' sem dados. Verifique se o Tenant ID do usuário está correto.`);
                }
              }
              // Se não estiver vazia, mas a nuvem for mais nova, apenas avisa (comportamento atual)
              else if (cloudTime > localTime + 5000) {
                setIsCloudUpdatePending(true);
              }
            }
          } catch (err) {
            console.warn('Falha ao verificar atualizações na nuvem no início:', err);
          }
        }
      }
    };
    init();
  }, []);

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

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
      // 1. Tenta encontrar no inventário local primeiro (mais rápido)
      const foundLocal = inventory.assets.find(a => normalizeKey(a.ETIQUETA || "") === normalizeKey(etqParam));
      if (foundLocal) {
        setPublicAsset(foundLocal);
      } else {
        // 2. Se não estiver local, tenta buscar no Supabase (para novos usuários/dispositivos)
        getAssetByTag(etqParam, user?.tenantId).then(foundCloud => {
          if (foundCloud) {
            setPublicAsset(foundCloud);
          }
        });
      }
    }

    const currentScreen = history[history.length - 1] || AppScreen.LOGIN;

    // 1. If no user, must be at LOGIN or REGISTER
    if (!user && currentScreen !== AppScreen.LOGIN && currentScreen !== AppScreen.REGISTER) {
      setHistory([AppScreen.LOGIN]);
      return;
    }

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
          username: "ADMIN GBR", 
          name: "ADMINISTRADOR GBR",
          email: ADMIN_EMAIL, 
          password: "Glaucio@1970", 
          role: UserRole.ADMIN,
          isAdmin: true, 
          mustChangePassword: false 
        });
      } else if (userList[adminIndex].password === 'admin') {
        // Atualiza a senha se for a padrão antiga para facilitar o acesso do usuário
        userList[adminIndex].password = "Glaucio@1970";
        userList[adminIndex].mustChangePassword = false;
      }
      
      return userList;
    } catch { return []; }
  });

  // Sincronização automática de usuários com o Supabase e persistência local
  useEffect(() => {
    localStorage.setItem('app_users', JSON.stringify(users));
    
    if (users.length > 0 && databaseMode === DatabaseMode.SUPABASE) {
      const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (isAdmin) {
        syncUsersToCloud(users).catch(err => {
          console.warn('[Supabase] Falha na sincronização silenciosa de usuários:', err);
        });
      }
    }
  }, [users, databaseMode]);

  // Busca usuários da nuvem ao carregar para admins
  useEffect(() => {
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (isAdmin && databaseMode === DatabaseMode.SUPABASE && user?.email) {
      console.log("🔄 Buscando usuários da nuvem para sincronização...");
      // Se for MASTER, busca apenas do seu tenant. Se for ADMIN global, busca todos.
      const fetchTenantId = user.role === UserRole.MASTER ? user.tenantId : undefined;
      fetchUsersFromCloud(fetchTenantId).then(cloudUsers => {
        if (cloudUsers && cloudUsers.length > 0) {
          console.log(`✅ ${cloudUsers.length} usuários encontrados na nuvem.`);
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
      }).catch(err => {
        console.error("❌ Erro ao buscar usuários da nuvem:", err);
      });
    }
  }, [user?.email, databaseMode]);

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

  const normalizeKey = useCallback((s: string) => {
    return s.toString().toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }, []);

  const [manualLocations, setManualLocations] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_manual_locations');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const { locationsWithStats, allLocations, uniqueCentrosDeCusto } = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    const locationsSet = new Set<string>(manualLocations);
    const centrosDeCustoSet = new Set<string>();
    
    const currentCompKey = selectedUnit ? normalizeKey(selectedUnit) : '';
    
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      
      // Centro de Custo
      if (a.CENTRODECUSTO) {
        centrosDeCustoSet.add(String(a.CENTRODECUSTO).trim().toUpperCase());
      }

      const assetCompKey = normalizeKey(a.EMPRESA || a._unitId || a._tenantId || '');
      if (currentCompKey && assetCompKey !== currentCompKey) continue;

      const isConferido = !!a._conferido || String(a.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';
      const effectiveLoc = (isConferido && a._localMaster) ? a._localMaster : (a.ENDERECO || 'SEM LOCAL');
      const loc = String(effectiveLoc).trim().toUpperCase();
      if (loc) locationsSet.add(loc);

      const statusUpper = String(a.STATUS || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
      
      if (isBaixado && !isConferido) continue;

      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      
      if (!isBaixado) stats[loc].total++;
      
      if (isConferido) {
        stats[loc].checked++;
        if (isBaixado) stats[loc].total++;
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
    
    // 1. PRIORIDADE MÁXIMA: ETIQUETAGEM (REGRA DE OURO v24)
    // Se o item nasceu para ser etiquetado, o fato de ter sido etiquetado é a informação soberana.
    const originalEtq = normalizeKey(asset._plaquetaMaster || '');
    const needsLabel = originalEtq === 'ETIQUETAR';
    if (needsLabel) {
      return isConferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR;
    }

    // 2. BAIXADO (Se não conferido)
    if (isBaixado && !isConferido) return TagInventario.BAIXADO;
    
    // 3. ADOTADO EXTERNO (Empresa diferente)
    const assetCompKey = normalizeKey(asset.EMPRESA || asset._unitId || asset._tenantId || '');
    const currentCompKey = normalizeKey(selectedUnit || '');
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      return TagInventario.ADOTADO_EXTERNO;
    }

    // 4. NOVO ITEM
    if (asset._isNew || asset.TAG_INVENTARIO === TagInventario.NOVO_ITEM) return TagInventario.NOVO_ITEM;

    const targetLocKey = normalizeKey(targetLocation);
    const originalLocKey = normalizeKey(asset.ENDERECO || ""); 
    const currentAuditLocKey = asset._localMaster ? normalizeKey(asset._localMaster) : "";

    // 6) DIVERGÊNCIA: Etiqueta física difere do registro lógico
    const currentEtq = normalizeKey(asset.ETIQUETA || "");
    const masterEtq = normalizeKey(asset._plaquetaMaster || "");
    if (masterEtq !== "" && masterEtq !== "ETIQUETAR" && currentEtq !== masterEtq) {
      return TagInventario.DIVERGENCIA;
    }

    // 1) CONFERIDO: Localizado exatamente no ENDERECO original
    if (originalLocKey === targetLocKey) {
      return TagInventario.CONFERIDO;
    }

    // 3) RE-ADOTADO: Já conferido anteriormente em um local e agora encontrado em outro local
    if (asset._conferido && currentAuditLocKey !== "" && currentAuditLocKey !== targetLocKey) {
      return TagInventario.RE_ADOTADO;
    }

    // 2) ADOTADO: Localizado em endereço diferente do original
    return TagInventario.ADOTADO;
  }, [normalizeKey, selectedUnit]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (isDataLoaded) {
          const dirtyIds = Array.from(dirtyAssetsRef.current);
          const dirtyAssets = dirtyIds.map(id => inventory.assets.find(a => String(a.id) === id)).filter(Boolean) as Asset[];
          
          const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
          
          // Sincroniza se houver ativos sujos OU se a config mudou (lastUpdated mudou)
          if (hasSupabase && (dirtyAssets.length > 0 || inventory.lastUpdated !== lastSyncTime)) {
            setIsSyncing(true);
            try {
              await saveInventory(inventory, dirtyAssets);
              setLastSyncTime(new Date().toISOString());
              setSyncError(null);
            } catch (err) {
              setSyncError('Erro na sincronização');
              console.error('Sync error:', err);
            } finally {
              setIsSyncing(false);
            }
          } else {
            await saveInventory(inventory, dirtyAssets);
          }
          
          dirtyAssetsRef.current.clear();
        }
        localStorage.setItem('app_screen_history', JSON.stringify(history));
        localStorage.setItem('app_current_user', JSON.stringify(user));
        localStorage.setItem('app_users', JSON.stringify(users));
        localStorage.setItem('app_selected_unit', selectedUnit || '');
        localStorage.setItem('app_inventory_location', inventoryLocation || '');
        localStorage.setItem('app_is_inventorying', String(isInventorying));
        localStorage.setItem('app_consultation_filters', JSON.stringify(consultationFilters));
        localStorage.setItem('app_committed_consultation_filters', JSON.stringify(committedConsultationFilters));
        localStorage.setItem('app_dark_mode', String(inventory.darkMode || false));
        localStorage.setItem('app_battery_saver', String(inventory.batterySaver || false));
        localStorage.setItem('app_mandatory_photo_divergence', String(inventory.mandatoryPhotoOnDivergence || false));
        localStorage.setItem('app_mandatory_photo_new', String(inventory.mandatoryPhotoOnNewItem || false));
      } catch { console.warn("Storage cap reached"); }
    }, 2000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedUnit, inventoryLocation, isInventorying, isDataLoaded, consultationFilters, committedConsultationFilters]);

  const updateConfig = useCallback((updates: Partial<InventoryState>) => {
    setInventory(prev => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString()
    }));
  }, []);

  const pushScreen = useCallback((s: AppScreen) => {
    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) setHistory([s]);
    else setHistory(prev => [...prev, s]);
  }, []);

  // 1. Auth Listener para Supabase (Magic Link, Convites, Sessão)
  useEffect(() => {
    if (!supabase) return;

    // Função para processar o login a partir de uma sessão
    const processSession = async (session: Session) => {
      if (!session?.user) return;
      
      // Se já temos um usuário no estado e é o mesmo, não fazemos nada para evitar loop
      if (user && user.email === session.user.email) return;

      setIsLoading(true);
      try {
        // Garante que o usuário tenha um perfil na tabela user_permissions
        // Passamos os metadados para garantir que o tenantId e role sejam preservados
        const permissions = await ensureUserProfile(session.user.email!, session.user.user_metadata, session.user.id);
        
        const loggedUser: User = {
          username: session.user.user_metadata?.username || permissions.username || session.user.email?.split('@')[0] || 'Usuário',
          name: permissions.name || session.user.user_metadata?.name || permissions.username || session.user.email?.split('@')[0] || 'Usuário',
          email: session.user.email!,
          role: (permissions.role as UserRole) || (session.user.user_metadata?.role as UserRole) || UserRole.AUDITOR,
          isAdmin: !!permissions.isAdmin || session.user.user_metadata?.isAdmin === true,
          mustChangePassword: false,
          tenantId: permissions.tenantId || session.user.user_metadata?.tenantId || 'default',
          unitId: permissions.unitId || session.user.user_metadata?.unitId || permissions.tenantId || session.user.user_metadata?.tenantId || 'default',
          units: permissions.units || session.user.user_metadata?.units || [permissions.tenantId || session.user.user_metadata?.tenantId || 'default'],
          tenants: permissions.tenants || [permissions.tenantId || session.user.user_metadata?.tenantId || 'default']
        };

        // Atualiza estado global
        setUser(loggedUser);
        localStorage.setItem('app_current_user', JSON.stringify(loggedUser));
        
    // Se logou via Supabase, garante que o modo está correto
    setDatabaseMode(DatabaseMode.SUPABASE);
    localStorage.setItem('app_database_mode', DatabaseMode.SUPABASE);
    
    // Navega para a seleção de módulos
    pushScreen(AppScreen.MODULE_SELECTION);
    
    // Sincroniza dados da nuvem para este usuário (Tenant + Unit)
    syncFromCloud(loggedUser.tenantId, DatabaseMode.SUPABASE);
  } catch (err) {
        console.error('Erro ao processar login automático:', err);
        // Fallback: se falhar a busca de permissões, tenta logar com dados básicos do Auth
        const fallbackUser: User = {
          username: session.user.email?.split('@')[0] || 'Usuário',
          email: session.user.email!,
          role: UserRole.AUDITOR,
          isAdmin: false,
          mustChangePassword: false,
          tenantId: 'default',
          tenants: ['default']
        };
        setUser(fallbackUser);
        localStorage.setItem('app_current_user', JSON.stringify(fallbackUser));
        setDatabaseMode(DatabaseMode.SUPABASE);
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
        if (user && (errorCode === 'otp_expired' || errorDescription?.includes('expired'))) {
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) processSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[App] Evento de Autenticação Supabase:', event, session?.user?.email);
      
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        processSession(session);
      } else if (event === 'SIGNED_OUT') {
        // Limpa estado se deslogar no Supabase
        if (databaseMode !== DatabaseMode.INTERNAL) {
          setUser(null);
          localStorage.removeItem('app_current_user');
          setHistory([AppScreen.LOGIN]);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, databaseMode, user]); // Reduzido para evitar re-execuções desnecessárias

  const handleClearMultipleCompanies = async (companiesToClear: string[]) => {
    if (companiesToClear.length === 0) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
    
    // Backup de segurança antes da limpeza em massa
    const backupFileName = `GBR_MOBILE+KBP+LIMPEZA_MASSA+${dateStr}+${timeStr}`;
    await backupInventory(backupFileName);

    setIsSyncing(true);
    try {
      // 1. Limpa localmente todas as empresas selecionadas em uma única operação
      await clearMultipleInventories(companiesToClear);

      // 2. Se estiver no modo Supabase, limpa a nuvem também em uma única operação
      if (databaseMode === DatabaseMode.SUPABASE) {
        await clearCloudInventory(companiesToClear, user?.tenantId);
        
        // Atualiza o timestamp na nuvem - envolvemos em try/catch para não falhar a limpeza se apenas o log falhar
        try {
          const configToSync = { ...inventory };
          // @ts-expect-error - assets is removed for sync
          delete configToSync.assets;
          await syncConfigToCloud({ 
            ...configToSync, 
            lastUpdated: new Date().toISOString() 
          } as Omit<InventoryState, 'assets'>, user?.tenantId);
        } catch (syncErr) {
          console.warn('Limpeza concluída, mas falha ao atualizar timestamp na nuvem:', syncErr);
        }
      }

      // 3. Atualiza o estado local
      const normalizedToClear = companiesToClear.map(c => c.toUpperCase().trim());
      const remainingAssets = inventory.assets.filter(a => !normalizedToClear.includes((a.EMPRESA || '').toUpperCase().trim()));
      
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
        errorMessage = String(errObj.message || errObj.details || errObj.hint || JSON.stringify(error));
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

  const availableUnits = useMemo(() => {
    const fromAssets = inventory.assets.map(a => a._unitId || a._tenantId).filter(Boolean);
    const fromCompanies = inventory.companies.map(c => c.toLowerCase().replace(/\s/g, '_')).filter(Boolean);
    const fromUsers = users.flatMap(u => {
      const t = [];
      if (u.unitId) t.push(u.unitId);
      if (u.units) t.push(...u.units);
      return t;
    }).filter(Boolean);
    return Array.from(new Set([...fromAssets, ...fromCompanies, ...fromUsers])) as string[];
  }, [inventory.assets, inventory.companies, users]);

  const handleUpdateDatabaseMode = (mode: DatabaseMode) => {
    setDatabaseMode(mode);
    localStorage.setItem('app_database_mode', mode);
    
    // Se mudou para modo nuvem e está vazio, tenta sincronizar (apenas se houver usuário)
    if (mode !== DatabaseMode.INTERNAL && inventory.assets.length === 0 && user) {
      syncFromCloud();
    }
  };

  const [isGpsAvailable, setIsGpsAvailable] = useState<boolean | null>(null);

  // Verifica disponibilidade de GPS no início
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setIsGpsAvailable(result.state === 'granted');
        result.onchange = () => {
          setIsGpsAvailable(result.state === 'granted');
        };
      }).catch(() => {
        setIsGpsAvailable(null);
      });
    } else {
      setIsGpsAvailable(false);
    }
  }, []);

  const popScreen = () => {
    setHistory(prev => {
      const newHistory = prev.length > 1 ? prev.slice(0, -1) : [AppScreen.MAIN_MENU];
      const newScreen = newHistory[newHistory.length - 1];
      if (newScreen !== AppScreen.ASSET_DETAIL) {
        setSelectedAssets([]);
      }
      return newHistory;
    });
  };

  const commitAssetUpdate = useCallback((updatedAsset: Asset) => {
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

    setInventory(prev => {
      const newAssets = [...prev.assets];
      const index = newAssets.findIndex(a => String(a.id) === String(updatedAsset.id));
      
      const isReconciliationWorkflow = history.includes(AppScreen.ACCOUNT_RECONCILIATION);

      const targetLoc = isReconciliationWorkflow
        ? (updatedAsset.ENDERECO || "")
        : (inventoryLocation 
            ? inventoryLocation.toUpperCase().trim() 
            : (updatedAsset.ENDERECO || "").toString().toUpperCase().trim());
      
      const updates = { ...updatedAsset } as Asset;
      updates._conferido = true;
      updates._dataLeitura = new Date().toISOString();
      updates._auditor = user?.name || user?.username || user?.email || 'SISTEMA';
      updates._origemTransacao = origin; // Aplica o código fixo
      
      // Garantir que tenant e unit estão definidos
      if (!updates._tenantId) updates._tenantId = user?.tenantId || 'default';
      if (!updates._unitId) updates._unitId = user?.unitId || 'default';
      
      // Log de Auditoria
      const historyEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        user: user?.name || user?.username || user?.email || 'SISTEMA',
        action: index === -1 ? 'CREATE' : 'UPDATE',
        details: `Item ${index === -1 ? 'criado' : 'atualizado'} no local ${targetLoc} via ${currentScreen}`,
        tenantId: user?.tenantId || 'default',
        origin: origin // Aplica o código fixo no log
      };
      updates._history = [...(updates._history || []), historyEntry];
      
      const alteredFields = new Set<string>(updates._camposAlterados || []);
      
      const existingAsset = index !== -1 ? newAssets[index] : null;
      const originalValues = { ...(existingAsset?._valoresOriginais || {}) };

      if (existingAsset) {
        const wasLabelingCandidate = 
          String(existingAsset.ETIQUETA || '').toUpperCase().includes('ETIQUETAR') || 
          String(existingAsset._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' ||
          existingAsset.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR ||
          existingAsset._plaquetado === true;

        Object.keys(updates).forEach(key => {
          if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
          if (String(updates[key]) !== String(existingAsset[key])) {
            alteredFields.add(key);
            if (originalValues[key] === undefined) {
              originalValues[key] = existingAsset[key] as string | number | boolean | string[] | null | undefined;
            }
          }
        });

        if (wasLabelingCandidate) {
          updates._plaquetado = true;
        }
      }

      const targetLocNormalized = normalizeKey(String(targetLoc || ''));
      const existingLocNormalized = normalizeKey(String(existingAsset?.ENDERECO || ''));

      if (!isReconciliationWorkflow && existingLocNormalized !== targetLocNormalized) {
        alteredFields.add('ENDERECO');
        if (originalValues['ENDERECO'] === undefined && existingAsset) {
          originalValues['ENDERECO'] = existingAsset.ENDERECO;
        }
      }

      updates._valoresOriginais = originalValues;
      updates._localMaster = targetLoc;
      
      const hasChanges = alteredFields.size > 0;
      updates.DE_PARA = hasChanges ? 'COM ALTERAÇÃO' : 'SEM ALTERAÇÃO';
      
      updates.TAG_INVENTARIO = determineTag(updates, targetLoc);
      updates._camposAlterados = Array.from(alteredFields);
      
      if (index === -1) newAssets.push(updates);
      else newAssets[index] = updates;
      
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString(), status: DatabaseStatus.IN_USE };
    });
  }, [inventoryLocation, determineTag, normalizeKey, history]);

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
    if (updatedAsset._conferido) {
      try {
        // Tenta obter localização, mas não bloqueia se demorar muito
        // Usamos um timeout menor aqui para não travar a experiência de scan rápido
        const loc = await getCurrentLocation();
        assetWithGps._lat = loc.lat;
        assetWithGps._lng = loc.lng;
      } catch (e) {
        console.warn('GPS não capturado:', e);
        // Se falhar, mantemos os valores anteriores se existirem
      }
    }

    // Adiciona entrada na trilha de auditoria
    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      user: user?.email || 'unknown',
      action: 'UPDATE',
      details: `Alteração de campos: ${Object.keys(updatedAsset).filter(k => !k.startsWith('_')).join(', ')}`,
      tenantId: user?.tenantId,
      origin: updatedAsset._origemTransacao
    };
    
    const assetWithHistory = {
      ...assetWithGps,
      _history: [...(assetWithGps._history || []), auditEntry],
      _auditor: user?.email || assetWithGps._auditor,
      _dataLeitura: new Date().toISOString()
    };

    commitAssetUpdate(assetWithHistory);
  }, [inventory.assets, commitAssetUpdate, user]);

  const addNewLocation = (newLocation: string) => {
    const upperCaseLocation = newLocation.toUpperCase().trim();
    if (upperCaseLocation && !allLocations.includes(upperCaseLocation)) {
      setManualLocations(prev => {
        const next = [...prev, upperCaseLocation];
        localStorage.setItem('app_manual_locations', JSON.stringify(next));
        return next;
      });
    }
  };

  const bulkUpdateAssets = useCallback(async (ids: string[], manualUpdates?: Partial<Asset>) => {
    const idSet = new Set(ids.map(id => String(id)));
    ids.forEach(id => dirtyAssetsRef.current.add(String(id)));
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
      console.warn('GPS não capturado para lote:', e);
    }

    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { 
            ...a, 
            ...(manualUpdates || {}), 
            _lat: gpsCoords.lat, 
            _lng: gpsCoords.lng,
            _origemTransacao: origin // Aplica o código fixo
          };
          
          // Garantir que tenant e unit estão definidos
          if (!updates._tenantId) updates._tenantId = user?.tenantId || 'default';
          if (!updates._unitId) updates._unitId = user?.unitId || 'default';
          
          // Log de Auditoria para atualização em lote
          const historyEntry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            user: user?.name || user?.username || user?.email || 'SISTEMA',
            action: 'BULK_UPDATE',
            details: `Atualização em lote via ${currentScreen}: ${Object.keys(manualUpdates || {}).join(', ')}`,
            tenantId: user?.tenantId || 'default',
            origin: origin // Aplica o código fixo no log
          };
          updates._history = [...(updates._history || []), historyEntry];
          
          // REGRA DE OURO: Respeita o local do inventário se houver, senão mantém o do item (ou o manual)
          const targetLoc = isReconciliationWorkflow
            ? (a.ENDERECO || "")
            : (inventoryLocation 
                ? inventoryLocation.toUpperCase().trim() 
                : (updates.ENDERECO || "").toString().toUpperCase().trim());

          updates._conferido = true;
          updates._dataLeitura = new Date().toISOString();
          updates._auditor = user?.name || user?.username || user?.email || 'SISTEMA';
          
          // Se o item estava na condição de etiquetar (ou já foi etiquetado nesta sessão)
          const wasLabelingCandidate = 
            String(a.ETIQUETA || '').toUpperCase().includes('ETIQUETAR') || 
            String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' ||
            a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR ||
            a._plaquetado === true;

          const alteredFields = new Set<string>(updates._camposAlterados || []);
          const originalValues = { ...(a._valoresOriginais || {}) };

          // Se houver manualUpdates, registramos os campos alterados
          if (manualUpdates) {
            Object.keys(manualUpdates).forEach(key => {
              if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
              if (String(manualUpdates[key]) !== String(a[key])) {
                alteredFields.add(key);
                if (originalValues[key] === undefined) {
                  originalValues[key] = a[key] as string | number | boolean | string[] | null | undefined;
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
          // updates.ENDERECO = targetLoc; // REMOVIDO: Não alteramos o endereço original
          
          const hasChanges = alteredFields.size > 0;
          updates.DE_PARA = hasChanges ? 'COM ALTERAÇÃO' : 'SEM ALTERAÇÃO';
          
          updates.TAG_INVENTARIO = determineTag(updates, targetLoc);
          updates.AUDITOR_STATUS_CONFERENCIA = updates.TAG_INVENTARIO;
          updates._camposAlterados = Array.from(alteredFields);
          updates._valoresOriginais = originalValues;

          if (wasLabelingCandidate) {
            updates._plaquetado = true;
          }

          return updates;
        }
        return a;
      }),
      lastUpdated: new Date().toISOString(),
      status: DatabaseStatus.IN_USE
    }));
  }, [inventoryLocation, determineTag, normalizeKey]);

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
            res[colName] = JSON.stringify(val);
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
            res[colName] = JSON.stringify(val);
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
    XLSX.utils.book_append_sheet(wb, ws, "GBR_AUDIT");
    XLSX.writeFile(wb, `GBR_AUDIT_${new Date().getTime()}.xlsx`);
  };

  const handleBackup = async () => {
    const success = await backupInventory();
    if (success) {
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
    const newState = await restoreInventory(file);
    if (newState) {
      setInventory(newState);
      setModalConfig({
        isOpen: true,
        title: 'Backup Restaurado',
        message: `O backup foi restaurado com sucesso. ${newState.assets.length} ativos carregados.`,
        type: 'info'
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
      } else {
        setModalConfig({
          isOpen: true,
          title: 'Nenhum Dado',
          message: 'Não foram encontrados dados na nuvem para baixar.',
          type: 'info'
        });
      }
    } catch (error) {
      console.error('Erro ao baixar dados da nuvem:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro no Download',
        message: 'Ocorreu um erro ao tentar baixar os dados da nuvem. Verifique sua conexão.',
        type: 'error'
      });
    }
  };

  const handleClearDatabase = async () => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
      const unitName = selectedUnit ? selectedUnit.toUpperCase().trim() : 'GERAL';
      
      // Nome do arquivo conforme especificação: [GBR_MOBILE+KBP+DADOS+NOMEUNIDADEOPERACIONAL+DATA+HORA]
      const backupFileName = `GBR_MOBILE+KBP+DADOS+${unitName}+${dateStr}+${timeStr}`;
      
      // 1. Realiza backup automático antes de limpar
      await backupInventory(backupFileName);
      
      // 2. Limpa localmente (apenas a unidade selecionada se houver)
      await clearInventory(selectedUnit || undefined); 
      
      // 3. Se estiver no modo Supabase, limpa a nuvem também (apenas a unidade selecionada)
      if (databaseMode === DatabaseMode.SUPABASE) {
        try {
          await clearCloudInventory(selectedUnit || undefined, user?.tenantId);
          
          // Atualiza o timestamp na nuvem para notificar outros usuários
          try {
            const configToSync = { ...inventory };
            // @ts-expect-error - assets is removed for sync
            delete configToSync.assets;
            await syncConfigToCloud({ 
              ...configToSync, 
              lastUpdated: new Date().toISOString() 
            } as Omit<InventoryState, 'assets'>, user?.tenantId);
          } catch (syncErr) {
            console.warn('Empresa limpa na nuvem, mas erro ao sincronizar config (cache stale):', syncErr);
          }
        } catch (error: unknown) {
          console.error('Erro ao limpar nuvem:', error);
          let errorMessage = 'Erro desconhecido';
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (error && typeof error === 'object') {
            const errObj = error as Record<string, unknown>;
            errorMessage = String(errObj.message || errObj.details || errObj.hint || JSON.stringify(error));
          }
          throw new Error(`Erro na nuvem: ${errorMessage}`);
        }
      }

      // Atualiza o estado local removendo apenas os ativos da empresa limpa
      if (selectedUnit) {
        const normalizedSel = selectedUnit.toUpperCase().trim();
        const remainingAssets = inventory.assets.filter(a => (a.EMPRESA || '').toUpperCase().trim() !== normalizedSel);
        
        setInventory(prev => ({
          ...prev,
          assets: remainingAssets,
          lastUpdated: new Date().toISOString(),
          status: remainingAssets.length > 0 ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY
        }));
      } else {
        // Se não houver empresa selecionada, limpa tudo (comportamento padrão de segurança)
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
        message: `A unidade operacional "${selectedUnit}" foi limpa com sucesso (Local${databaseMode === DatabaseMode.SUPABASE ? ' e Nuvem' : ''}). Um backup de segurança foi gerado: ${backupFileName}`,
        type: 'info'
      });
    } catch (error: unknown) {
      console.error('Erro na limpeza do banco:', error);
      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        errorMessage = String(errObj.message || errObj.details || errObj.hint || JSON.stringify(error));
      }

      setModalConfig({
        isOpen: true,
        title: 'Erro na Limpeza',
        message: `Ocorreu um erro ao tentar limpar a unidade selecionada: ${errorMessage}`,
        type: 'error'
      });
    }
  };

  const isAdmin = useMemo(() => {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.MASTER || user?.isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL;
  }, [user]);

  const filteredAssetsByUnit = useMemo(() => {
    if (!selectedUnit) return inventory.assets; 
    const selKey = normalizeKey(selectedUnit);
    const filtered = [];
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      if (normalizeKey(a.EMPRESA || a._unitId || a._tenantId || '') === selKey) {
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
    const userTenant = user?.tenantId || 'default';
    const userUnits = user?.units || [userTenant];
    const isAuditor = user?.role === UserRole.AUDITOR;

    // Se a lista de empresas estiver vazia mas tivermos ativos, extraímos na hora
    const baseCompanies = inventory.companies.length > 0 
      ? inventory.companies 
      : Array.from(new Set(inventory.assets.map(a => (a.EMPRESA || '').trim().toUpperCase()))).filter(Boolean);

    return baseCompanies
      .filter(company => {
        if (!isAuditor || userUnits.length === 0) return true;
        // Se for auditor, só mostra as unidades que estão na sua lista de units
        return userUnits.some(u => 
          normalizeKey(u) === normalizeKey(company) || 
          inventory.assets.some(a => normalizeKey(a.EMPRESA || '') === normalizeKey(company) && normalizeKey(a._unitId || '') === normalizeKey(u))
        );
      })
      .map(company => {
        const companyAssets = inventory.assets.filter(a => normalizeKey(a.EMPRESA || '') === normalizeKey(company));
        const hasData = companyAssets.length > 0;
        const hasActiveAssets = companyAssets.some(a => 
          String(a.STATUS || '').toUpperCase().includes('ATIVO')
        );
        return {
          name: company,
          hasData,
          hasActiveAssets
        };
      });
  }, [inventory.companies, inventory.assets, normalizeKey, user, UserRole.AUDITOR]);

  // Auto-sync on Company Selection if base is empty
  useEffect(() => {
    const rawTenants = user?.tenants || (user?.tenantId ? [user.tenantId] : []);
    const tenants = Array.isArray(rawTenants) ? rawTenants : [rawTenants];
    const isEmpty = inventory.assets.length === 0;
    
    if (screen === AppScreen.UNIT_SELECTION && isEmpty && databaseMode !== DatabaseMode.INTERNAL && !isSyncing && tenants.length > 0) {
      syncFromCloud(tenants, databaseMode).then(() => {
        // Se após o sync continuar vazio e for admin, manda para a carga
        // Usamos o estado atualizado do inventory.assets via ref ou checagem direta se possível, 
        // mas aqui o inventory.assets no closure ainda é o antigo.
        // No entanto, o próximo ciclo do useEffect pegará o valor atualizado.
      });
    } else if (screen === AppScreen.UNIT_SELECTION && isEmpty && isAdmin && !isSyncing) {
      // Se entrou aqui vazio e não tem o que sincronizar (ou é interno), vai para a carga
      pushScreen(AppScreen.LOAD_DATABASE);
    }
  }, [screen, inventory.assets.length, databaseMode, isSyncing, user, syncFromCloud, isAdmin, pushScreen]);

  // Auto-select unit if only one is available for the auditor
  useEffect(() => {
    if (screen === AppScreen.UNIT_SELECTION && !selectedUnit && !isSyncing && inventory.assets.length > 0) {
      const available = fullCompaniesWithStatus.filter(c => c.hasData);
      if (available.length === 1 && user?.role === UserRole.AUDITOR) {
        const unit = available[0].name;
        setSelectedUnit(unit);
        localStorage.setItem('app_selected_unit', unit);
        setIsInventorying(false);
        setInventoryLocation(null);
        pushScreen(AppScreen.MAIN_MENU);
      }
    }
  }, [screen, selectedUnit, isSyncing, inventory.assets.length, fullCompaniesWithStatus, user, UserRole.AUDITOR]);

  const showCompanyHeader = !!selectedUnit && screen !== AppScreen.LOGIN && screen !== AppScreen.REGISTER && screen !== AppScreen.UNIT_SELECTION && screen !== AppScreen.MAIN_MENU;

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

  if (!hasAcceptedTerms) {
    return (
      <ErrorBoundary>
        <TrustOnboarding 
          onAccept={() => {
            setHasAcceptedTerms(true);
            localStorage.setItem('app_accepted_terms', 'true');
          }} 
          onOpenPrivacyCenter={() => setIsPrivacyCenterOpen(true)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-full h-[100dvh] bg-bg-main overflow-hidden relative font-sans max-w-full flex flex-col">
        {showCompanyHeader && (
          <div className="bg-white border-b border-slate-200 shadow-sm z-[200]">
            <div className="px-3 py-1 flex items-center justify-between space-x-3">
               <div className="flex items-center space-x-2">
                 <div className="w-6 h-6 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-sm">
                   <Building2 size={12} />
                 </div>
                 <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em]">Auditoria</p>
               </div>
                <div className="flex items-center space-x-1.5">
                  <div 
                    className={`px-1.5 py-0.5 rounded-lg border shadow-sm flex items-center space-x-1 transition-colors ${isSafeMode ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`} 
                    title={isSafeMode ? "Banco de Dados Protegido (Criptografia AES-256)" : `Ameaças Detectadas: ${securityThreats.join(', ')}`}
                  >
                    <ShieldCheck size={10} className={isSafeMode ? "text-emerald-600" : "text-red-600"} />
                    <span className={`text-[7px] font-black uppercase tracking-widest ${isSafeMode ? "text-emerald-600" : "text-red-600"}`}>
                      {isSafeMode ? 'SAFE' : 'RISK'}
                    </span>
                  </div>
                  <div className="px-1.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 shadow-sm">
                    <span className="text-[7px] font-bold text-blue-600 uppercase tracking-[0.1em]">v24.50 PRO</span>
                  </div>
                </div>
            </div>
            <div className="px-3 pb-1.5 pt-0.5 border-t border-slate-50">
               <h2 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight leading-tight">
                 {selectedUnit}
               </h2>
            </div>
          </div>
        )}
        
        <div className="flex-1 relative overflow-hidden z-[500]">
          {showRecoveryToast && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-white/20 animate-bounce w-[90%] max-w-xs">
              <ShieldCheck size={20} className="shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-center">Base de Dados Recuperada com Sucesso</span>
            </div>
          )}
          {screen === AppScreen.LOGIN && (
            <Login 
              users={users} 
              databaseMode={databaseMode}
              onUpdateDatabaseMode={handleUpdateDatabaseMode}
              onNavigateToRegister={() => pushScreen(AppScreen.REGISTER)}
              onOpenPrivacyCenter={() => setIsPrivacyCenterOpen(true)}
              onLogin={(u) => { 
                setUser(u); 
                const isEmpty = inventory.assets.length === 0;

                if (isEmpty && databaseMode !== DatabaseMode.INTERNAL) {
                  // Passa o tenantId e o modo explicitamente para garantir sync imediato no login
                  syncFromCloud(u.tenants || u.tenantId, databaseMode);
                }

                if (u.mustChangePassword) { 
                  pushScreen(AppScreen.CHANGE_PASSWORD); 
                } else { 
                  pushScreen(AppScreen.MODULE_SELECTION); 
                } 
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
              onNavigate={pushScreen} 
              onLogout={async () => { 
                if (supabase) await supabase.auth.signOut();
                setUser(null); 
                setSelectedUnit(null); 
                setStartWithDataMenu(false);
                setConsultationFilters({
                  ETIQUETA: '',
                  DESCRICAODOATIVO: '',
                  SERIAL: '',
                  CNPJ: '',
                  NOMEFORNECEDOR: '',
                  NOTAFISCAL: '',
                  ENDERECO: '',
                  CONTACONTABIL: '',
                  CENTRODECUSTO: '',
                  DATAAQUSIC_START: '',
                  DATAAQUSIC_END: '',
                  Sn1_recno: ''
                });
                setCommittedConsultationFilters(null);
                pushScreen(AppScreen.LOGIN); 
              }} 
              onExport={handleExport} 
              onBackup={handleBackup}
              onDownloadCloudData={handleDownloadCloudData}
              onRestore={handleRestore}
              onClearDatabase={handleClearDatabase} 
              onClearMultipleUnits={handleClearMultipleCompanies}
              user={user} 
              units={fullCompaniesWithStatus.map(c => ({ name: c.name, hasData: c.hasData }))}
              databaseMode={databaseMode}
              onUpdateDatabaseMode={handleUpdateDatabaseMode}
              inventoryInfo={{ 
                count: filteredAssetsByUnit.length, 
                totalDatabase: inventory.assets.length, 
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
              onProcessSyncQueue={async () => {
                await processSyncQueue();
                const items = await getPendingSyncItems();
                setPendingPhotosCount(items.length);
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
            />
          )}
          {screen === AppScreen.LOAD_DATABASE && (
            isAdmin ? (
              <DatabaseLoader 
                onBack={popScreen} 
                onDataLoaded={async (a, c) => { 
                  const newInventory = { 
                    ...inventory, 
                    assets: a, 
                    companies: c, 
                    lastUpdated: new Date().toISOString(), 
                    status: DatabaseStatus.LOADED 
                  };
                  setInventory(newInventory); 
                  
                  // Se for Admin e houver Supabase, faz o push total para a nuvem
                  if (isAdmin && !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)) {
                    setIsSyncing(true);
                    try {
                      // Limpa a nuvem antes de subir a nova base para garantir espelhamento
                      await clearCloudInventory();
                      // Sincroniza todos os ativos (em lotes se necessário, mas syncAssetsToCloud já lida com isso)
                      // Se for admin e estiver no tenant default, não força o tenantId para que o syncAssetsToCloud use a EMPRESA como fallback
                      const forcedTenantId = (user?.isAdmin && user?.tenantId === 'default') ? undefined : user?.tenantId;
                      await syncAssetsToCloud(a, forcedTenantId);
                      // Sincroniza a config (que contém o lastUpdated)
                      const configToSync = { ...newInventory };
                      // @ts-expect-error - assets is removed for sync
                      delete configToSync.assets;
                      await syncConfigToCloud(configToSync as Omit<InventoryState, 'assets'>, forcedTenantId || user?.tenantId);
                      
                      setLastSyncTime(new Date().toISOString());
                      setSyncError(null);
                    } catch (err) {
                      console.error('Erro ao sincronizar nova carga com a nuvem:', err);
                      setSyncError('Erro no upload total');
                    } finally {
                      setIsSyncing(false);
                    }
                  }
                  
                  setStartWithDataMenu(false);
                  pushScreen(AppScreen.UNIT_SELECTION); 
                }} 
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p>
              </div>
            )
          )}
          {screen === AppScreen.INVENTORY && (
            <Inventory 
              assets={filteredAssetsByUnit} 
              allAssets={inventory.assets} 
              onBack={popScreen} 
              onUpdateAsset={updateAsset} 
              isGpsAvailable={isGpsAvailable}
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
              onUpdateScannerMode={(mode) => setInventory(prev => ({ ...prev, scannerMode: mode }))} 
              searchMode={inventory.inventorySearchMode || InventorySearchMode.MANUAL} 
              onUpdateSearchMode={(mode) => setInventory(prev => ({ ...prev, inventorySearchMode: mode }))} 
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
              onSyncFromCloud={syncFromCloud}
              user={user}
              currentCampaignId={inventory.currentCampaignId}
            />
          )}
          {screen === AppScreen.LABELING && <Labeling assets={filteredAssetsByUnit} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} uniqueCentrosDeCusto={uniqueCentrosDeCusto} scannerMode={inventory.scannerMode || ScannerMode.BARCODE} onUpdateScannerMode={(mode) => setInventory(prev => ({ ...prev, scannerMode: mode }))} scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} />}
          {screen === AppScreen.CONSULTATION && (
            <Consultation 
              assets={filteredAssetsByUnit} 
              onBack={() => { setIsConsultationFromInventory(false); popScreen(); }} 
              onSelectAsset={handleSelectAsset} 
              qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} 
              scannerMode={inventory.scannerMode || ScannerMode.BARCODE} 
              onUpdateScannerMode={(mode) => setInventory(prev => ({ ...prev, scannerMode: mode }))} 
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
              onBulkUpdate={bulkUpdateAssets} 
              editableFields={inventory.editableFields || []} 
              qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} 
              uniqueEnderecos={allLocations} 
              uniqueCentrosDeCusto={uniqueCentrosDeCusto} 
              readOnly={isReadOnlyDetail}
              protheusIntegrationEnabled={inventory.protheusIntegrationEnabled || false}
              protheusApiUrl={inventory.protheusApiUrl || ''}
              tenantId={user?.tenantId || 'default'}
              mandatoryPhotoOnDivergence={inventory.mandatoryPhotoOnDivergence}
              mandatoryPhotoOnNewItem={inventory.mandatoryPhotoOnNewItem}
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
              units={fullCompaniesWithStatus.map(c => ({ name: c.name, hasData: c.hasActiveAssets }))} 
              onSelect={(u) => { 
                setSelectedUnit(u); 
                setIsInventorying(false); 
                setInventoryLocation(null); 
                pushScreen(AppScreen.MAIN_MENU); 
              }} 
              onBack={async () => { 
                if (supabase) await supabase.auth.signOut();
                setUser(null); 
                setSelectedUnit(null); 
                pushScreen(AppScreen.LOGIN); 
              }} 
              onSync={syncFromCloud}
              isSyncing={isSyncing}
              lastSyncTime={lastSyncTime}
            />
          )}
          {screen === AppScreen.DASHBOARD && (
            <Dashboard 
              assets={filteredAssetsByUnit} 
              onBack={popScreen} 
              onOpenActiveSearch={() => pushScreen(AppScreen.ACTIVE_SEARCH)}
              user={user}
            />
          )}
          {screen === AppScreen.ASSET_MAP && <AssetMap assets={inventory.assets} onBack={popScreen} databaseMode={inventory.databaseMode} />}
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
              onLogout={async () => {
                if (supabase) await supabase.auth.signOut();
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
                  const isEmpty = inventory.assets.length === 0;
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
              tenantId={user?.tenantId || 'default'}
              onBack={() => {
                setCurrentModule(null);
                localStorage.removeItem('app_current_module');
                pushScreen(AppScreen.MODULE_SELECTION);
              }}
            />
          )}
          {screen === AppScreen.USER_MANAGEMENT && (isAdmin ? <UserManagement users={users} setUsers={setUsers} onBack={popScreen} currentUser={user} setUser={setUser} availableUnits={availableUnits} /> : <div className="flex items-center justify-center h-full"><p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p></div>)}
          {screen === AppScreen.FIELD_CONFIGURATOR && (isAdmin ? <FieldConfigurator assets={inventory.assets} currentEditable={inventory.editableFields || []} onSave={(f) => setInventory(prev => ({ ...prev, editableFields: f }))} onBack={popScreen} /> : <div className="flex items-center justify-center h-full"><p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p></div>)}
          {screen === AppScreen.QR_CODE_CONFIGURATOR && (isAdmin ? <QrCodeConfigurator assets={inventory.assets} currentQrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} onSave={(f) => setInventory(prev => ({ ...prev, qrCodeFields: f }))} onBack={popScreen} /> : <div className="flex items-center justify-center h-full"><p className="text-ink-muted uppercase font-bold tracking-widest">Acesso Restrito</p></div>)}
          {screen === AppScreen.AUDIT_LOGS && <AuditLogs user={user} onBack={popScreen} databaseMode={databaseMode} />}
          {screen === AppScreen.CAMPAIGN_MANAGEMENT && (
            <CampaignManager 
              user={user} 
              onBack={popScreen} 
              onActivate={(id) => setInventory(prev => ({ ...prev, currentCampaignId: id }))}
              currentCampaignId={inventory.currentCampaignId}
            />
          )}
          {screen === AppScreen.GLOBAL_PERFORMANCE && <GlobalPerformance assets={filteredAssetsByUnit} onBack={popScreen} />}
          {screen === AppScreen.ACCOUNT_RECONCILIATION && <AccountReconciliation assets={filteredAssetsByUnit} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} />}
        </div>
  
        {showOnboardingTips && (
          <FloatingHelp 
            currentScreen={screen} 
            onCloseOnboarding={() => {
              setShowOnboardingTips(false);
              localStorage.setItem('app_show_onboarding', 'false');
            }} 
          />
        )}

        <PrivacyCenter 
          isOpen={isPrivacyCenterOpen} 
          onClose={() => setIsPrivacyCenterOpen(false)} 
        />

        {/* Indicador de Sincronização Offline (Fotos) */}
        {syncQueueLength > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[50] bg-ink text-bg px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 backdrop-blur-md"
          >
            <div className="relative">
              <RefreshCw size={16} className="animate-spin text-accent" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full animate-ping"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">Sincronizando Fotos</span>
              <span className="text-[8px] font-bold text-bg/60 uppercase tracking-tighter mt-0.5">
                {syncQueueLength} {syncQueueLength === 1 ? 'item pendente' : 'itens pendentes'} na fila
              </span>
            </div>
          </motion.div>
        )}

        {/* Immersive Mode handled automatically on first interaction */}
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          if (modalConfig.onConfirm) modalConfig.onConfirm();
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        }}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
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
          <h3 className="text-sm font-black text-ink uppercase tracking-[0.2em] mb-2">Sincronizando Base</h3>
          <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest animate-pulse">Aguarde, baixando dados da nuvem...</p>
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
    </ErrorBoundary>
  );
};

export default App;
