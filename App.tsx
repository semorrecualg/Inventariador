
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppScreen, User, Asset, InventoryState } from './types';
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
    const saved = localStorage.getItem('app_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [history, setHistory] = useState<AppScreen[]>(() => {
    const saved = localStorage.getItem('app_screen_history');
    const recovered = saved ? JSON.parse(saved) : [AppScreen.LOGIN];
    if (!localStorage.getItem('app_current_user') && recovered[recovered.length-1] !== AppScreen.REGISTER) {
      return [AppScreen.LOGIN];
    }
    return recovered;
  });

  const [selectedCompany, setSelectedCompany] = useState<string | null>(() => {
    return localStorage.getItem('app_selected_company');
  });
  
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('app_users');
    let userList: User[] = saved ? JSON.parse(saved) : [];
    const adminIndex = userList.findIndex(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (adminIndex === -1) {
      userList.push({ username: "ADMIN GBR", email: ADMIN_EMAIL, password: "admin", isAdmin: true, mustChangePassword: false });
      localStorage.setItem('app_users', JSON.stringify(userList));
    }
    return userList;
  });

  const [inventory, setInventory] = useState<InventoryState>(() => {
    const saved = localStorage.getItem('inventory_data');
    return saved ? JSON.parse(saved) : { assets: [], companies: [], lastUpdated: null };
  });

  const [inventoryLocation, setInventoryLocation] = useState<string | null>(() => {
    return localStorage.getItem('app_inventory_location');
  });

  const [isInventorying, setIsInventorying] = useState<boolean>(() => {
    return localStorage.getItem('app_is_inventorying') === 'true';
  });

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const screen = history[history.length - 1];

  useEffect(() => {
    localStorage.setItem('app_screen_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('app_current_user', JSON.stringify(user));
  }, [user]);

  const pushScreen = useCallback((s: AppScreen) => {
    const mainScreens = [AppScreen.MAIN_MENU, AppScreen.INVENTORY, AppScreen.CONSULTATION, AppScreen.LOAD_DATABASE, AppScreen.COMPANY_SELECTION, AppScreen.DASHBOARD, AppScreen.USER_MANAGEMENT];
    if (mainScreens.includes(s)) setHistory([s]);
    else setHistory(prev => [...prev, s]);
  }, []);

  const popScreen = useCallback(() => {
    if (history.length > 1) setHistory(prev => prev.slice(0, -1));
    else setHistory([AppScreen.MAIN_MENU]);
  }, [history.length]);

  useEffect(() => {
    localStorage.setItem('inventory_data', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    if (selectedCompany) localStorage.setItem('app_selected_company', selectedCompany);
    else localStorage.removeItem('app_selected_company');
  }, [selectedCompany]);

  useEffect(() => {
    if (inventoryLocation) localStorage.setItem('app_inventory_location', inventoryLocation);
    else localStorage.removeItem('app_inventory_location');
  }, [inventoryLocation]);

  useEffect(() => {
    localStorage.setItem('app_is_inventorying', String(isInventorying));
  }, [isInventorying]);

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    const companyTerms = ['EMPRESA', 'UNIDADE', 'UNID', 'COMPANHIA', 'FILIAL', 'NOME'];
    const selComp = selectedCompany.trim().toUpperCase();
    return inventory.assets.filter(asset => {
      return Object.entries(asset).some(([key, val]) => 
        companyTerms.includes(key.toUpperCase()) && 
        typeof val === 'string' && val.trim().toUpperCase() === selComp
      );
    });
  }, [inventory.assets, selectedCompany]);

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const index = prev.assets.findIndex(a => String(a.id) === String(updatedAsset.id));
      
      let newAssets;
      if (index === -1) {
        // Se for um novo registro (Inclusão)
        newAssets = [...prev.assets, {
          ...updatedAsset,
          _conferido: true,
          TAG_INVENTARIO: "INCLUSAO"
        }];
      } else {
        // Atualização de registro existente
        newAssets = [...prev.assets];
        newAssets[index] = {
          ...updatedAsset,
          _conferido: !!updatedAsset._conferido,
          TAG_INVENTARIO: updatedAsset._conferido ? (updatedAsset._isNew ? "INCLUSAO" : "CONFERIDO") : "PENDENTE",
        };
      }
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString() };
    });
  }, []);

  const bulkUpdateAssets = useCallback((idsToUpdate: string[]) => {
    if (!idsToUpdate || idsToUpdate.length === 0) return;
    const idSet = new Set(idsToUpdate);
    setInventory(prev => {
      const nextAssets = prev.assets.map(asset => {
        if (idSet.has(String(asset.id))) {
          return { 
            ...asset, 
            _conferido: true, 
            TAG_INVENTARIO: asset._isNew ? "INCLUSAO" : "CONFERIDO" 
          };
        }
        return asset;
      });
      return { ...prev, assets: nextAssets, lastUpdated: new Date().toISOString() };
    });
  }, []);

  const handleLogin = (foundUser: User) => {
    setUser(foundUser);
    if (foundUser.mustChangePassword) {
      pushScreen(AppScreen.CHANGE_PASSWORD);
    } else {
      if (inventory.companies.length > 0 && !selectedCompany) pushScreen(AppScreen.COMPANY_SELECTION);
      else pushScreen(AppScreen.MAIN_MENU);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedCompany(null);
    setInventoryLocation(null);
    setIsInventorying(false);
    setHistory([AppScreen.LOGIN]);
    localStorage.removeItem('app_current_user');
    localStorage.removeItem('app_screen_history');
    localStorage.removeItem('app_selected_company');
    localStorage.removeItem('app_inventory_location');
    localStorage.removeItem('app_is_inventorying');
  };

  const handleExportDatabase = () => {
    if (inventory.assets.length === 0) return;
    try {
      const dataToExport = inventory.assets.map(({id, ...rest}) => {
        // Remover campos internos do export
        const clean: any = {};
        Object.keys(rest).forEach(k => {
          if (!k.startsWith('_')) clean[k] = rest[k];
        });
        return clean;
      });
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario_GBR");
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      XLSX.writeFile(wb, `GBR_EXPORT_${selectedCompany || 'GERAL'}_${timestamp}.xlsx`);
      
      if (confirm("Download concluído. Limpar base local para novo ciclo?")) {
        setInventory({ assets: [], companies: [], lastUpdated: null });
        setSelectedCompany(null);
        setInventoryLocation(null);
        setIsInventorying(false);
        pushScreen(AppScreen.MAIN_MENU);
      }
    } catch (e) { alert("Erro ao exportar."); }
  };

  const renderScreen = () => {
    switch (screen) {
      case AppScreen.LOGIN: return <Login users={users} onLogin={handleLogin} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />;
      case AppScreen.REGISTER: return <Register onRegister={(u) => { setUsers(prev => [...prev, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={() => popScreen()} />;
      case AppScreen.CHANGE_PASSWORD: return <ChangePassword onPasswordChanged={(p) => { 
        const upd = users.map(u => u.email.toLowerCase() === user?.email.toLowerCase() ? { ...u, password: p, mustChangePassword: false } : u);
        setUsers(upd);
        setUser(upd.find(u => u.email.toLowerCase() === user?.email.toLowerCase())!);
        inventory.companies.length > 0 ? pushScreen(AppScreen.COMPANY_SELECTION) : pushScreen(AppScreen.MAIN_MENU);
      }} />;
      case AppScreen.MAIN_MENU: return <MainMenu onNavigate={pushScreen} onLogout={handleLogout} onExport={handleExportDatabase} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />;
      case AppScreen.USER_MANAGEMENT: return <UserManagement users={users} setUsers={setUsers} onBack={() => popScreen()} />;
      case AppScreen.DASHBOARD: return <Dashboard assets={filteredAssetsByCompany} onBack={() => popScreen()} />;
      case AppScreen.LOAD_DATABASE: return <DatabaseLoader onBack={() => popScreen()} onDataLoaded={(a, c) => { setInventory({ assets: a, companies: c, lastUpdated: new Date().toISOString() }); pushScreen(AppScreen.COMPANY_SELECTION); }} />;
      case AppScreen.INVENTORY: return <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={() => popScreen()} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} />;
      case AppScreen.CONSULTATION: return <Consultation assets={filteredAssetsByCompany} onBack={() => popScreen()} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} />;
      case AppScreen.ASSET_DETAIL: return selectedAsset ? <AssetDetail asset={selectedAsset} onBack={() => popScreen()} onUpdate={updateAsset} availableAddresses={[]} /> : null;
      case AppScreen.COMPANY_SELECTION: return <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setInventoryLocation(null); setIsInventorying(false); pushScreen(AppScreen.MAIN_MENU); }} onBack={() => popScreen()} />;
      default: return null;
    }
  };

  return <div className="max-w-md mx-auto h-screen bg-white shadow-2xl overflow-hidden relative font-sans">{renderScreen()}</div>;
};

export default App;
