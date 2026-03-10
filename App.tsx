
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppScreen, User, Asset, InventoryState, DatabaseStatus, TagInventario } from './types';
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
import ChangePassword from './components/ChangePassword';
import FieldConfigurator from './components/FieldConfigurator';
import QrCodeConfigurator from './components/QrCodeConfigurator';

import { Building2, Maximize2, Minimize2, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveInventory, loadInventory, clearInventory } from './services/persistenceService';

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
        <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-slate-50 text-center">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-6">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tight">Ops! Algo deu errado</h1>
          <p className="text-sm text-slate-500 mb-8 max-w-xs">
            Ocorreu um erro inesperado na interface. Tente reiniciar o aplicativo ou limpar o cache.
          </p>
          <div className="space-y-3 w-full max-w-xs">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-all"
            >
              Recarregar App
            </button>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.href = '/';
              }} 
              className="w-full py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase tracking-widest active:scale-95 transition-all"
            >
              Limpar Tudo e Sair
            </button>
          </div>
          <pre className="mt-8 p-4 bg-slate-100 rounded-lg text-[10px] text-slate-400 overflow-auto max-w-full text-left">
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
    qrCodeFields: ['ETIQUETA']
  });

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showRecoveryToast, setShowRecoveryToast] = useState(false);

  // Load inventory from IndexedDB on mount
  useEffect(() => {
    const init = async () => {
      try {
        const saved = await loadInventory();
        if (saved && saved.assets && saved.assets.length > 0) {
          setInventory(prev => ({
            ...prev,
            ...saved,
            editableFields: saved.editableFields || prev.editableFields,
            qrCodeFields: saved.qrCodeFields || prev.qrCodeFields
          }));
          setShowRecoveryToast(true);
          setTimeout(() => setShowRecoveryToast(false), 5000);
        } else {
          // Fallback to localStorage for migration
          const legacy = localStorage.getItem('inventory_data');
          if (legacy) {
            const parsed = JSON.parse(legacy);
            if (parsed && parsed.assets && parsed.assets.length > 0) {
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
      }
    };
    init();
  }, []);

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Safety check to prevent getting stuck on screens with missing state
  useEffect(() => {
    if (!isDataLoaded) return;

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
      AppScreen.INVENTORY, 
      AppScreen.LABELING, 
      AppScreen.CONSULTATION, 
      AppScreen.DASHBOARD
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

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buttonPos, setButtonPos] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const toggleFullscreen = useCallback(() => {
    if (isDragging) return;
    try {
      if (!document.fullscreenElement) {
        const docEl = document.documentElement as HTMLElement & {
          webkitRequestFullScreen?: () => Promise<void>;
          mozRequestFullScreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        };
        
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch((err: Error) => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
          });
        } else if (docEl.webkitRequestFullScreen) {
          docEl.webkitRequestFullScreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
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
      }
    } catch (e) {
      console.error("Fullscreen toggle failed", e);
    }
  }, [isDragging]);

  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(false);
    dragOffset.current = {
      x: clientX - buttonPos.x,
      y: clientY - buttonPos.y
    };
  };

  const handleMove = (clientX: number, clientY: number) => {
    const newX = clientX - dragOffset.current.x;
    const newY = clientY - dragOffset.current.y;
    
    // Check if moved enough to be considered a drag
    if (Math.abs(newX - buttonPos.x) > 5 || Math.abs(newY - buttonPos.y) > 5) {
      setIsDragging(true);
    }

    // Keep within viewport boundaries
    const boundedX = Math.max(20, Math.min(window.innerWidth - 60, newX));
    const boundedY = Math.max(20, Math.min(window.innerHeight - 60, newY));
    
    setButtonPos({ x: boundedX, y: boundedY });
  };

  useEffect(() => {
    const onResize = () => {
      setButtonPos(prev => ({
        x: Math.min(window.innerWidth - 80, prev.x),
        y: Math.min(window.innerHeight - 80, prev.y)
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  const { locationsWithStats, allLocations } = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    const locationsSet = new Set<string>(manualLocations);
    
    // Filtramos os ativos pela empresa selecionada para as estatísticas serem relevantes
    const currentCompKey = selectedCompany ? normalizeKey(selectedCompany) : '';
    
    inventory.assets.forEach(a => {
      const assetCompKey = normalizeKey(a.EMPRESA || '');
      if (currentCompKey && assetCompKey !== currentCompKey) return;

      const loc = String(a.ENDERECO || 'SEM LOCAL').trim().toUpperCase();
      if (loc) locationsSet.add(loc);

      const statusUpper = String(a.STATUS || '').toUpperCase();
      const isBaixado = statusUpper.includes('BAIXA') || !!a.DATABAIXA;
      
      // REGRA A: Baixado PENDENTE não entra nas estatísticas de total/checked
      if (isBaixado && !a._conferido) return;

      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      
      // Se for um item ativo, conta no total
      if (!isBaixado) stats[loc].total++;
      
      if (a._conferido) {
        stats[loc].checked++;
        // Se for um item baixado que foi localizado, adicionamos ao total para manter a coerência do progresso
        if (isBaixado) stats[loc].total++;
      }
    });

    return { 
      locationsWithStats: stats, 
      allLocations: Array.from(locationsSet).sort() 
    };
  }, [inventory.assets, selectedCompany, normalizeKey, manualLocations]);

  const uniqueCentrosDeCusto = useMemo(() => {
    const set = new Set<string>();
    inventory.assets.forEach(a => { if (a.CENTRODECUSTO) set.add(String(a.CENTRODECUSTO).trim().toUpperCase()); });
    return Array.from(set).sort();
  }, [inventory.assets]);

  // REATIVAÇÃO E REFINAMENTO DAS REGRAS DE OURO (FLAGS)
  const determineTag = useCallback((asset: Asset, targetLocation: string): TagInventario => {
    const statusUpper = String(asset.STATUS || '').toUpperCase();
    const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
    
    // 1. PRIORIDADE MÁXIMA: ETIQUETAGEM (REGRA DE OURO v24)
    // Se o item nasceu para ser etiquetado, o fato de ter sido etiquetado é a informação soberana.
    const originalEtq = normalizeKey(asset._plaquetaMaster || '');
    const needsLabel = originalEtq === 'ETIQUETAR';
    if (needsLabel) {
      return asset._conferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR;
    }

    // 2. BAIXADO (Se não conferido)
    if (isBaixado && !asset._conferido) return TagInventario.BAIXADO;
    
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
          await saveInventory(inventory);
        }
        localStorage.setItem('app_screen_history', JSON.stringify(history));
        localStorage.setItem('app_current_user', JSON.stringify(user));
        localStorage.setItem('app_users', JSON.stringify(users));
        localStorage.setItem('app_selected_company', selectedCompany || '');
        localStorage.setItem('app_inventory_location', inventoryLocation || '');
        localStorage.setItem('app_is_inventorying', String(isInventorying));
      } catch { console.warn("Storage cap reached"); }
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedCompany, inventoryLocation, isInventorying, isDataLoaded]);

  const pushScreen = (s: AppScreen) => {
    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) setHistory([s]);
    else setHistory(prev => [...prev, s]);
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

  const updateAsset = useCallback((updatedAsset: Asset) => {
    // ALERTA DE DUPLICIDADE DE ETIQUETA
    const newEtiqueta = String(updatedAsset.ETIQUETA || '').trim().toUpperCase();
    if (newEtiqueta && newEtiqueta !== 'ETIQUETAR') {
      const existing = inventory.assets.find(a => String(a.id) === String(updatedAsset.id));
      const oldEtiqueta = String(existing?.ETIQUETA || '').trim().toUpperCase();

      // Só valida duplicidade se a etiqueta foi alterada ou é um novo item (manual)
      if (newEtiqueta !== oldEtiqueta) {
        const duplicate = inventory.assets.find(a => 
          String(a.id) !== String(updatedAsset.id) && 
          String(a.ETIQUETA || '').trim().toUpperCase() === newEtiqueta
        );
        if (duplicate) {
          if (!confirm(`ALERTA DE DUPLICIDADE!\n\nA etiqueta "${newEtiqueta}" já está em uso pelo item:\n"${duplicate.DESCRICAODOATIVO}"\n\nDeseja continuar mesmo assim?`)) {
            return;
          }
        }
      }
    }

    setInventory(prev => {
      const newAssets = [...prev.assets];
      const index = newAssets.findIndex(a => String(a.id) === String(updatedAsset.id));
      
      // REGRA DE OURO: Se o auditor está em um local específico (Inventory Mode), forçamos esse local.
      // Se ele está em modo livre (Labeling/Consultation), respeitamos o endereço que está no objeto (que pode ter sido editado).
      const targetLoc = inventoryLocation 
        ? inventoryLocation.toUpperCase().trim() 
        : (updatedAsset.ENDERECO || "SEM LOCAL").toString().toUpperCase().trim();
      
      const updates = { ...updatedAsset } as Asset;
      updates._conferido = true;
      
      const alteredFields = new Set<string>(updates._camposAlterados || []);
      
      const existingAsset = index !== -1 ? newAssets[index] : null;
      if (existingAsset) {
        const originalValues = { ...(existingAsset._valoresOriginais || {}) };
        
        // Se o item estava na condição de etiquetar (ou já foi etiquetado nesta sessão)
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
        updates._valoresOriginais = originalValues;

        // Se era candidato a etiquetagem e foi conferido/alterado, marcamos como plaquetado
        if (wasLabelingCandidate) {
          updates._plaquetado = true;
        }
      }

      if (normalizeKey(String(existingAsset?.ENDERECO)) !== normalizeKey(targetLoc)) alteredFields.add('ENDERECO');
      updates._localMaster = targetLoc;
      updates.ENDERECO = targetLoc;
      
      updates.TAG_INVENTARIO = determineTag(updates, targetLoc);
      updates._camposAlterados = Array.from(alteredFields);
      
      if (index === -1) newAssets.push(updates);
      else newAssets[index] = updates;
      
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString(), status: DatabaseStatus.IN_USE };
    });
  }, [inventory.assets, inventoryLocation, determineTag, normalizeKey]);

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
    
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { ...a, ...(manualUpdates || {}) };
          
          // REGRA DE OURO: Respeita o local do inventário se houver, senão mantém o do item (ou o manual)
          const targetLoc = inventoryLocation 
            ? inventoryLocation.toUpperCase().trim() 
            : (updates.ENDERECO || "SEM LOCAL").toString().toUpperCase().trim();

          updates._conferido = true;
          
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
          
          if (normalizeKey(String(updates.ENDERECO)) !== normalizeKey(targetLoc)) {
            alteredFields.add('ENDERECO');
            if (originalValues['ENDERECO'] === undefined) {
              originalValues['ENDERECO'] = a.ENDERECO;
            }
          }
          updates._localMaster = targetLoc;
          updates.ENDERECO = targetLoc; 
          
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
      Object.keys(a).forEach(k => { if (!k.startsWith('_') && k !== 'id') res[k] = a[k] as string | number | boolean | null | undefined; });
      
      const originalValues = a._valoresOriginais;
      if (originalValues) {
        Object.keys(originalValues).forEach(key => {
          res[`ORIGINAL_${key}`] = originalValues[key] as string | number | boolean | null | undefined;
        });
      }

      res['AUDITOR_LOCAL_AUDITADO'] = a._localMaster || a.ENDERECO;
      res['AUDITOR_STATUS_CONFERENCIA'] = a._conferido ? 'SIM' : 'NAO';
      res['AUDITOR_TAG_REGRA_OURO'] = a.TAG_INVENTARIO || 'PENDENTE';
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
    return inventory.assets.filter(a => normalizeKey(a.EMPRESA || '') === selKey);
  }, [inventory.assets, selectedCompany, normalizeKey]);

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  const showCompanyHeader = !!selectedCompany && screen !== AppScreen.LOGIN && screen !== AppScreen.REGISTER && screen !== AppScreen.COMPANY_SELECTION;

  return (
    <ErrorBoundary>
      <div className="w-full h-screen bg-bg-main overflow-hidden relative font-sans max-w-full flex flex-col">
        {showCompanyHeader && (
          <div className="bg-white px-3 py-1.5 flex items-center space-x-3 border-b border-slate-200 shadow-sm z-[200]">
             <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-sm">
               <Building2 size={16} />
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Empresa em Auditoria</p>
               <h2 className="text-[11px] font-bold text-slate-900 uppercase truncate tracking-tight">{selectedCompany}</h2>
             </div>
             <div className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-100 shadow-sm">
               <span className="text-[7px] font-bold text-blue-600 uppercase tracking-[0.1em]">v24.50 PRO</span>
             </div>
          </div>
        )}
        
        <div className="flex-1 relative overflow-hidden">
          {showRecoveryToast && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-white/20 animate-bounce">
              <ShieldCheck size={20} />
              <span className="text-[10px] font-black uppercase tracking-widest">Base de Dados Recuperada com Sucesso</span>
            </div>
          )}
          {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); if (u.mustChangePassword) { pushScreen(AppScreen.CHANGE_PASSWORD); } else { pushScreen(AppScreen.MAIN_MENU); } }} />}
          {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
          {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u); setUsers(upd); pushScreen(AppScreen.MAIN_MENU); }} />}
          {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); setSelectedCompany(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} onClearDatabase={async () => { await clearInventory(); setInventory({ assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY, editableFields: inventory.editableFields, qrCodeFields: inventory.qrCodeFields }); }} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
          {screen === AppScreen.LOAD_DATABASE && <DatabaseLoader onBack={popScreen} onDataLoaded={(a, c) => { setInventory({ ...inventory, assets: a, companies: c, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); pushScreen(AppScreen.MAIN_MENU); }} />}
          {screen === AppScreen.INVENTORY && <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} onAddNewLocation={addNewLocation} locationsWithStats={locationsWithStats} />}
          {screen === AppScreen.LABELING && <Labeling assets={filteredAssetsByCompany} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} uniqueCentrosDeCusto={uniqueCentrosDeCusto} selectedCompany={selectedCompany} />}
          {screen === AppScreen.CONSULTATION && <Consultation assets={filteredAssetsByCompany} onBack={popScreen} onSelectAsset={handleSelectAsset} qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} />}
          {screen === AppScreen.ASSET_DETAIL && selectedAssets.length > 0 && <AssetDetail assets={selectedAssets} onBack={popScreen} onUpdate={updateAsset} onBulkUpdate={bulkUpdateAssets} editableFields={inventory.editableFields || []} qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} uniqueEnderecos={allLocations} uniqueCentrosDeCusto={uniqueCentrosDeCusto} />}
          {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); setInventoryLocation(null); pushScreen(AppScreen.INVENTORY); }} onBack={popScreen} />}
          {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
          {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
          {screen === AppScreen.FIELD_CONFIGURATOR && <FieldConfigurator assets={inventory.assets} currentEditable={inventory.editableFields || []} onSave={(f) => setInventory(prev => ({ ...prev, editableFields: f }))} onBack={popScreen} />}
          {screen === AppScreen.QR_CODE_CONFIGURATOR && <QrCodeConfigurator assets={inventory.assets} currentQrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} onSave={(f) => setInventory(prev => ({ ...prev, qrCodeFields: f }))} onBack={popScreen} />}
        </div>
  
        {/* Floating Immersive Mode Toggle (Draggable) */}
        {user && (
          <div className="fixed z-[999] flex flex-col items-center space-y-2" style={{ left: `${buttonPos.x}px`, top: `${buttonPos.y}px` }}>
            {inventory.status !== DatabaseStatus.EMPTY && (
              <div className="bg-emerald-500 text-white text-[8px] font-bold px-2 py-1 rounded-full shadow-lg animate-pulse uppercase tracking-tighter">
                Banco Protegido
              </div>
            )}
            <button 
              onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
              onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
              onMouseMove={(e) => e.buttons === 1 && handleMove(e.clientX, e.clientY)}
              onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
              onClick={toggleFullscreen}
              className="w-14 h-14 bg-slate-900/90 backdrop-blur-md text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform border border-white/10 touch-none select-none"
              title={isFullscreen ? "Sair do Modo Imersivo" : "Entrar no Modo Imersivo"}
            >
              {isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
