
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
import { Loader2, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

const ADMIN_EMAIL = "semorr@gmail.com";
const LOC_KEYS = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'ENDEREÇO', 'LOCALIZAÇÃO', 'LOCAL'];

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

  useEffect(() => {
    try {
      localStorage.setItem('inventory_data', JSON.stringify(inventory));
    } catch (e) {
      console.warn("Cota de Armazenamento Excedida.");
    }
    localStorage.setItem('app_screen_history', JSON.stringify(history));
    localStorage.setItem('app_current_user', JSON.stringify(user));
    localStorage.setItem('app_users', JSON.stringify(users));
    localStorage.setItem('app_selected_company', selectedCompany || '');
    localStorage.setItem('app_inventory_location', inventoryLocation || '');
    localStorage.setItem('app_is_inventorying', String(isInventorying));
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
    const sel = selectedCompany.toUpperCase();
    return inventory.assets.filter(a => a._empresaNormalizada === sel);
  }, [inventory.assets, selectedCompany]);

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const index = prev.assets.findIndex(a => String(a.id) === String(updatedAsset.id));
      const newAssets = [...prev.assets];
      const targetLocation = inventoryLocation ? inventoryLocation.toUpperCase().trim() : "";
      
      const updates: any = { ...updatedAsset };
      let originalLocation = "";
      
      // Identifica localização original para determinar se é adoção
      if (index !== -1) {
        const oldAsset = prev.assets[index];
        for(const k of LOC_KEYS) {
            const match = Object.keys(oldAsset).find(ak => ak.toUpperCase() === k.toUpperCase());
            if (match) { originalLocation = String(oldAsset[match]).toUpperCase().trim(); break; }
        }
      }

      // Aplica novas localizações nos campos mapeados
      LOC_KEYS.forEach(k => {
        const found = Object.keys(updates).find(ak => ak.toUpperCase() === k.toUpperCase());
        if (found) updates[found] = targetLocation;
      });
      updates['LOCALIZACAO'] = targetLocation;

      // Lógica de Tags para Inventário Perfeito
      if (index === -1) {
          updates.TAG_INVENTARIO = "INCLUSAO";
          updates._isNew = true;
          updates._conferido = true;
          newAssets.push(updates);
      } else {
          const wasConferido = !!prev.assets[index]._conferido;
          // Se mudou de local, aplicamos adoção ou re-adoção
          if (originalLocation && originalLocation !== targetLocation) {
              updates.TAG_INVENTARIO = wasConferido ? "RE-ADOTADO NO INVENTARIO" : "ADOTADO";
              updates.TAG_ADOCAO = wasConferido ? "RE-ADOTADO" : "ADOTADO";
          } else {
              updates.TAG_INVENTARIO = "CONFERIDO";
          }
          updates._conferido = true;
          newAssets[index] = updates;
      }
      
      return { ...prev, assets: newAssets, lastUpdated: new Date().toISOString(), status: DatabaseStatus.IN_USE };
    });
  }, [inventoryLocation]);

  const bulkUpdateAssets = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    const targetLocation = inventoryLocation ? inventoryLocation.toUpperCase().trim() : "";
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { ...a };
          let originalLocation = "";
          
          for(const k of LOC_KEYS) {
            const match = Object.keys(updates).find(ak => ak.toUpperCase() === k.toUpperCase());
            if (match) { originalLocation = String(updates[match]).toUpperCase().trim(); break; }
          }

          LOC_KEYS.forEach(k => {
            const found = Object.keys(updates).find(ak => ak.toUpperCase() === k.toUpperCase());
            if (found) updates[found] = targetLocation;
          });
          updates['LOCALIZACAO'] = targetLocation;

          const wasConferido = !!a._conferido;
          if (originalLocation && originalLocation !== targetLocation) {
            updates.TAG_INVENTARIO = wasConferido ? "RE-ADOTADO NO INVENTARIO" : "ADOTADO";
            updates.TAG_ADOCAO = wasConferido ? "RE-ADOTADO" : "ADOTADO";
          } else {
            updates.TAG_INVENTARIO = "CONFERIDO";
          }
          updates._conferido = true;
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
    XLSX.writeFile(wb, `INVENTARIO_GBR_${new Date().getTime()}.xlsx`);
    if (confirm("Exportação concluída. Deseja descarregar e limpar a base local para um novo projeto?")) {
      setInventory({ assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY });
      setSelectedCompany(null);
      pushScreen(AppScreen.MAIN_MENU);
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
      <div className="w-full h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
        <Loader2 className="text-blue-500 animate-spin" size={40} strokeWidth={3} />
        <div className="text-center">
          <h2 className="text-sm font-black text-white uppercase tracking-widest italic">Salvando Dados</h2>
          <p className="text-[7px] font-black text-blue-400 uppercase tracking-widest mt-1 animate-pulse">Base de Conhecimento Local</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-white shadow-2xl overflow-hidden relative font-sans max-w-full">
      {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); u.mustChangePassword ? pushScreen(AppScreen.CHANGE_PASSWORD) : pushScreen(AppScreen.MAIN_MENU); }} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />}
      {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
      {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { 
        const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u);
        setUsers(upd); setUser(upd.find(u => u.email === user?.email)!); pushScreen(AppScreen.MAIN_MENU); 
      }} />}
      {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
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
