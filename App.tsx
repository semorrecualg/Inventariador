
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
      const recovered = saved ? JSON.parse(saved) : [AppScreen.LOGIN];
      return user ? recovered : [AppScreen.LOGIN];
    } catch { return [AppScreen.LOGIN]; }
  });

  const [selectedCompany, setSelectedCompany] = useState<string | null>(() => {
    return localStorage.getItem('app_selected_company');
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
    return localStorage.getItem('app_inventory_location');
  });

  const [isInventorying, setIsInventorying] = useState<boolean>(() => {
    return localStorage.getItem('app_is_inventorying') === 'true';
  });

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  useEffect(() => {
    localStorage.setItem('inventory_data', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('app_screen_history', JSON.stringify(history));
    localStorage.setItem('app_current_user', JSON.stringify(user));
    localStorage.setItem('app_users', JSON.stringify(users));
    localStorage.setItem('app_selected_company', selectedCompany || '');
    localStorage.setItem('app_inventory_location', inventoryLocation || '');
    localStorage.setItem('app_is_inventorying', String(isInventorying));
  }, [history, user, users, selectedCompany, inventoryLocation, isInventorying]);

  const pushScreen = (s: AppScreen) => {
    const rootScreens = [AppScreen.MAIN_MENU, AppScreen.LOGIN];
    if (rootScreens.includes(s)) setHistory([s]);
    else setHistory(prev => [...prev, s]);
  };

  const popScreen = () => setHistory(prev => prev.length > 1 ? prev.slice(0, -1) : [AppScreen.MAIN_MENU]);

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    const sel = selectedCompany.toUpperCase();
    return inventory.assets.filter(a => {
      return Object.values(a).some(v => typeof v === 'string' && v.toUpperCase() === sel);
    });
  }, [inventory.assets, selectedCompany]);

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const index = prev.assets.findIndex(a => String(a.id) === String(updatedAsset.id));
      const newAssets = [...prev.assets];
      if (index === -1) {
        newAssets.push({ ...updatedAsset, _conferido: true, TAG_INVENTARIO: "INCLUSAO" });
      } else {
        newAssets[index] = { ...updatedAsset, TAG_INVENTARIO: updatedAsset._conferido ? "CONFERIDO" : "PENDENTE" };
      }
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString(), status: DatabaseStatus.IN_USE };
    });
  }, []);

  const bulkUpdateAssets = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => idSet.has(String(a.id)) ? { ...a, _conferido: true, TAG_INVENTARIO: a._isNew ? "INCLUSAO" : "CONFERIDO" } : a),
      lastUpdated: new Date().toISOString(),
      status: DatabaseStatus.IN_USE
    }));
  }, []);

  const handleExport = () => {
    if (inventory.assets.length === 0) return;
    const cleanData = inventory.assets.map(a => {
      const res: any = {};
      Object.keys(a).forEach(k => { if (!k.startsWith('_') && k !== 'id') res[k] = a[k]; });
      res['STATUS_INVENTARIO'] = a._conferido ? 'CONFERIDO' : 'PENDENTE';
      return res;
    });
    const ws = XLSX.utils.json_to_sheet(cleanData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, `GBR_INVENTARIO_${new Date().getTime()}.xlsx`);
    
    if (confirm("Exportação concluída. Deseja LIMPAR a base para um novo ciclo?")) {
      setInventory({ assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY });
      setSelectedCompany(null);
      setInventoryLocation(null);
      pushScreen(AppScreen.MAIN_MENU);
    }
  };

  const screen = history[history.length - 1];

  return (
    <div className="max-w-md mx-auto h-screen bg-white shadow-2xl overflow-hidden relative font-sans">
      {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); u.mustChangePassword ? pushScreen(AppScreen.CHANGE_PASSWORD) : pushScreen(AppScreen.MAIN_MENU); }} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />}
      {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
      {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { 
        const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u);
        setUsers(upd); setUser(upd.find(u => u.email === user?.email)!); pushScreen(AppScreen.MAIN_MENU); 
      }} />}
      {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
      {screen === AppScreen.LOAD_DATABASE && <DatabaseLoader onBack={popScreen} onDataLoaded={(a, c) => { setInventory({ assets: a, companies: c, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); pushScreen(AppScreen.COMPANY_SELECTION); }} />}
      {screen === AppScreen.INVENTORY && <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} />}
      {screen === AppScreen.CONSULTATION && <Consultation assets={filteredAssetsByCompany} onBack={popScreen} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} />}
      {screen === AppScreen.ASSET_DETAIL && selectedAsset && <AssetDetail asset={selectedAsset} onBack={popScreen} onUpdate={updateAsset} />}
      {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); pushScreen(AppScreen.MAIN_MENU); }} onBack={popScreen} />}
      {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
      {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
    </div>
  );
};

export default App;
