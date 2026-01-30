
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
  const [history, setHistory] = useState<AppScreen[]>([AppScreen.LOGIN]);
  const [user, setUser] = useState<User | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(() => {
    return localStorage.getItem('app_selected_company');
  });
  
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('app_users');
    let userList: User[] = saved ? JSON.parse(saved) : [];
    const adminIndex = userList.findIndex(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (adminIndex === -1) {
      userList.push({ username: "ADMIN", email: ADMIN_EMAIL, password: "admin", isAdmin: true, mustChangePassword: false });
    } else {
      userList[adminIndex] = { ...userList[adminIndex], isAdmin: true };
    }
    return userList;
  });

  const [inventory, setInventory] = useState<InventoryState>(() => {
    const saved = localStorage.getItem('inventory_data');
    return saved ? JSON.parse(saved) : { assets: [], companies: [], lastUpdated: null };
  });

  const [inventoryLocation, setInventoryLocation] = useState<string | null>(null);
  const [isInventorying, setIsInventorying] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'pending' | 'checked'>('pending');
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const screen = history[history.length - 1];

  useEffect(() => {
    if (!user && screen !== AppScreen.LOGIN && screen !== AppScreen.REGISTER) {
      setHistory([AppScreen.LOGIN]);
    }
  }, [user, screen]);

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
    localStorage.setItem('app_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (selectedCompany) localStorage.setItem('app_selected_company', selectedCompany);
    else localStorage.removeItem('app_selected_company');
  }, [selectedCompany]);

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    const companyTerms = ['EMPRESA', 'UNIDADE', 'UNID', 'COMPANHIA'];
    const selComp = selectedCompany.trim().toUpperCase();
    return inventory.assets.filter(asset => {
      return Object.entries(asset).some(([key, val]) => 
        companyTerms.includes(key.toUpperCase()) && 
        typeof val === 'string' && val.trim().toUpperCase() === selComp
      );
    });
  }, [inventory.assets, selectedCompany]);

  const updateAsset = useCallback((updatedAsset: Asset) => {
    const assetWithMetadata = {
      ...updatedAsset,
      TAG_INVENTARIO: updatedAsset._conferido ? "CONFERIDO" : "PENDENTE",
      TAG_PLAQUETA: updatedAsset._hasPlaqueta ? "COM PLAQUETA" : "SEM PLAQUETA",
      _conferido: !!updatedAsset._conferido 
    };

    setInventory(prev => {
      // Otimização: encontra o index primeiro para evitar processamento desnecessário
      const index = prev.assets.findIndex(a => a.id === updatedAsset.id);
      if (index === -1) return prev;
      
      const newAssets = [...prev.assets];
      newAssets[index] = assetWithMetadata;
      
      return {
        ...prev,
        assets: newAssets,
        lastUpdated: new Date().toISOString()
      };
    });
    
    // Atualiza o detalhe se estiver aberto
    setSelectedAsset(prev => prev?.id === updatedAsset.id ? assetWithMetadata : prev);
  }, []);

  const handleLogin = (userData: User) => {
    const foundUser = users.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
    if (foundUser) {
      setUser(foundUser);
      if (foundUser.mustChangePassword) pushScreen(AppScreen.CHANGE_PASSWORD);
      else if (inventory.companies.length > 0) pushScreen(AppScreen.COMPANY_SELECTION);
      else pushScreen(AppScreen.MAIN_MENU);
    }
  };

  const handleExportDatabase = () => {
    if (inventory.assets.length === 0) return;
    try {
      const dataToExport = inventory.assets.map(({id, ...rest}) => rest);
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario_Finalizado");
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      XLSX.writeFile(wb, `DESCARGA_${selectedCompany || 'GERAL'}_${timestamp}.xlsx`);
      setTimeout(() => {
        if (window.confirm("Deseja LIMPAR a base interna agora?")) {
          setInventory({ assets: [], companies: [], lastUpdated: null });
          setSelectedCompany(null);
          pushScreen(AppScreen.MAIN_MENU);
        }
      }, 1000);
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
      case AppScreen.COMPANY_SELECTION: return <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setInventoryLocation(null); setIsInventorying(false); pushScreen(AppScreen.MAIN_MENU); }} onBack={() => popScreen()} />;
      case AppScreen.MAIN_MENU: return <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); setSelectedCompany(null); setHistory([AppScreen.LOGIN]); }} onExport={handleExportDatabase} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />;
      case AppScreen.USER_MANAGEMENT: return <UserManagement users={users} setUsers={setUsers} onBack={() => popScreen()} />;
      case AppScreen.DASHBOARD: return <Dashboard assets={filteredAssetsByCompany} onBack={() => popScreen()} />;
      case AppScreen.LOAD_DATABASE: return <DatabaseLoader onBack={() => popScreen()} onDataLoaded={(a, c) => { setInventory({ assets: a, companies: c, lastUpdated: new Date().toISOString() }); pushScreen(AppScreen.COMPANY_SELECTION); }} />;
      case AppScreen.INVENTORY: return <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={() => popScreen()} onUpdateAsset={updateAsset} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} filter={inventoryFilter} setFilter={setInventoryFilter} searchTerm={inventorySearchTerm} setSearchTerm={setInventorySearchTerm} />;
      case AppScreen.CONSULTATION: return <Consultation assets={filteredAssetsByCompany} onBack={() => popScreen()} onSelectAsset={(a) => { setSelectedAsset(a); pushScreen(AppScreen.ASSET_DETAIL); }} />;
      case AppScreen.ASSET_DETAIL: return selectedAsset ? <AssetDetail asset={selectedAsset} onBack={() => popScreen()} onUpdate={updateAsset} availableAddresses={[]} /> : null;
      default: return null;
    }
  };

  return <div className="max-w-md mx-auto h-screen bg-gray-50 shadow-2xl overflow-hidden relative font-sans">{renderScreen()}</div>;
};

export default App;
