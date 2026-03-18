
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppScreen, User, Asset, InventoryState, DatabaseStatus, TagInventario, ScannerMode, InventorySearchMode, ScanFeedbackMode, DatabaseMode, SearchFilters } from './types';
import Modal from './components/Modal';
import Login from './components/Login';
import Register from './components/Register';
import MainMenu from './components/MainMenu';
import DatabaseLoader from './components/DatabaseLoader';
import AssetDetail from './components/AssetDetail';
import Inventory from './components/Inventory';
import Labeling from './components/Labeling'; 
import Consultation from './components/Consultation';
import CompanySelector from './components/CompanySelector';
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import PublicKardex from './components/PublicKardex';
import ChangePassword from './components/ChangePassword';
import FieldConfigurator from './components/FieldConfigurator';
import QrCodeConfigurator from './components/QrCodeConfigurator';
import GlobalPerformance from './components/GlobalPerformance';
import AccountReconciliation from './components/AccountReconciliation';

import { Building2, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveInventory, loadInventory, clearInventory } from './services/persistenceService';
import { getAssetByTag } from './services/supabaseService';

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
                const icon = document.createElement('div');
                icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
                e.currentTarget.parentElement?.appendChild(icon.firstChild as Node);
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

  const [selectedCompany, setSelectedCompany] = useState<string | null>(() => {
    return localStorage.getItem('app_selected_company') || null;
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
    batterySaver: localStorage.getItem('app_battery_saver') === 'true'
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showRecoveryToast, setShowRecoveryToast] = useState(false);
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
        DATAAQUSIC_END: ''
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
        DATAAQUSIC_END: ''
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
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(() => {
    try {
      const saved = localStorage.getItem('app_database_mode');
      return (saved as DatabaseMode) || DatabaseMode.INTERNAL;
    } catch { return DatabaseMode.INTERNAL; }
  });

  // Apply theme class to body based on databaseMode and darkMode
  useEffect(() => {
    const body = document.body;
    body.classList.remove('theme-internal', 'theme-supabase', 'theme-protheus', 'theme-dark');
    
    if (inventory.darkMode) {
      body.classList.add('theme-dark');
    } else {
      if (databaseMode === DatabaseMode.SUPABASE) {
        body.classList.add('theme-supabase');
      } else if (databaseMode === DatabaseMode.PROTHEUS_SUPABASE) {
        body.classList.add('theme-protheus');
      } else {
        body.classList.add('theme-internal');
      }
    }
  }, [databaseMode, inventory.darkMode]);

  // Load inventory from IndexedDB on mount
  useEffect(() => {
    const init = async () => {
      try {
        const saved = await loadInventory();
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
        // Remove o loader do index.html
        const loader = document.getElementById('app-loader');
        if (loader) {
          loader.classList.add('hidden');
          setTimeout(() => loader.remove(), 500);
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
        getAssetByTag(etqParam).then(foundCloud => {
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
    if (user && !selectedCompany && companyRequiredScreens.includes(currentScreen)) {
      pushScreen(AppScreen.COMPANY_SELECTION);
    }
  }, [isDataLoaded, user, history, selectedAssets.length, selectedCompany]);

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('app_users');
      const userList: User[] = saved ? JSON.parse(saved) : [];
      if (!userList.find(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())) {
        userList.push({ username: "ADMIN GBR", email: ADMIN_EMAIL, password: "admin", isAdmin: true, mustChangePassword: false });
      }
      return userList;
    } catch { return []; }
  });

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

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyAssetsRef = useRef<Set<string>>(new Set());

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
    
    const currentCompKey = selectedCompany ? normalizeKey(selectedCompany) : '';
    
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      
      // Centro de Custo
      if (a.CENTRODECUSTO) {
        centrosDeCustoSet.add(String(a.CENTRODECUSTO).trim().toUpperCase());
      }

      const assetCompKey = normalizeKey(a.EMPRESA || '');
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
  }, [inventory.assets, selectedCompany, normalizeKey, manualLocations]);

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
    const assetCompKey = normalizeKey(asset.EMPRESA || '');
    const currentCompKey = normalizeKey(selectedCompany || '');
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
  }, [normalizeKey, selectedCompany]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (isDataLoaded) {
          const dirtyIds = Array.from(dirtyAssetsRef.current);
          const dirtyAssets = dirtyIds.map(id => inventory.assets.find(a => String(a.id) === id)).filter(Boolean) as Asset[];
          
          await saveInventory(inventory, dirtyAssets);
          dirtyAssetsRef.current.clear();
        }
        localStorage.setItem('app_screen_history', JSON.stringify(history));
        localStorage.setItem('app_current_user', JSON.stringify(user));
        localStorage.setItem('app_users', JSON.stringify(users));
        localStorage.setItem('app_selected_company', selectedCompany || '');
        localStorage.setItem('app_inventory_location', inventoryLocation || '');
        localStorage.setItem('app_is_inventorying', String(isInventorying));
        localStorage.setItem('app_consultation_filters', JSON.stringify(consultationFilters));
        localStorage.setItem('app_committed_consultation_filters', JSON.stringify(committedConsultationFilters));
        localStorage.setItem('app_dark_mode', String(inventory.darkMode || false));
        localStorage.setItem('app_battery_saver', String(inventory.batterySaver || false));
      } catch { console.warn("Storage cap reached"); }
    }, 2000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedCompany, inventoryLocation, isInventorying, isDataLoaded, consultationFilters, committedConsultationFilters]);

  const pushScreen = (s: AppScreen) => {
    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) setHistory([s]);
    else setHistory(prev => [...prev, s]);
  };

  const handleUpdateDatabaseMode = (mode: DatabaseMode) => {
    setDatabaseMode(mode);
    localStorage.setItem('app_database_mode', mode);
  };

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
      updates._auditor = user?.username || user?.email || 'SISTEMA';
      
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

  const updateAsset = useCallback((updatedAsset: Asset) => {
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

    commitAssetUpdate(updatedAsset);
  }, [inventory.assets, commitAssetUpdate]);

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

  const bulkUpdateAssets = useCallback((ids: string[], manualUpdates?: Partial<Asset>) => {
    const idSet = new Set(ids.map(id => String(id)));
    ids.forEach(id => dirtyAssetsRef.current.add(String(id)));
    const isReconciliationWorkflow = history.includes(AppScreen.ACCOUNT_RECONCILIATION);
    
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { ...a, ...(manualUpdates || {}) };
          
          // REGRA DE OURO: Respeita o local do inventário se houver, senão mantém o do item (ou o manual)
          const targetLoc = isReconciliationWorkflow
            ? (a.ENDERECO || "")
            : (inventoryLocation 
                ? inventoryLocation.toUpperCase().trim() 
                : (updates.ENDERECO || "").toString().toUpperCase().trim());

          updates._conferido = true;
          updates._dataLeitura = new Date().toISOString();
          updates._auditor = user?.username || user?.email || 'SISTEMA';
          
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

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return inventory.assets; 
    const selKey = normalizeKey(selectedCompany);
    const filtered = [];
    for (let i = 0; i < inventory.assets.length; i++) {
      const a = inventory.assets[i];
      if (normalizeKey(a.EMPRESA || '') === selKey) {
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
        // Registro Ativo: Não pode estar baixado
        if (!isBaixado) {
          filtered.push(a);
        }
      }
    }
    return filtered;
  }, [inventory.assets, selectedCompany, normalizeKey]);

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  const showCompanyHeader = !!selectedCompany && screen !== AppScreen.LOGIN && screen !== AppScreen.REGISTER && screen !== AppScreen.COMPANY_SELECTION && screen !== AppScreen.MAIN_MENU;

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
                 <div className="px-1.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-100 shadow-sm flex items-center space-x-1" title="Banco de Dados Protegido (IndexedDB)">
                   <ShieldCheck size={10} className="text-emerald-600" />
                   <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">SAFE</span>
                 </div>
                 <div className="px-1.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 shadow-sm">
                   <span className="text-[7px] font-bold text-blue-600 uppercase tracking-[0.1em]">v24.50 PRO</span>
                 </div>
               </div>
            </div>
            <div className="px-3 pb-1.5 pt-0.5 border-t border-slate-50">
               <h2 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight leading-tight">
                 {selectedCompany}
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
              onLogin={(u) => { 
                setUser(u); 
                const isAdmin = u.isAdmin || u.email.toLowerCase() === ADMIN_EMAIL;
                const isEmpty = inventory.assets.length === 0;

                if (u.mustChangePassword) { 
                  pushScreen(AppScreen.CHANGE_PASSWORD); 
                } else if (isEmpty && isAdmin) {
                  setStartWithDataMenu(true);
                  pushScreen(AppScreen.MAIN_MENU);
                } else { 
                  pushScreen(AppScreen.COMPANY_SELECTION); 
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
                const isAdmin = user?.isAdmin || user?.email.toLowerCase() === ADMIN_EMAIL;
                const isEmpty = inventory.assets.length === 0;

                if (isEmpty && isAdmin) {
                  setStartWithDataMenu(true);
                  pushScreen(AppScreen.MAIN_MENU);
                } else {
                  pushScreen(AppScreen.COMPANY_SELECTION); 
                }
              }} 
            />
          )}
          {screen === AppScreen.MAIN_MENU && (
            <MainMenu 
              onNavigate={pushScreen} 
              onLogout={() => { 
                setUser(null); 
                setSelectedCompany(null); 
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
                  DATAAQUSIC_END: ''
                });
                setCommittedConsultationFilters(null);
                pushScreen(AppScreen.LOGIN); 
              }} 
              onExport={handleExport} 
              onClearDatabase={async () => { 
                await clearInventory(); 
                setInventory({ 
                  assets: [], 
                  companies: [], 
                  lastUpdated: null, 
                  status: DatabaseStatus.EMPTY, 
                  editableFields: inventory.editableFields, 
                  qrCodeFields: inventory.qrCodeFields, 
                  scannerMode: inventory.scannerMode, 
                  autoConfirmOnScan: inventory.autoConfirmOnScan, 
                  scanFeedbackMode: inventory.scanFeedbackMode, 
                  inventorySearchMode: inventory.inventorySearchMode 
                }); 
              }} 
              user={user} 
              databaseMode={databaseMode}
              onUpdateDatabaseMode={handleUpdateDatabaseMode}
              inventoryInfo={{ 
                count: filteredAssetsByCompany.length, 
                totalDatabase: inventory.assets.length, 
                date: inventory.lastUpdated 
              }} 
              autoConfirmOnScan={inventory.autoConfirmOnScan || false} 
              onUpdateAutoConfirm={(val) => setInventory(prev => ({ ...prev, autoConfirmOnScan: val }))} 
              isFullscreen={isFullscreen} 
              onToggleFullscreen={toggleFullscreen} 
              scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} 
              onUpdateScanFeedbackMode={(mode) => setInventory(prev => ({ ...prev, scanFeedbackMode: mode }))}
              initialDataMenuOpen={startWithDataMenu}
              selectedCompany={selectedCompany}
              darkMode={inventory.darkMode || false}
              onUpdateDarkMode={(val) => setInventory(prev => ({ ...prev, darkMode: val }))}
              batterySaver={inventory.batterySaver || false}
              onUpdateBatterySaver={(val) => setInventory(prev => ({ ...prev, batterySaver: val }))}
            />
          )}
          {screen === AppScreen.LOAD_DATABASE && (
            <DatabaseLoader 
              onBack={popScreen} 
              onDataLoaded={(a, c) => { 
                setInventory({ ...inventory, assets: a, companies: c, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); 
                setStartWithDataMenu(false);
                pushScreen(AppScreen.COMPANY_SELECTION); 
              }} 
            />
          )}
          {screen === AppScreen.INVENTORY && (
            <Inventory 
              assets={filteredAssetsByCompany} 
              allAssets={inventory.assets} 
              onBack={popScreen} 
              onUpdateAsset={updateAsset} 
              onBulkUpdateAssets={bulkUpdateAssets} 
              onSelectAsset={handleSelectAsset} 
              selectedLocation={inventoryLocation} 
              setSelectedLocation={setInventoryLocation} 
              isInventorying={isInventorying} 
              setIsInventorying={setIsInventorying} 
              selectedCompany={selectedCompany} 
              onAddNewLocation={addNewLocation} 
              locationsWithStats={locationsWithStats} 
              scannerMode={inventory.scannerMode || ScannerMode.BARCODE} 
              onUpdateScannerMode={(mode) => setInventory(prev => ({ ...prev, scannerMode: mode }))} 
              searchMode={inventory.inventorySearchMode || InventorySearchMode.MANUAL} 
              onUpdateSearchMode={(mode) => setInventory(prev => ({ ...prev, inventorySearchMode: mode }))} 
              autoConfirmOnScan={inventory.autoConfirmOnScan || false} 
              scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} 
              onOpenConsultation={() => { setIsConsultationFromInventory(true); pushScreen(AppScreen.CONSULTATION); }} 
              inventorySearchValue={inventorySearchValue} 
              clearInventorySearchValue={() => setInventorySearchValue(null)} 
              immersiveMode={inventory.immersiveMode || false} 
              onToggleFullscreen={toggleFullscreen}
              batterySaver={inventory.batterySaver || false}
            />
          )}
          {screen === AppScreen.LABELING && <Labeling assets={filteredAssetsByCompany} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} uniqueCentrosDeCusto={uniqueCentrosDeCusto} selectedCompany={selectedCompany} scannerMode={inventory.scannerMode || ScannerMode.BARCODE} onUpdateScannerMode={(mode) => setInventory(prev => ({ ...prev, scannerMode: mode }))} scanFeedbackMode={inventory.scanFeedbackMode || ScanFeedbackMode.BOTH} />}
          {screen === AppScreen.CONSULTATION && (
            <Consultation 
              assets={filteredAssetsByCompany} 
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
            />
          )}
          {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); setInventoryLocation(null); pushScreen(AppScreen.MAIN_MENU); }} onBack={() => { setUser(null); setSelectedCompany(null); pushScreen(AppScreen.LOGIN); }} />}
          {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
          {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
          {screen === AppScreen.FIELD_CONFIGURATOR && <FieldConfigurator assets={inventory.assets} currentEditable={inventory.editableFields || []} onSave={(f) => setInventory(prev => ({ ...prev, editableFields: f }))} onBack={popScreen} />}
          {screen === AppScreen.QR_CODE_CONFIGURATOR && <QrCodeConfigurator assets={inventory.assets} currentQrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} onSave={(f) => setInventory(prev => ({ ...prev, qrCodeFields: f }))} onBack={popScreen} />}
          {screen === AppScreen.GLOBAL_PERFORMANCE && <GlobalPerformance assets={filteredAssetsByCompany} onBack={popScreen} />}
          {screen === AppScreen.ACCOUNT_RECONCILIATION && <AccountReconciliation assets={filteredAssetsByCompany} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} />}
        </div>
  
        {/* Immersive Mode handled automatically on first interaction */}
      </div>

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
    </ErrorBoundary>
  );
};

export default App;
