
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import { 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Hash, 
  Layers, 
  Check,
  CheckCheck,
  MapPin,
  X,
  ClipboardCheck,
  Loader2,
  MoveUp,
  Lock,
  Unlock
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  onToggle: (e: React.MouseEvent, a: Asset) => void;
  plaquetaTerms: string[];
  indiceTerms: string[];
  descTerms: string[];
  isGlobalResult?: boolean;
}

const AssetCard = React.memo(({ 
  asset, 
  onSelect, 
  onToggle,
  plaquetaTerms,
  indiceTerms,
  descTerms,
  isGlobalResult = false
}: AssetCardProps) => {
  const getVal = (a: Asset, terms: string[]) => {
    const keys = Object.keys(a);
    for (const t of terms) {
      const m = keys.find(k => k.trim().toUpperCase() === t.toUpperCase());
      if (m && a[m]) return String(a[m]).trim().toUpperCase();
    }
    return "---";
  };

  const plaqueta = getVal(asset, plaquetaTerms);
  const desc = getVal(asset, descTerms);
  const isConferido = !!asset._conferido;
  const isAdopted = asset.TAG_ADOCAO === "ADOTADO";

  return (
    <div 
      onClick={() => onSelect(asset)}
      className={`flex items-center justify-between py-4 border-b border-gray-100 transition-all active:bg-gray-50
        ${isConferido && !isGlobalResult ? 'opacity-75 bg-emerald-50/20' : 'opacity-100'}`}
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center space-x-2 mb-1">
          <Hash size={12} className={isAdopted ? "text-emerald-600" : "text-blue-600"} strokeWidth={4} />
          <span className="text-base font-black text-black tracking-tighter leading-none">{plaqueta}</span>
          {isAdopted && (
            <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md uppercase tracking-widest">
              ADOTADO
            </span>
          )}
          {isGlobalResult && (
            <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md uppercase tracking-widest flex items-center">
              <MoveUp size={8} className="mr-1"/> EXTERNO
            </span>
          )}
        </div>
        <p className="text-[10px] font-bold text-gray-700 uppercase truncate tracking-tight leading-relaxed">{desc}</p>
      </div>
      
      <button 
        onClick={(e) => onToggle(e, asset)} 
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90
          ${isConferido ? 'bg-emerald-100 text-emerald-600' : isGlobalResult ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'}`}
      >
        {isConferido ? <Check size={22} strokeWidth={4} /> : <CheckCheck size={22} />}
      </button>
    </div>
  );
});

interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[]) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  selectedCompany: string | null;
}

