
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import { 
  CheckCircle2, 
  Circle, 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  X, 
  Hash, 
  Building, 
  LayoutGrid, 
  List, 
  Layers, 
  Check,
  Zap,
  Trophy,
  Loader2,
  Edit3,
  CheckCheck
} from 'lucide-react';

// COMPONENTE MEMOIZADO PARA PERFORMANCE EXTREMA
const AssetCard = React.memo(({ 
  asset, 
  viewMode, 
  onSelect, 
  onToggle,
  plaquetaTerms,
  indiceTerms,
  descTerms,
  isFeatured = false
}: { 
  asset: Asset, 
  viewMode: 'grid' | 'list', 
  onSelect: (a: Asset) => void, 
  onToggle: (e: React.MouseEvent, a: Asset) => void,
  plaquetaTerms: string[],
  indiceTerms: string[],
  descTerms: string[],
  isFeatured?: boolean
}) => {
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
  const indice = getVal(asset, indiceTerms);
  const isConferido = !!asset._conferido;
  const isAdopted = asset.TAG_ADOCAO === "ADOTADO";

  return (
    <div 
      onClick={() => onSelect(asset)} 
      className={`relative flex flex-col p-5 rounded-[2.2rem] border transition-all active:scale-95 cursor-pointer shadow-sm h-full 
        ${isFeatured ? 'ring-4 ring-blue-500/20 border-blue-500 bg-white' : 
          isAdopted ? 'bg-violet-50 border-violet-200' : 
          isConferido ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col space-y-1">
          {isFeatured && (
            <div className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-blue-600 text-white w-fit shadow-sm flex items-center mb-1">
              <Search size={8} className="mr-1" /> ITEM ENCONTRADO
            </div>
          )}
          {isAdopted ? (
            <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase bg-violet-600 text-white w-fit shadow-sm flex items-center">
              <Zap size={8} className="mr-1" /> ADOTADO
            </div>
          ) : isConferido ? (
            <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase bg-emerald-600 text-white w-fit shadow-sm">
              CONFERIDO
            </div>
          ) : (
            <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase bg-amber-500 text-white w-fit shadow-sm">
              PENDENTE
            </div>
          )}
        </div>
        
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onToggle(e, asset);
          }} 
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all 
            ${isConferido || isAdopted ? 'bg-emerald-600 text-white shadow-lg' : 'bg-blue-50 text-blue-600 border-2 border-blue-100 hover:bg-blue-600 hover:text-white'}`}
        >
          {isConferido || isAdopted ? <Check size={24} strokeWidth={3} /> : <CheckCheck size={24} />}
        </button>
      </div>
      
      <div className="flex-1">
        <div className={`px-2 py-0.5 rounded-lg border flex items-center space-x-1 w-fit mb-2 
          ${isAdopted ? 'bg-violet-100 border-violet-200' : 'bg-blue-50 border-blue-100'}`}>
          <Layers size={8} className={isAdopted ? "text-violet-600" : "text-blue-600"} />
          <span className={`text-[8px] font-black truncate ${isAdopted ? "text-violet-700" : "text-blue-700"}`}>{indice}</span>
        </div>
        <h4 className={`${isFeatured ? 'text-sm' : 'text-[10px]'} font-black uppercase leading-tight mb-2 line-clamp-3 text-gray-900`}>{desc}</h4>
      </div>
      
      <div className="mt-auto flex items-center justify-between">
        <div className="bg-white/60 px-2.5 py-1 rounded-xl flex items-center space-x-1 w-fit shadow-inner border border-black/5">
          <Hash size={10} className="text-gray-400" />
          <span className="text-[10px] font-black text-gray-900 truncate">{plaqueta}</span>
        </div>
        {isFeatured && !isConferido && (
          <div className="flex items-center text-[8px] font-black text-blue-500 uppercase animate-pulse">
            <Edit3 size={10} className="mr-1" /> Tocar p/ Editar
          </div>
        )}
      </div>
    </div>
  );
});

interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  filter: 'all' | 'pending' | 'checked';
  setFilter: (f: 'all' | 'pending' | 'checked') => void;
  searchTerm: string;
  setSearchTerm: (t: string) => void;
}

const Inventory: React.FC<InventoryProps> = ({ 
  assets, 
  allAssets, 
  onBack, 
  onUpdateAsset, 
  onSelectAsset,
  selectedLocation,
  setSelectedLocation,
  isInventorying,
  setIsInventorying,
  filter,
  setFilter,
  searchTerm,
  setSearchTerm
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [locationSearch, setLocationSearch] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  
  const searchTimeoutRef = useRef<number | null>(null);

  const locationTerms = useMemo(() => ['ENDERECO', 'ENDEREÇO', 'LOCALIZACAO', 'LOCALIZAÇÃO', 'SETOR', 'COD_END', 'AREA', 'ÁREA'], []);
  const descTerms = useMemo(() => ['DESC_SINTETICA', 'SINTETICA', 'SINTÉTICA', 'DESCRICAO', 'DESCRIÇÃO', 'NOME', 'DESC_ITEM', 'PRODUTO'], []);
  const plaquetaTerms = useMemo(() => ['PLAQUETA', 'PATRIMONIO', 'PATRIMÔNIO', 'REGISTRO', 'CODIGO', 'CÓDIGO', 'ETIQUETA', 'TAG', 'BEM', 'NUMERO', 'NÚMERO'], []);
  const indiceTerms = useMemo(() => ['INDICE', 'ÍNDICE', 'ID', 'ID_ATIVO', 'CONTROLE'], []);

  const searchIndex = useMemo(() => {
    const map = new Map<string, Asset[]>();
    assets.forEach(asset => {
      const keys = Object.keys(asset);
      const pKey = keys.find(k => plaquetaTerms.includes(k.trim().toUpperCase()));
      if (pKey && asset[pKey]) {
        const pVal = String(asset[pKey]).trim().toUpperCase();
        if (!map.has(pVal)) map.set(pVal, []);
        map.get(pVal)!.push(asset);
      }
    });
    return map;
  }, [assets, plaquetaTerms]);

  const getItemLocation = useCallback((asset: Asset): string => {
    const keys = Object.keys(asset);
    for (const term of locationTerms) {
      const match = keys.find(k => k.trim().toUpperCase() === term.toUpperCase());
      if (match && asset[match]) return String(asset[match]).trim().toUpperCase();
    }
    return "ENDEREÇO NÃO LOCALIZADO";
  }, [locationTerms]);

  const allLocations = useMemo(() => {
    const locs = new Set<string>();
    assets.forEach(asset => locs.add(getItemLocation(asset)));
    return Array.from(locs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [assets, getItemLocation]);

  const locationStatsMap = useMemo(() => {
    const map: Record<string, { total: number, checked: number, percentage: number, isComplete: boolean }> = {};
    allLocations.forEach(loc => {
      const localItems = assets.filter(a => getItemLocation(a) === loc);
      const total = localItems.length;
      const checked = localItems.filter(a => !!a._conferido).length;
      const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
      map[loc] = { total, checked, percentage, isComplete: total > 0 && checked === total };
    });
    return map;
  }, [assets, allLocations, getItemLocation]);

  const handleToggle = useCallback((e: React.MouseEvent | null, asset: Asset) => {
    if (e) e.stopPropagation();
    const itemLoc = getItemLocation(asset);
    const isOtherLocation = selectedLocation && itemLoc !== selectedLocation;
    const nextConferido = !asset._conferido;

    const updatedAsset = { ...asset, _conferido: nextConferido };
    if (nextConferido) {
      if (isOtherLocation && selectedLocation) {
        updatedAsset.TAG_ADOCAO = "ADOTADO";
        const addrKey = Object.keys(asset).find(k => locationTerms.includes(k.toUpperCase()));
        if (addrKey) updatedAsset[addrKey] = selectedLocation;
      }
      setInputValue('');
      setActiveSearch('');
      setFlashEffect(true);
      setTimeout(() => setFlashEffect(false), 500);
    } else {
      updatedAsset.TAG_ADOCAO = "";
    }
    onUpdateAsset(updatedAsset);
  }, [getItemLocation, selectedLocation, locationTerms, onUpdateAsset]);

  const performSearch = useCallback((value: string) => {
    const cleanValue = value.trim().toUpperCase();
    setIsSearching(false);
    setActiveSearch(cleanValue);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    if (!inputValue) {
      setActiveSearch('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = window.setTimeout(() => {
      performSearch(inputValue);
    }, 300); // 300ms Snappy Debounce
    return () => { if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current); };
  }, [inputValue, performSearch]);

  const { featuredMatch, otherResults } = useMemo(() => {
    const st = activeSearch;
    if (!st) return { featuredMatch: null, otherResults: assets.filter(asset => {
      const itemLoc = getItemLocation(asset);
      const isAdopted = asset.TAG_ADOCAO === "ADOTADO";
      if (selectedLocation && itemLoc !== selectedLocation && !isAdopted) return false;
      if (filter === 'pending') return !asset._conferido;
      if (filter === 'checked') return !!asset._conferido;
      return true;
    }).sort((a, b) => {
      const keys = Object.keys(a);
      const pk = keys.find(k => plaquetaTerms.includes(k.toUpperCase()));
      return String(pk ? a[pk] : a.id).localeCompare(String(pk ? b[pk] : b.id), undefined, { numeric: true });
    })};

    const results = searchIndex.get(st) || [];
    const filtered = results.filter(asset => {
      if (filter === 'pending') return !asset._conferido;
      if (filter === 'checked') return !!asset._conferido;
      return true;
    });

    if (filtered.length === 1) {
      return { featuredMatch: filtered[0], otherResults: [] };
    }
    return { featuredMatch: null, otherResults: filtered };
  }, [assets, searchIndex, activeSearch, filter, selectedLocation, getItemLocation, plaquetaTerms]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    performSearch(inputValue);
  };

  const handleSelectLocation = (loc: string) => {
    setSelectedLocation(loc.toUpperCase());
    setIsInventorying(true);
    setFilter('pending');
    setInputValue('');
    setActiveSearch('');
  };

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn relative">
        <div className="p-6 bg-white border-b border-gray-100 sticky top-0 z-10">
          <button onClick={onBack} className="mb-4 flex items-center space-x-2 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-blue-600 transition-all">
            <ArrowLeft size={14} /> <span>Menu Principal</span>
          </button>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-gray-900 uppercase">Locais</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="PESQUISAR ENDEREÇOS..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value.toUpperCase())}
              className="w-full pl-11 pr-4 py-3.5 bg-gray-100 rounded-2xl text-sm font-black uppercase outline-none focus:bg-white border-2 border-transparent focus:border-blue-500 shadow-inner"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-32 px-4 pt-4 no-scrollbar">
          <div className="grid grid-cols-1 gap-3">
            {allLocations.filter(l => l.includes(locationSearch)).map(loc => {
              const stats = locationStatsMap[loc];
              return (
                <button key={loc} onClick={() => handleSelectLocation(loc)} className={`w-full flex flex-col rounded-[2rem] border transition-all active:scale-[0.98] overflow-hidden group ${stats.isComplete ? 'bg-emerald-50 border-emerald-200 shadow-md' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
                  <div className="w-full p-5 flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1 min-w-0 text-left">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stats.isComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                        {stats.isComplete ? <Trophy size={24} /> : <Building size={24} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`font-black uppercase text-sm truncate block ${stats.isComplete ? 'text-emerald-900' : 'text-gray-900'}`}>{loc}</span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{stats.checked}/{stats.total} conferidos</span>
                          <span className={`text-[8px] font-black ${stats.isComplete ? 'text-emerald-600' : 'text-blue-500'}`}>{stats.percentage}%</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className={stats.isComplete ? 'text-emerald-300' : 'text-gray-300'} />
                  </div>
                  <div className="h-1.5 w-full bg-gray-100/50"><div className={`h-full transition-all duration-700 ${stats.isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${stats.percentage}%` }} /></div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full transition-colors duration-300 ${flashEffect ? 'bg-emerald-500' : 'bg-gray-50'}`}>
      <div className="bg-blue-700 p-6 text-white shrink-0 shadow-lg animate-fadeIn">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setIsInventorying(false)} className="bg-white/20 px-4 py-2.5 rounded-full text-[10px] font-black uppercase border border-white/10 flex items-center space-x-2">
            <ArrowLeft size={14} /> <span>Locais</span>
          </button>
          
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
            {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
          </button>
        </div>
        
        <h2 className="text-2xl font-black truncate uppercase tracking-tight">{selectedLocation}</h2>
        
        <div className="flex bg-white/10 p-1.5 rounded-2xl mt-4 border border-white/10">
          <button onClick={() => setFilter('pending')} className={`flex-1 py-3 rounded-xl transition-all flex items-center justify-center space-x-2 ${filter === 'pending' ? 'bg-white text-blue-700 shadow-xl' : 'text-white/60'}`}>
            <Circle size={14} /> <span className="text-[10px] font-black uppercase">Pendentes</span>
          </button>
          <button onClick={() => setFilter('checked')} className={`flex-1 py-3 rounded-xl transition-all flex items-center justify-center space-x-2 ${filter === 'checked' ? 'bg-white text-emerald-600 shadow-xl' : 'text-white/60'}`}>
            <CheckCircle2 size={14} /> <span className="text-[10px] font-black uppercase">Conferidos</span>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="relative">
          <input 
            type="text" 
            placeholder="NÚMERO DA PLAQUETA..."
            autoFocus
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            className={`w-full pl-6 pr-14 py-4 rounded-[1.2rem] text-sm border-2 font-black uppercase placeholder:text-gray-300 transition-all shadow-inner outline-none
              ${flashEffect ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-transparent focus:border-blue-500'}`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-2">
            {isSearching && <Loader2 size={20} className="text-blue-400 animate-spin" />}
            <button type="submit" className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-transform"><Search size={20} /></button>
          </div>
        </form>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center space-x-1 text-[8px] font-black text-blue-600 uppercase">
            <Zap size={10} className="animate-pulse" />
            <span>Valide a descrição antes de confirmar</span>
          </div>
          <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
            {isSearching ? 'Buscando...' : activeSearch ? `${featuredMatch ? 1 : otherResults.length} Encontrado` : 'Aguardando...'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 bg-transparent">
        {featuredMatch && (
          <div className="mb-8 animate-bounceIn">
            <AssetCard 
              asset={featuredMatch}
              viewMode="list"
              onSelect={onSelectAsset}
              onToggle={handleToggle}
              plaquetaTerms={plaquetaTerms}
              indiceTerms={indiceTerms}
              descTerms={descTerms}
              isFeatured={true}
            />
          </div>
        )}

        {otherResults.length > 0 ? (
          <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 gap-4' : 'grid-cols-1 gap-3'} pb-32 transition-opacity duration-300 ${featuredMatch ? 'opacity-30 grayscale' : 'opacity-100'}`}>
            {otherResults.map(asset => (
              <AssetCard 
                key={asset.id}
                asset={asset}
                viewMode={viewMode}
                onSelect={onSelectAsset}
                onToggle={handleToggle}
                plaquetaTerms={plaquetaTerms}
                indiceTerms={indiceTerms}
                descTerms={descTerms}
              />
            ))}
          </div>
        ) : !featuredMatch && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-300">
             <Layers size={64} className="opacity-10 mb-6" />
             <p className="font-black uppercase tracking-widest text-[10px]">
               {inputValue ? 'Plaqueta não localizada' : 'Digite o número para buscar'}
             </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
