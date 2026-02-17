
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

  const normalizeKey = useCallback((s: string) => {
    return s.toString().toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }, []);

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

  const determineTag = useCallback((asset: Asset, targetLocation: string): string => {
    if (asset._isNew) return "NOVO ITEM INCLUÍDO";
    const originalLocKey = normalizeKey(asset._localMaster || "");
    const targetLocKey = normalizeKey(targetLocation);
    const originalPlaqueta = String(asset._plaquetaMaster || "").trim();

    if (asset.PLAQUETA_INVENTARIO && originalPlaqueta && asset.PLAQUETA_INVENTARIO !== originalPlaqueta && originalPlaqueta !== "S/ PLACA") {
      return "DIVERGENCIA";
    }
    if (originalLocKey !== targetLocKey) {
      return "ADOTADO";
    }
    return "CONFERIDO";
  }, [normalizeKey]);

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const newAssets = [...prev.assets];
      const index = newAssets.findIndex(a => String(a.id) === String(updatedAsset.id));
      const targetLoc = (inventoryLocation || "SEM LOCAL").toUpperCase().trim();
      
      const updates: any = { ...updatedAsset };
      updates._conferido = true;
      updates.TAG_INVENTARIO = determineTag(updates, targetLoc);
      updates._localMaster = targetLoc;
      
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
          updates._localMaster = targetLoc;
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
      const plaquetaOrig = a._plaquetaMaster || '';
      Object.keys(a).forEach(k => { 
        if (!k.startsWith('_') && k !== 'id') res[k] = a[k];
      });
      res['PLAQUETA_MASTER'] = plaquetaOrig;
      res['PLAQUETA_INVENTARIO'] = a.PLAQUETA_INVENTARIO || plaquetaOrig;
      res['ENDERECO_FISICO_AUDITADO'] = a._localMaster;
      res['STATUS_AUDITORIA'] = a._conferido ? 'SIM' : 'NAO';
      res['POLITICA_INVENTARIO'] = a.TAG_INVENTARIO || 'PENDENTE';
      return res;
    });
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GBR_AUDIT");
    XLSX.writeFile(wb, `GBR_AUDIT_${new Date().getTime()}.xlsx`);
  };

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return inventory.assets; // VISÃO CONSOLIDADA REAL
    const selKey = normalizeKey(selectedCompany);
    return inventory.assets.filter(a => normalizeKey(a._empresaNormalizada || '') === selKey);
  }, [inventory.assets, selectedCompany, normalizeKey]);

  const screen = history[history.length - 1] || AppScreen.LOGIN;

  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative font-sans max-w-full">
      {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); u.mustChangePassword ? pushScreen(AppScreen.CHANGE_PASSWORD) : pushScreen(AppScreen.MAIN_MENU); }} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />}
      {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
      {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u); setUsers(upd); pushScreen(AppScreen.MAIN_MENU); }} />}
      {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} onClearDatabase={() => setInventory({ assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY })} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
      {screen === AppScreen.LOAD_DATABASE && <DatabaseLoader onBack={popScreen} onDataLoaded={(a, c) => { setInventory({ assets: a, companies: c, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); pushScreen(AppScreen.MAIN_MENU); }} />}
      {screen === AppScreen.INVENTORY && <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} />}
      {screen === AppScreen.CONSULTATION && <Consultation assets={filteredAssetsByCompany} onBack={popScreen} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} />}
      {screen === AppScreen.ASSET_DETAIL && selectedAsset && <AssetDetail asset={selectedAsset} onBack={popScreen} onUpdate={updateAsset} />}
      {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); setInventoryLocation(null); pushScreen(AppScreen.INVENTORY); }} onBack={popScreen} />}
      {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
      {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
    </div>
  );
};

export default App;
