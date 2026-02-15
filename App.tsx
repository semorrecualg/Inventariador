
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppScreen, User, Asset, InventoryState, DatabaseStatus } from './types';
import Login from './components/Login';
import Register from './components/Register';
import MainMenu from './components/MainMenu';
import DatabaseLoader from './components/DatabaseLoader';
import AssetDetail from './components/AssetDetail';
import Inventory from './components/Inventory';
import Consultation from './components/Consultation';
import CompanySelector from './components/CompanySelector';
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import ChangePassword from './components/ChangePassword';
import { Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const ADMIN_EMAIL = "semorr@gmail.com";
const LOC_KEYS = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'LOCAL'];
const PLAQUETA_KEYS = ['PLAQUETA', 'ETIQUETA', 'PATRIMONIO', 'TAG', 'BEM'];

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

  const [inventory, setInventory] = useState<InventoryState>(() => {
    try {
      const saved = localStorage.getItem('inventory_data');
      return saved ? JSON.parse(saved) : { assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY };
    } catch { 
      return { assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY }; 
    }
  });

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('app_users');
      let userList: User[] = saved ? JSON.parse(saved) : [];
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

  const [isSaving, setIsSaving] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const databaseHeaders = useMemo(() => {
    if (inventory.assets.length === 0) return [];
    const keys = new Set<string>();
    inventory.assets.slice(0, 100).forEach(a => {
      Object.keys(a).forEach(k => {
        if (!k.startsWith('_') && k !== 'id' && k !== 'PLAQUETA_INVENTARIO' && k !== 'TAG_INVENTARIO') {
          keys.add(k);
        }
      });
    });
    return Array.from(keys).sort();
  }, [inventory.assets]);

  const enterImmersiveMode = useCallback(() => {
    const doc = document.documentElement;
    if (!document.fullscreenElement) {
      if (doc.requestFullscreen) {
        doc.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      } else if ((doc as any).webkitRequestFullscreen) {
        (doc as any).webkitRequestFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    const handleFirstTouch = () => enterImmersiveMode();
    window.addEventListener('click', handleFirstTouch);
    window.addEventListener('touchstart', handleFirstTouch);
    return () => {
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('touchstart', handleFirstTouch);
    };
  }, [enterImmersiveMode]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('inventory_data', JSON.stringify(inventory));
        localStorage.setItem('app_screen_history', JSON.stringify(history));
        localStorage.setItem('app_current_user', JSON.stringify(user));
        localStorage.setItem('app_users', JSON.stringify(users));
        localStorage.setItem('app_selected_company', selectedCompany || '');
        localStorage.setItem('app_inventory_location', inventoryLocation || '');
        localStorage.setItem('app_is_inventorying', String(isInventorying));
      } catch (e) { console.warn("Storage cap reached"); }
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedCompany, inventoryLocation, isInventorying]);

  const pushScreen = (s: AppScreen) => {
    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) setHistory([s]);
    else setHistory(prev => [...prev, s]);
  };

  const popScreen = () => {
    setSelectedAsset(null);
    setHistory(prev => prev.length > 1 ? prev.slice(0, -1) : [AppScreen.MAIN_MENU]);
  };

  const formatDateValue = (val: any): string => {
    if (!val || val === '---' || val === '0' || val === 'NULL') return '---';
    const strVal = String(val).trim();
    if (!isNaN(Number(strVal)) && Number(strVal) > 30000 && Number(strVal) < 60000) {
      const date = new Date((Number(strVal) - 25569) * 86400 * 1000);
      return date.toLocaleDateString('pt-BR');
    }
    const d = new Date(strVal);
    if (!isNaN(d.getTime()) && (strVal.includes('-') || strVal.includes('/'))) {
      return d.toLocaleDateString('pt-BR');
    }
    return strVal;
  };

  const checkIsBaixado = useCallback((item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA'];
    for (const term of terms) {
      const val = String(item[term] || '').trim();
      if (val !== "" && val !== "---" && val !== "0" && val.toUpperCase() !== "NULL") return true;
    }
    return false;
  }, []);

  const determineTag = (asset: Asset, targetLocation: string): string => {
    if (asset._isNew) return "NOVO ITEM INCLUÍDO";
    if (checkIsBaixado(asset)) return "RE-ADOTADO NO INVENTARIO";
    
    let originalLoc = '';
    for(const k of LOC_KEYS) { 
      const found = Object.keys(asset).find(ak => ak.toUpperCase() === k);
      if (found && asset[found]) { originalLoc = String(asset[found]).toUpperCase().trim(); break; }
    }

    let originalPlaqueta = '';
    for(const k of PLAQUETA_KEYS) {
      if(asset[k]) { originalPlaqueta = String(asset[k]).trim(); break; }
    }

    if (asset.PLAQUETA_INVENTARIO && originalPlaqueta && asset.PLAQUETA_INVENTARIO !== originalPlaqueta) {
      return "DIVERGENCIA";
    }

    if (originalLoc && originalLoc !== targetLocation.toUpperCase().trim()) {
      return "ADOTADO";
    }
    return "CONFERIDO";
  };

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const newAssets = [...prev.assets];
      const index = newAssets.findIndex(a => String(a.id) === String(updatedAsset.id));
      const targetLoc = (inventoryLocation || "SEM LOCAL").toUpperCase().trim();
      
      const updates: any = { ...updatedAsset };
      updates._conferido = true;
      updates.TAG_INVENTARIO = determineTag(updates, targetLoc);

      // Normalização de Localização
      LOC_KEYS.forEach(k => {
        const found = Object.keys(updates).find(ak => ak.toUpperCase() === k);
        if (found) updates[found] = targetLoc;
      });
      updates['LOCALIZACAO'] = targetLoc;

      if (index === -1) {
        newAssets.push(updates);
      } else {
        newAssets[index] = updates;
      }
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString(), status: DatabaseStatus.IN_USE };
    });
  }, [inventoryLocation, determineTag]);

  const bulkUpdateAssets = useCallback((ids: string[]) => {
    const idSet = new Set(ids.map(id => String(id)));
    const targetLoc = (inventoryLocation || "SEM LOCAL").toUpperCase().trim();
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { ...a, _conferido: true };
          updates.TAG_INVENTARIO = determineTag(updates, targetLoc);
          LOC_KEYS.forEach(k => {
            const found = Object.keys(updates).find(ak => ak.toUpperCase() === k);
            if (found) (updates as any)[found] = targetLoc;
          });
          updates['LOCALIZACAO'] = targetLoc;
          return updates;
        }
        return a;
      }),
      lastUpdated: new Date().toISOString(),
      status: DatabaseStatus.IN_USE
    }));
  }, [inventoryLocation, determineTag]);

  const handleExport = () => {
    if (inventory.assets.length === 0) return;
    const wsData = inventory.assets.map(a => {
      const res: any = {};
      let plaquetaOrig = '';
      for(const k of PLAQUETA_KEYS) { if(a[k]) { plaquetaOrig = String(a[k]).trim(); break; } }

      Object.keys(a).forEach(k => { 
        if (!k.startsWith('_') && k !== 'id') {
           let val = a[k];
           const isDateField = k.toUpperCase().includes('DATA') || k.toUpperCase().includes('DT_');
           if (isDateField) val = formatDateValue(val);
           res[k] = val; 
        }
      });

      res['PLAQUETA_MASTER'] = plaquetaOrig;
      res['PLAQUETA_INVENTARIO'] = a.PLAQUETA_INVENTARIO || plaquetaOrig;
      res['CONFERIDO'] = a._conferido ? 'SIM' : 'NAO';
      res['STATUS_POLITICA'] = a.TAG_INVENTARIO || 'PENDENTE';
      res['DIVERGENCIA_IDENTIFICACAO'] = (a.PLAQUETA_INVENTARIO && a.PLAQUETA_INVENTARIO !== plaquetaOrig) ? 'SIM' : 'NAO';
      
      return res;
    });

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GBR_AUDIT_DATA");
    XLSX.writeFile(wb, `GBR_AUDITORIA_${new Date().getTime()}.xlsx`);
  };

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    const sel = String(selectedCompany).toUpperCase().trim();
    return inventory.assets.filter(a => String(a._empresaNormalizada || '').toUpperCase().trim() === sel);
  }, [inventory.assets, selectedCompany]);

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  if (isSaving) return <div className="w-full h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="text-indigo-500 animate-spin" /></div>;

  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative font-sans max-w-full">
      {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); u.mustChangePassword ? pushScreen(AppScreen.CHANGE_PASSWORD) : pushScreen(AppScreen.MAIN_MENU); }} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />}
      {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
      {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u); setUsers(upd); pushScreen(AppScreen.MAIN_MENU); }} />}
      {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} onClearDatabase={() => setInventory({ assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY })} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
      {screen === AppScreen.LOAD_DATABASE && <DatabaseLoader onBack={popScreen} onDataLoaded={(a, c) => { setInventory({ assets: a, companies: c, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); pushScreen(AppScreen.MAIN_MENU); }} />}
      {screen === AppScreen.INVENTORY && <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} databaseHeaders={databaseHeaders} />}
      {screen === AppScreen.CONSULTATION && <Consultation assets={filteredAssetsByCompany} onBack={popScreen} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} />}
      {screen === AppScreen.ASSET_DETAIL && selectedAsset && <AssetDetail asset={selectedAsset} onBack={popScreen} onUpdate={updateAsset} databaseHeaders={databaseHeaders} />}
      {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); setInventoryLocation(null); pushScreen(AppScreen.INVENTORY); }} onBack={popScreen} />}
      {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
      {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
    </div>
  );
};

export default App;