const Inventory: React.FC<InventoryProps> = ({ 
  assets, 
  allAssets,
  onBack, 
  onUpdateAsset, 
  onBulkUpdateAssets,
  onSelectAsset,
  selectedLocation,
  setSelectedLocation,
  isInventorying,
  setIsInventorying,
  selectedCompany
}) => {
  const [assetSearch, setAssetSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const locationTerms = useMemo(() => ['ENDERECO', 'ENDEREÇO', 'LOCALIZACAO', 'LOCALIZAÇÃO', 'SETOR', 'COD_END', 'AREA', 'ÁREA'], []);
  const companyTerms = useMemo(() => ['EMPRESA', 'UNIDADE', 'UNID', 'COMPANHIA'], []);
  const plaquetaTerms = useMemo(() => ['PLAQUETA', 'PATRIMONIO', 'PATRIMÔNIO', 'REGISTRO', 'CODIGO', 'CÓDIGO', 'ETIQUETA', 'TAG', 'BEM', 'NUMERO', 'NÚMERO'], []);

  const getItemLocation = useCallback((asset: Asset): string => {
    const keys = Object.keys(asset);
    for (const term of locationTerms) {
      const match = keys.find(k => k.trim().toUpperCase() === term.toUpperCase());
      if (match && asset[match]) return String(asset[match]).trim().toUpperCase();
    }
    return "SEM ENDEREÇO";
  }, [locationTerms]);

  const locationStats = useMemo(() => {
    const stats: Record<string, { total: number, checked: number }> = {};
    assets.forEach(asset => {
      const loc = getItemLocation(asset);
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++;
      if (asset._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets, getItemLocation]);

  const allLocations = useMemo(() => {
    return Object.keys(locationStats).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [locationStats]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      setAssetSearch('');
      return;
    }
    const digits = raw.length > 6 ? raw.slice(-6) : raw;
    const masked = digits.padStart(6, '0');
    setAssetSearch(masked);
  };

  const filteredAssetsInLocation = useMemo(() => {
    if (!selectedLocation) return [];
    
    if (assetSearch) {
      return allAssets.filter(asset => {
        const pKey = Object.keys(asset).find(k => plaquetaTerms.includes(k.toUpperCase()));
        const pVal = pKey ? String(asset[pKey]).toUpperCase() : "";
        return pVal === assetSearch;
      }).slice(0, 30);
    }

    return assets.filter(asset => {
      const loc = getItemLocation(asset);
      const isAdopted = asset.TAG_ADOCAO === "ADOTADO";
      if (loc !== selectedLocation && !isAdopted) return false;
      
      if (activeFilter === 'pending' && asset._conferido) return false;
      if (activeFilter === 'checked' && !asset._conferido) return false;

      return true;
    }).sort((a, b) => {
      const pk = Object.keys(a).find(k => plaquetaTerms.includes(k.toUpperCase()));
      const vA = pk ? String(a[pk]) : String(a.id);
      const vB = pk ? String(b[pk]) : String(b.id);
      return vA.localeCompare(vB, undefined, { numeric: true });
    });
  }, [assets, allAssets, selectedLocation, assetSearch, activeFilter, getItemLocation, plaquetaTerms]);

  const handleToggle = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    
    const isGlobal = getItemLocation(asset) !== selectedLocation;
    let updatedAsset = { ...asset, _conferido: !asset._conferido };

    if (isGlobal && updatedAsset._conferido) {
      const locKey = Object.keys(updatedAsset).find(k => locationTerms.includes(k.toUpperCase())) || 'LOCALIZACAO';
      updatedAsset[locKey] = selectedLocation?.toUpperCase();
      
      if (selectedCompany) {
        const compKey = Object.keys(updatedAsset).find(k => companyTerms.includes(k.toUpperCase())) || 'EMPRESA';
        updatedAsset[compKey] = selectedCompany.toUpperCase();
      }

      updatedAsset.TAG_ADOCAO = "ADOTADO";
    }

    onUpdateAsset(updatedAsset);

    if (assetSearch && updatedAsset._conferido) {
      const stillPending = filteredAssetsInLocation.filter(a => !a._conferido && a.id !== asset.id);
      if (stillPending.length === 0) {
        setAssetSearch('');
      }
    }

    setTimeout(() => searchInputRef.current?.focus(), 150);
  }, [onUpdateAsset, selectedLocation, selectedCompany, locationTerms, companyTerms, getItemLocation, assetSearch, filteredAssetsInLocation]);

  const handleBulkToggle = useCallback(() => {
    const pendingIds = filteredAssetsInLocation
      .filter(a => !a._conferido)
      .map(a => String(a.id));

    if (pendingIds.length === 0) return;
    
    if (confirm(`CONFIRMAR ${pendingIds.length} ITENS?`)) {
      setIsBulkSaving(true);
      onBulkUpdateAssets(pendingIds);
      
      setTimeout(() => {
        setIsBulkSaving(false);
        setAssetSearch('');
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 400);
    }
  }, [onBulkUpdateAssets, filteredAssetsInLocation]);

  const handleLocationClick = (loc: string, percent: number) => {
    setSelectedLocation(loc);
    setIsInventorying(true);
    if (percent === 100) {
      setActiveFilter('checked');
    } else {
      setActiveFilter('pending');
    }
  };

  const handleLocationDoubleClick = (loc: string, percent: number) => {
    setSelectedLocation(loc);
    setIsInventorying(true);
    setActiveFilter('pending');
  };

  useEffect(() => {
    if (isInventorying) {
      setTimeout(() => searchInputRef.current?.focus(), 600);
    }
  }, [isInventorying]);

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn">
        <div className="p-6 pb-2">
          <button onClick={onBack} className="mb-4 text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1">
            <ArrowLeft size={10} /> <span>Menu Principal</span>
          </button>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-black uppercase tracking-tight">Locais</h2>
            <div className="flex items-center space-x-2 text-[8px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-full">
              <Unlock size={10} className="text-blue-500" />
              <span>Clique Duplo: Reabrir</span>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="FILTRAR LOCALIZAÇÃO..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value.toUpperCase())}
              className="w-full pl-8 py-3 border-b border-gray-100 text-xs font-black uppercase outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10 space-y-3">
          {allLocations.filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
            const isStarted = stats.checked > 0 && stats.checked < stats.total;
            const isComplete = percent === 100;

            return (
              <button 
                key={loc} 
                onClick={() => handleLocationClick(loc, percent)}
                onDoubleClick={() => handleLocationDoubleClick(loc, percent)}
                className={`w-full flex items-center justify-between p-5 rounded-[2rem] border transition-all active:scale-[0.98] group relative overflow-hidden
                  ${isComplete 
                    ? 'bg-emerald-50 border-emerald-100 shadow-sm' 
                    : isStarted 
                      ? 'bg-gray-900 border-gray-800 text-white shadow-2xl shadow-gray-200' 
                      : 'bg-white border-gray-100 text-gray-900 active:bg-gray-50'}`}
              >
                <div className="flex items-center space-x-4 min-w-0 pr-4 relative z-10">
                  <div className={`p-2.5 rounded-2xl ${isStarted ? 'bg-gray-800 text-blue-400' : isComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-300'}`}>
                    <MapPin size={18} />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="text-[12px] font-black uppercase leading-tight block truncate">{loc}</span>
                    <div className="flex items-center space-x-2 mt-1.5">
                      <div className={`h-1 w-20 rounded-full overflow-hidden ${isStarted ? 'bg-gray-800' : isComplete ? 'bg-emerald-200' : 'bg-gray-100'}`}>
                        <div 
                          className={`h-full transition-all duration-700 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest ${isStarted ? 'text-gray-400' : isComplete ? 'text-emerald-700' : 'text-gray-300'}`}>
                        {percent}%
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 shrink-0 relative z-10">
                  {isComplete ? (
                    <div className="flex items-center space-x-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-xl shadow-lg shadow-emerald-100">
                      <Lock size={12} strokeWidth={3} />
                      <span className="text-[9px] font-black uppercase tracking-tight">CONCLUÍDO</span>
                    </div>
                  ) : (
                    <ChevronRight size={16} className={`${isStarted ? 'text-gray-600' : 'text-gray-200'} group-hover:text-blue-500 transition-colors`} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const isSearchingGlobal = assetSearch.length > 0;
  const hasMultipleResults = isSearchingGlobal && filteredAssetsInLocation.filter(a => !a._conferido).length > 1;

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn">
      <div className="p-6 pb-2 shadow-sm relative z-10 bg-white">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); setAssetSearch(''); }} className="text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1">
            <ArrowLeft size={10} /> <span>Locais</span>
          </button>
          <span className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-md tracking-widest ${isSearchingGlobal ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
            {isSearchingGlobal ? 'Busca Global Ativa' : `${filteredAssetsInLocation.length} Itens Encontrados`}
          </span>
        </div>
        <h3 className="text-sm font-black uppercase tracking-tight truncate mb-4 text-gray-900">{selectedLocation}</h3>
        
        {/* CAMPO DE ENTRADA PROFISSIONAL - AZUL & ARREDONDADO */}
        <div className="relative mb-5 group">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10">
            <Search className="text-blue-300 group-focus-within:text-blue-600 transition-colors" size={28} />
          </div>
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode="numeric"
            placeholder="000000"
            value={assetSearch}
            onChange={handleSearchChange}
            className="w-full pl-16 pr-12 py-7 text-4xl font-black uppercase outline-none border-2 border-blue-100 bg-blue-50 rounded-[2.5rem] focus:border-blue-500 focus:bg-white transition-all tracking-tighter text-blue-900 placeholder:text-blue-100 shadow-inner"
          />
          {assetSearch && (
            <button 
              onClick={() => setAssetSearch('')} 
              className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-200 hover:text-red-500 transition-colors"
            >
              <X size={28} />
            </button>
          )}
        </div>

        {!isSearchingGlobal && (
          <div className="flex items-center space-x-6">
            <button 
              onClick={() => setActiveFilter('pending')}
              className={`text-[9px] font-black uppercase tracking-[0.15em] pb-2 border-b-2 transition-all
                ${activeFilter === 'pending' ? 'border-blue-600 text-black' : 'border-transparent text-gray-300'}`}
            >
              Pendentes
            </button>
            <button 
              onClick={() => setActiveFilter('checked')}
              className={`text-[9px] font-black uppercase tracking-[0.15em] pb-2 border-b-2 transition-all
                ${activeFilter === 'checked' ? 'border-emerald-600 text-black' : 'border-transparent text-gray-300'}`}
            >
              Conferidos
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
        {filteredAssetsInLocation.length > 0 ? (
          filteredAssetsInLocation.map(asset => {
            const itemLoc = getItemLocation(asset);
            const isGlobal = itemLoc !== selectedLocation && asset.TAG_ADOCAO !== "ADOTADO";
            return (
              <AssetCard 
                key={asset.id} 
                asset={asset} 
                onSelect={onSelectAsset} 
                onToggle={handleToggle}
                plaquetaTerms={plaquetaTerms}
                indiceTerms={[]}
                descTerms={['DESC_SINTETICA', 'SINTETICA', 'SINTÉTICA', 'DESCRICAO', 'DESCRIÇÃO', 'NOME', 'DESC_ITEM', 'PRODUTO']}
                isGlobalResult={isGlobal}
              />
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-200">
            <Layers size={40} className="opacity-10 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">
              {isSearchingGlobal ? 'Nenhum Ativo Localizado' : 'Conferência Concluída'}
            </p>
          </div>
        )}
      </div>

      {hasMultipleResults && (
        <div className="absolute bottom-6 left-6 right-6 animate-slideUp">
          <button 
            onClick={handleBulkToggle}
            disabled={isBulkSaving}
            className="w-full bg-black text-white p-5 rounded-[1.8rem] flex items-center justify-center space-x-3 shadow-2xl active:scale-95 transition-all"
          >
            {isBulkSaving ? <Loader2 size={20} className="animate-spin" /> : <ClipboardCheck size={20} className="text-blue-400" />}
            <span className="text-[11px] font-black uppercase tracking-widest">Confirmar Grupo em Lote</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Inventory;
