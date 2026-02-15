
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
      } catch (e) {
        console.warn("Storage cap reached");
      }
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

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    const sel = String(selectedCompany).toUpperCase().trim();
    return inventory.assets.filter(a => String(a._empresaNormalizada || '').toUpperCase().trim() === sel);
  }, [inventory.assets, selectedCompany]);

  const getOriginalLocation = (asset: Asset): string => {
    if (asset._localizacaoOriginal) return asset._localizacaoOriginal.toUpperCase().trim();
    for (const key of LOC_KEYS) {
      const matchKey = Object.keys(asset).find(k => k.toUpperCase() === key);
      if (matchKey && asset[matchKey]) return String(asset[matchKey]).toUpperCase().trim();
    }
    return "";
  };

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const index = prev.assets.findIndex(a => String(a.id) === String(updatedAsset.id));
      const newAssets = [...prev.assets];
      const targetLocation = (inventoryLocation || "").toUpperCase().trim();
      const updates: any = { ...updatedAsset };
      
      const currentComp = (selectedCompany || "GERAL").toUpperCase().trim();
      updates._empresaNormalizada = currentComp;

      if (!updates.PLAQUETA) {
          for(const k of PLAQUETA_KEYS) {
              const match = Object.keys(updates).find(uk => uk.toUpperCase() === k);
              if (match) { updates.PLAQUETA = String(updates[match]).toUpperCase().trim(); break; }
          }
      }

      const originalLoc = index !== -1 ? getOriginalLocation(prev.assets[index]) : "";

      if (index === -1) {
          updates.TAG_INVENTARIO = "INCLUSAO";
          updates._isNew = true;
          updates._conferido = true;
          updates._localizacaoOriginal = "";
          LOC_KEYS.forEach(k => updates[k] = targetLocation);
          updates['LOCALIZACAO'] = targetLocation;
          newAssets.push(updates);
      } else {
          const alreadyConferido = !!prev.assets[index]._conferido;
          const currentAsset = prev.assets[index];
          if (!currentAsset._localizacaoOriginal) {
            updates._localizacaoOriginal = originalLoc;
          }
          if (originalLoc && originalLoc !== targetLocation) {
              updates.TAG_INVENTARIO = alreadyConferido ? "RE-ADOTADO NO INVENTARIO" : "ADOTADO";
              updates.TAG_ADOCAO = alreadyConferido ? "RE-ADOTADO" : "ADOTADO";
          } else {
              updates.TAG_INVENTARIO = "CONFERIDO";
          }
          updates._conferido = true;
          LOC_KEYS.forEach(k => {
            const found = Object.keys(updates).find(ak => ak.toUpperCase() === k);
            if (found) updates[found] = targetLocation;
          });
          updates['LOCALIZACAO'] = targetLocation;
          newAssets[index] = updates;
      }
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString(), status: DatabaseStatus.IN_USE };
    });
  }, [inventoryLocation, selectedCompany]);

  const bulkUpdateAssets = useCallback((ids: string[]) => {
    const idSet = new Set(ids.map(id => String(id)));
    const targetLocation = (inventoryLocation || "").toUpperCase().trim();
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { ...a };
          const originalLoc = getOriginalLocation(a);
          const alreadyConferido = !!a._conferido;
          if (!updates._localizacaoOriginal) updates._localizacaoOriginal = originalLoc;
          if (originalLoc && originalLoc !== targetLocation) {
            updates.TAG_INVENTARIO = alreadyConferido ? "RE-ADOTADO NO INVENTARIO" : "ADOTADO";
            updates.TAG_ADOCAO = alreadyConferido ? "RE-ADOTADO" : "ADOTADO";
          } else {
            updates.TAG_INVENTARIO = "CONFERIDO";
          }
          updates._conferido = true;
          LOC_KEYS.forEach(k => {
            const found = Object.keys(updates).find(ak => ak.toUpperCase() === k);
            if (found) updates[found] = targetLocation;
          });
          updates['LOCALIZACAO'] = targetLocation;
          return updates;
        }
        return a;
      }),
      lastUpdated: new Date().toISOString(),
      status: DatabaseStatus.IN_USE
    }));
  }, [inventoryLocation]);

  const handleExport = () => {
    if (inventory.assets.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(inventory.assets.map(a => {
      const res: any = {};
      Object.keys(a).forEach(k => { if (!k.startsWith('_') && k !== 'id') res[k] = a[k]; });
      res['STATUS_INV'] = a.TAG_INVENTARIO || 'PENDENTE';
      res['CONFERIDO'] = a._conferido ? 'SIM' : 'NAO';
      return res;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario_GBR");
    // O navegador direcionará automaticamente para a pasta de Downloads
    XLSX.writeFile(wb, `INVENTARIO_GBR_${new Date().getTime()}.xlsx`);
  };

  const handleClearDatabase = () => {
    if (confirm("ATENÇÃO: Deseja realmente APAGAR permanentemente todos os ativos do aplicativo? Esta ação não pode ser desfeita.")) {
        setInventory({ assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY });
        setSelectedCompany(null);
        setInventoryLocation(null);
        setIsInventorying(false);
        pushScreen(AppScreen.MAIN_MENU);
        alert("Base de dados limpa com sucesso.");
    }
  };

  const handleDataCommit = (assets: any[], companies: string[]) => {
    setIsSaving(true);
    setTimeout(() => {
      setInventory({ assets, companies, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); 
      setIsSaving(false);
      pushScreen(AppScreen.MAIN_MENU); 
    }, 300);
  };

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  if (isSaving) {
    return (
      <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="text-indigo-500 animate-spin" size={32} />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Otimizando Dados</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative font-sans max-w-full">
      {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); u.mustChangePassword ? pushScreen(AppScreen.CHANGE_PASSWORD) : pushScreen(AppScreen.MAIN_MENU); }} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />}
      {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
      {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { 
        const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u);
        setUsers(upd); setUser(upd.find(u => u.email === user?.email)!); pushScreen(AppScreen.MAIN_MENU); 
      }} />}
      {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} onClearDatabase={handleClearDatabase} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
      {screen === AppScreen.LOAD_DATABASE && <DatabaseLoader onBack={popScreen} onDataLoaded={handleDataCommit} />}
      {screen === AppScreen.INVENTORY && <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} />}
      {screen === AppScreen.CONSULTATION && <Consultation assets={filteredAssetsByCompany} onBack={popScreen} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} allAssets={inventory.assets} />}
      {screen === AppScreen.ASSET_DETAIL && selectedAsset && <AssetDetail asset={selectedAsset} onBack={popScreen} onUpdate={updateAsset} />}
      {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); setInventoryLocation(null); pushScreen(AppScreen.INVENTORY); }} onBack={popScreen} />}
      {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
      {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
    </div>
  );
};

export default App;
