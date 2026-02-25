
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

import { Building2 } from 'lucide-react';
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
    const defaultState: InventoryState = { 
      assets: [], 
      companies: [], 
      lastUpdated: null, 
      status: DatabaseStatus.EMPTY,
      editableFields: ['DESCRICAODOATIVO', 'SERIAL', 'ENDERECO'],
      qrCodeFields: ['ETIQUETA']
    };

    try {
      const saved = localStorage.getItem('inventory_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          // Garante que campos de configuração existam mesmo em migrações de versão
          editableFields: parsed.editableFields || defaultState.editableFields,
          qrCodeFields: parsed.qrCodeFields || defaultState.qrCodeFields
        };
      }
      return defaultState;
    } catch { 
      return defaultState; 
    }
  });

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

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizeKey = useCallback((s: string) => {
    return s.toString().toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }, []);

  const [allLocations, setAllLocations] = useState<string[]>([]);

  useEffect(() => {
    const locationsFromAssets = new Set<string>();
    inventory.assets.forEach(a => {
      if (a.ENDERECO) locationsFromAssets.add(String(a.ENDERECO).trim().toUpperCase());
    });

    setAllLocations(prevLocations => {
      const combined = new Set([...prevLocations, ...locationsFromAssets]);
      const sorted = Array.from(combined).sort();
      if (JSON.stringify(sorted) === JSON.stringify(prevLocations)) {
        return prevLocations;
      }
      return sorted;
    });
  }, [inventory.assets]);

  const uniqueEnderecos = useMemo(() => {
    const set = new Set<string>();
    inventory.assets.forEach(a => { if (a.ENDERECO) set.add(String(a.ENDERECO).trim().toUpperCase()); });
    return Array.from(set).sort();
  }, [inventory.assets]);

  const uniqueCentrosDeCusto = useMemo(() => {
    const set = new Set<string>();
    inventory.assets.forEach(a => { if (a.CENTRODECUSTO) set.add(String(a.CENTRODECUSTO).trim().toUpperCase()); });
    return Array.from(set).sort();
  }, [inventory.assets]);

  // REATIVAÇÃO E REFINAMENTO DAS REGRAS DE OURO (FLAGS)
  const determineTag = useCallback((asset: Asset, targetLocation: string): TagInventario => {
    const statusUpper = String(asset.STATUS || '').toUpperCase();
    const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;
    
    // B) BAIXADO: STATUS É PERMANENTE E IMUTÁVEL
    if (isBaixado) return TagInventario.BAIXADO;
    
    // 5) ADOTADO EXTERNO (Se a empresa for diferente da selecionada)
    const assetCompKey = normalizeKey(asset.EMPRESA || '');
    const currentCompKey = normalizeKey(selectedCompany || '');
    if (assetCompKey !== "" && assetCompKey !== currentCompKey) {
      return TagInventario.ADOTADO_EXTERNO;
    }

    // Se o item for marcado para etiquetar na base mestre
    const needsLabel = normalizeKey(asset.ETIQUETA || '') === 'ETIQUETAR';
    if (needsLabel) return asset._conferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR;
    
    // 4) NOVO ITEM
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
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('inventory_data', JSON.stringify(inventory));
        localStorage.setItem('app_screen_history', JSON.stringify(history));
        localStorage.setItem('app_current_user', JSON.stringify(user));
        localStorage.setItem('app_users', JSON.stringify(users));
        localStorage.setItem('app_selected_company', selectedCompany || '');
        localStorage.setItem('app_inventory_location', inventoryLocation || '');
        localStorage.setItem('app_is_inventorying', String(isInventorying));
      } catch { console.warn("Storage cap reached"); }
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [inventory, history, user, users, selectedCompany, inventoryLocation, isInventorying]);

  const pushScreen = (s: AppScreen) => {
    if (s === AppScreen.LOGIN || s === AppScreen.MAIN_MENU) setHistory([s]);
    else setHistory(prev => [...prev, s]);
  };

  const popScreen = () => {
    setSelectedAssets([]);
    setHistory(prev => prev.length > 1 ? prev.slice(0, -1) : [AppScreen.MAIN_MENU]);
  };

  const updateAsset = useCallback((updatedAsset: Asset) => {
    setInventory(prev => {
      const newAssets = [...prev.assets];
      const index = newAssets.findIndex(a => String(a.id) === String(updatedAsset.id));
      const targetLoc = (inventoryLocation || "SEM LOCAL").toUpperCase().trim();
      
      const updates = { ...updatedAsset };
      updates._conferido = true;
      
      const alteredFields = new Set<string>(updates._camposAlterados || []);
      
      const existingAsset = index !== -1 ? newAssets[index] : null;
      if (existingAsset) {
        Object.keys(updates).forEach(key => {
          if (key.startsWith('_') || key === 'id' || key === 'TAG_INVENTARIO') return;
          if (String(updates[key]) !== String(existingAsset[key])) alteredFields.add(key);
        });
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
  }, [inventoryLocation, determineTag, normalizeKey]);

  const addNewLocation = (newLocation: string) => {
    const upperCaseLocation = newLocation.toUpperCase().trim();
    if (upperCaseLocation && !allLocations.includes(upperCaseLocation)) {
      setAllLocations(prev => [...prev, upperCaseLocation].sort());
    }
  };

  const bulkUpdateAssets = useCallback((ids: string[]) => {
    const idSet = new Set(ids.map(id => String(id)));
    const targetLoc = (inventoryLocation || "SEM LOCAL").toUpperCase().trim();
    
    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => {
        if (idSet.has(String(a.id))) {
          const updates = { ...a };
          updates._conferido = true;
          const alteredFields = new Set<string>(updates._camposAlterados || []);
          
          if (normalizeKey(String(updates.ENDERECO)) !== normalizeKey(targetLoc)) alteredFields.add('ENDERECO');
          updates._localMaster = targetLoc;
          updates.ENDERECO = targetLoc; 
          
          updates.TAG_INVENTARIO = determineTag(updates, targetLoc);
          updates._camposAlterados = Array.from(alteredFields);
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
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative font-sans max-w-full flex flex-col">
      {showCompanyHeader && (
        <div className="bg-sky-600 px-6 py-2.5 flex items-center space-x-3 shadow-lg z-[200]">
           <Building2 size={16} className="text-white shrink-0" />
           <div className="flex-1 min-w-0">
             <p className="text-[7px] font-black text-white/60 uppercase tracking-widest leading-none mb-0.5">Empresa em Auditoria</p>
             <h2 className="text-[11px] font-black text-white uppercase truncate tracking-tight">{selectedCompany}</h2>
           </div>
           <div className="px-2 py-0.5 rounded bg-white/20 border border-white/20">
             <span className="text-[7px] font-black text-white uppercase tracking-widest">v24.50 PRO</span>
           </div>
        </div>
      )}
      
      <div className="flex-1 relative overflow-hidden">
        {screen === AppScreen.LOGIN && <Login users={users} onLogin={(u) => { setUser(u); if (u.mustChangePassword) { pushScreen(AppScreen.CHANGE_PASSWORD); } else { pushScreen(AppScreen.MAIN_MENU); } }} />}
        {screen === AppScreen.REGISTER && <Register onRegister={(u) => { setUsers(p => [...p, u]); setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={popScreen} />}
        {screen === AppScreen.CHANGE_PASSWORD && <ChangePassword onPasswordChanged={(p) => { const upd = users.map(u => u.email === user?.email ? { ...u, password: p, mustChangePassword: false } : u); setUsers(upd); pushScreen(AppScreen.MAIN_MENU); }} />}
        {screen === AppScreen.MAIN_MENU && <MainMenu onNavigate={pushScreen} onLogout={() => { setUser(null); setSelectedCompany(null); pushScreen(AppScreen.LOGIN); }} onExport={handleExport} onClearDatabase={() => setInventory({ ...inventory, assets: [], companies: [], lastUpdated: null, status: DatabaseStatus.EMPTY })} user={user} inventoryInfo={{ count: filteredAssetsByCompany.length, totalDatabase: inventory.assets.length, date: inventory.lastUpdated }} />}
        {screen === AppScreen.LOAD_DATABASE && <DatabaseLoader onBack={popScreen} onDataLoaded={(a, c) => { setInventory({ ...inventory, assets: a, companies: c, lastUpdated: new Date().toISOString(), status: DatabaseStatus.LOADED }); pushScreen(AppScreen.MAIN_MENU); }} />}
        {screen === AppScreen.INVENTORY && <Inventory assets={filteredAssetsByCompany} allAssets={inventory.assets} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} selectedLocation={inventoryLocation} setSelectedLocation={setInventoryLocation} isInventorying={isInventorying} setIsInventorying={setIsInventorying} selectedCompany={selectedCompany} uniqueEnderecos={allLocations} onAddNewLocation={addNewLocation} />}
        {screen === AppScreen.LABELING && <Labeling assets={filteredAssetsByCompany} onBack={popScreen} onUpdateAsset={updateAsset} onBulkUpdateAssets={bulkUpdateAssets} onSelectAsset={handleSelectAsset} uniqueCentrosDeCusto={uniqueCentrosDeCusto} selectedCompany={selectedCompany} />}
        {screen === AppScreen.CONSULTATION && <Consultation assets={filteredAssetsByCompany} onBack={popScreen} onSelectAsset={handleSelectAsset} qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} />}
        {screen === AppScreen.ASSET_DETAIL && selectedAssets.length > 0 && <AssetDetail assets={selectedAssets} onBack={popScreen} onUpdate={updateAsset} onBulkUpdate={bulkUpdateAssets} editableFields={inventory.editableFields || []} qrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} uniqueEnderecos={uniqueEnderecos} uniqueCentrosDeCusto={uniqueCentrosDeCusto} />}
        {screen === AppScreen.COMPANY_SELECTION && <CompanySelector companies={inventory.companies} onSelect={(c) => { setSelectedCompany(c); setIsInventorying(false); setInventoryLocation(null); pushScreen(AppScreen.INVENTORY); }} onBack={popScreen} />}
        {screen === AppScreen.DASHBOARD && <Dashboard assets={filteredAssetsByCompany} onBack={popScreen} />}
        {screen === AppScreen.USER_MANAGEMENT && <UserManagement users={users} setUsers={setUsers} onBack={popScreen} />}
        {screen === AppScreen.FIELD_CONFIGURATOR && <FieldConfigurator assets={inventory.assets} currentEditable={inventory.editableFields || []} onSave={(f) => setInventory(prev => ({ ...prev, editableFields: f }))} onBack={popScreen} />}
        {screen === AppScreen.QR_CODE_CONFIGURATOR && <QrCodeConfigurator assets={inventory.assets} currentQrCodeFields={inventory.qrCodeFields || ['ETIQUETA']} onSave={(f) => setInventory(prev => ({ ...prev, qrCodeFields: f }))} onBack={popScreen} />}
      </div>
    </div>
  );
};

export default App;
