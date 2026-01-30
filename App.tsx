
import React, { useState, useEffect, useMemo } from 'react';
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
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  const [history, setHistory] = useState<AppScreen[]>([AppScreen.LOGIN]);
  const [user, setUser] = useState<User | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  
  const [inventoryLocation, setInventoryLocation] = useState<string | null>(null);
  const [isInventorying, setIsInventorying] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'pending' | 'checked'>('pending');
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  
  const [inventory, setInventory] = useState<InventoryState>(() => {
    const saved = localStorage.getItem('inventory_data');
    return saved ? JSON.parse(saved) : { assets: [], companies: [], lastUpdated: null };
  });
  
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const screen = history[history.length - 1];

  const pushScreen = (s: AppScreen) => {
    const mainScreens = [
      AppScreen.MAIN_MENU, 
      AppScreen.INVENTORY, 
      AppScreen.CONSULTATION, 
      AppScreen.LOAD_DATABASE, 
      AppScreen.COMPANY_SELECTION, 
      AppScreen.DASHBOARD
    ];
    
    if (mainScreens.includes(s)) {
      setHistory([s]);
    } else {
      setHistory(prev => [...prev, s]);
    }
  };

  const popScreen = () => {
    if (history.length > 1) {
      setHistory(prev => prev.slice(0, -1));
    } else {
      setHistory([AppScreen.MAIN_MENU]);
    }
  };

  useEffect(() => {
    localStorage.setItem('inventory_data', JSON.stringify(inventory));
  }, [inventory]);

  const filteredAssetsByCompany = useMemo(() => {
    if (!selectedCompany) return [];
    const companyTerms = ['EMPRESA', 'UNIDADE', 'UNID', 'COMPANHIA'];
    return inventory.assets.filter(asset => {
      return Object.entries(asset).some(([key, val]) => 
        companyTerms.includes(key.toUpperCase()) && 
        typeof val === 'string' && val.trim().toUpperCase() === selectedCompany.trim().toUpperCase()
      );
    });
  }, [inventory.assets, selectedCompany]);

  const availableAddresses = useMemo(() => {
    const addrs = new Set<string>();
    const terms = ['ENDERECO', 'ENDEREÇO', 'LOCALIZACAO', 'SETOR', 'COD_END'];
    filteredAssetsByCompany.forEach(asset => {
      for (const term of terms) {
        const key = Object.keys(asset).find(k => k.trim().toUpperCase() === term.toUpperCase());
        if (key && asset[key]) {
          addrs.add(String(asset[key]).trim().toUpperCase());
          break;
        }
      }
    });
    return Array.from(addrs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [filteredAssetsByCompany]);

  const handleLogin = (userData: User) => {
    setUser(userData);
    if (inventory.companies.length > 0) {
      pushScreen(AppScreen.COMPANY_SELECTION);
    } else {
      pushScreen(AppScreen.MAIN_MENU);
    }
  };

  const handleCompanySelect = (company: string) => {
    setSelectedCompany(company);
    setInventoryLocation(null);
    setIsInventorying(false);
    pushScreen(AppScreen.MAIN_MENU);
  };

  const handleExportDatabase = () => {
    if (inventory.assets.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }
    try {
      const dataToExport = inventory.assets.map(asset => {
        const { id, ...rest } = asset;
        return rest;
      });
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario_Exportado");
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `INVENTARIO_${selectedCompany || 'GERAL'}_${timestamp}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      alert("Falha ao gerar arquivo de descarga.");
    }
  };

  const updateAsset = (updatedAsset: Asset) => {
    const assetWithMetadata = {
      ...updatedAsset,
      TAG_INVENTARIO: updatedAsset._conferido ? "CONFERIDO" : "PENDENTE",
      TAG_PLAQUETA: updatedAsset._hasPlaqueta ? "COM PLAQUETA" : "SEM PLAQUETA",
      TAG_ADOCAO: updatedAsset.TAG_ADOCAO || "", // Persiste a tag de adoção se existir
      _conferido: !!updatedAsset._conferido 
    };

    setInventory(prev => ({
      ...prev,
      assets: prev.assets.map(a => a.id === updatedAsset.id ? assetWithMetadata : a),
      lastUpdated: new Date().toISOString()
    }));
    
    if (selectedAsset && selectedAsset.id === updatedAsset.id) {
      setSelectedAsset(assetWithMetadata);
    }
  };

  const renderScreen = () => {
    switch (screen) {
      case AppScreen.LOGIN:
        return <Login onLogin={handleLogin} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />;
      case AppScreen.REGISTER:
        return <Register onRegister={(u) => { setUser(u); pushScreen(AppScreen.MAIN_MENU); }} onGoToLogin={() => popScreen()} />;
      case AppScreen.COMPANY_SELECTION:
        return <CompanySelector companies={inventory.companies} onSelect={handleCompanySelect} onBack={() => popScreen()} />;
      case AppScreen.MAIN_MENU:
        return (
          <MainMenu 
            onNavigate={pushScreen} 
            onLogout={() => { setUser(null); setSelectedCompany(null); setHistory([AppScreen.LOGIN]); }} 
            onExport={handleExportDatabase}
            user={user} 
            inventoryInfo={{ count: filteredAssetsByCompany.length, date: inventory.lastUpdated }}
          />
        );
      case AppScreen.DASHBOARD:
        return <Dashboard assets={filteredAssetsByCompany} onBack={() => popScreen()} />;
      case AppScreen.LOAD_DATABASE:
        return (
          <DatabaseLoader 
            onBack={() => popScreen()} 
            onDataLoaded={(assets, companies) => {
              setInventory({ assets, companies, lastUpdated: new Date().toISOString() });
              pushScreen(AppScreen.COMPANY_SELECTION);
            }} 
          />
        );
      case AppScreen.INVENTORY:
        return (
          <Inventory 
            assets={filteredAssetsByCompany} 
            allAssets={inventory.assets}
            onBack={() => popScreen()} 
            onUpdateAsset={updateAsset}
            onSelectAsset={(asset) => {
              setSelectedAsset(asset);
              pushScreen(AppScreen.ASSET_DETAIL);
            }}
            selectedLocation={inventoryLocation}
            setSelectedLocation={setInventoryLocation}
            isInventorying={isInventorying}
            setIsInventorying={setIsInventorying}
            filter={inventoryFilter}
            setFilter={setInventoryFilter}
            searchTerm={inventorySearchTerm}
            setSearchTerm={setInventorySearchTerm}
          />
        );
      case AppScreen.CONSULTATION:
        return (
          <Consultation 
            assets={filteredAssetsByCompany} 
            onBack={() => popScreen()} 
            onSelectAsset={(asset) => {
              setSelectedAsset(asset);
              pushScreen(AppScreen.ASSET_DETAIL);
            }}
          />
        );
      case AppScreen.ASSET_DETAIL:
        return selectedAsset ? (
          <AssetDetail 
            asset={selectedAsset} 
            onBack={() => popScreen()} 
            onUpdate={updateAsset}
            availableAddresses={availableAddresses}
          />
        ) : null;
      default:
        return <Login onLogin={handleLogin} onGoToRegister={() => pushScreen(AppScreen.REGISTER)} />;
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 shadow-2xl overflow-hidden relative font-sans">
      {renderScreen()}
    </div>
  );
};

export default App;
