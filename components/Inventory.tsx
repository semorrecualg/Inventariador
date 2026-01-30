
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  MapPin, 
  Check,
  Plus,
  Zap,
  CheckCheck,
  Save,
  Trophy
} from 'lucide-react';

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
  
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [customLocations, setCustomLocations] = useState<string[]>([]);
  const newLocationInputRef = useRef<HTMLInputElement>(null);

  const locationTerms = ['ENDERECO', 'ENDEREÇO', 'LOCALIZACAO', 'LOCALIZAÇÃO', 'SETOR', 'COD_END', 'AREA', 'ÁREA'];
  const descTerms = ['DESC_SINTETICA', 'SINTETICA', 'SINTÉTICA', 'DESCRICAO', 'DESCRIÇÃO', 'NOME', 'DESC_ITEM', 'PRODUTO'];
  const plaquetaTerms = ['PLAQUETA', 'PATRIMONIO', 'PATRIMÔNIO', 'REGISTRO', 'CODIGO', 'CÓDIGO', 'ETIQUETA', 'TAG', 'BEM', 'NUMERO', 'NÚMERO'];
  const indiceTerms = ['INDICE', 'ÍNDICE', 'ID', 'ID_ATIVO', 'CONTROLE'];

  useEffect(() => {
    if (showAddLocationModal && newLocationInputRef.current) {
      newLocationInputRef.current.focus();
    }
  }, [showAddLocationModal]);

  const getRobustValue = (asset: Asset, terms: string[]) => {
    const keys = Object.keys(asset);
    for (const term of terms) {
      const match = keys.find(k => k.trim().toUpperCase() === term.toUpperCase());
      if (match && asset[match] !== undefined && asset[match] !== null && asset[match] !== '') {
        return String(asset[match]).trim().toUpperCase();
      }
    }
    return null;
  };

  const getFieldValue = (asset: Asset, terms: string[]) => {
    return getRobustValue(asset, terms) || "---";
  };

  const getItemLocation = (asset: Asset): string => {
    return getRobustValue(asset, locationTerms) || "ENDEREÇO NÃO LOCALIZADO";
  };

  const allLocations = useMemo(() => {
    const locs = new Set<string>();
    assets.forEach(asset => {
      const loc = getItemLocation(asset);
      if (loc) locs.add(loc);
    });
    customLocations.forEach(loc => locs.add(loc));
    return Array.from(locs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [assets, customLocations]);

  // Calcula estatísticas por local para exibir na lista principal
  const locationStatsMap = useMemo(() => {
    const map: Record<string, { total: number, checked: number, percentage: number, isComplete: boolean }> = {};
    allLocations.forEach(loc => {
      const localItems = assets.filter(a => getItemLocation(a) === loc);
      const total = localItems.length;
      const checked = localItems.filter(a => !!a._conferido).length;
      const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
      map[loc] = {
        total,
        checked,
        percentage,
        isComplete: total > 0 && checked === total
      };
    });
    return map;
  }, [assets, allLocations]);

  const currentLocalStats = useMemo(() => {
    const localItems = assets.filter(a => {
        const loc = getItemLocation(a);
        return loc === selectedLocation || (a._conferido && a.TAG_ADOCAO === "ADOTADO" && loc === selectedLocation);
    });
    const checked = localItems.filter(a => !!a._conferido).length;
    const pending = localItems.length - checked;
    return { checked, pending };
  }, [assets, selectedLocation]);

  const filteredAssets = useMemo(() => {
    const st = activeSearch.trim().toLowerCase();
    
    return assets.filter(asset => {
      const itemLoc = getItemLocation(asset);
      const isAdopted = asset.TAG_ADOCAO === "ADOTADO";
      
      if (!st && selectedLocation && itemLoc !== selectedLocation && !isAdopted) return false;

      const plaqueta = getRobustValue(asset, plaquetaTerms) || "";
      const matchesSearch = !st || plaqueta.toLowerCase() === st || plaqueta.toLowerCase().includes(st);
      
      if (!matchesSearch) return false;

      if (filter === 'pending') return !asset._conferido;
      if (filter === 'checked') return !!asset._conferido;
      
      return true;
    }).sort((a, b) => {
      const vA = getRobustValue(a, plaquetaTerms) || String(a.id);
      const vB = getRobustValue(b, plaquetaTerms) || String(b.id);
      return vA.localeCompare(vB, undefined, { numeric: true });
    });
  }, [assets, activeSearch, filter, selectedLocation]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveSearch(inputValue.trim());
  };

  const handleSelectLocation = (loc: string) => {
    setSelectedLocation(loc.toUpperCase());
    setIsInventorying(true);
    setFilter('pending');
    setInputValue('');
    setActiveSearch('');
  };

  const handleSaveLocation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newLocationName.trim().toUpperCase();
    if (name) {
      if (!allLocations.includes(name)) {
        setCustomLocations(prev => [...prev, name]);
      }
      setNewLocationName('');
      setShowAddLocationModal(false);
      handleSelectLocation(name);
    }
  };

  const toggleCheck = (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    const itemLoc = getItemLocation(asset);
    const isOtherLocation = selectedLocation && itemLoc !== selectedLocation;
    const nextConferido = !asset._conferido;

    const updatedAsset = { 
      ...asset, 
      _conferido: nextConferido
    };

    if (nextConferido) {
      if (isOtherLocation && selectedLocation) {
        updatedAsset.TAG_ADOCAO = "ADOTADO";
        const addrKey = Object.keys(asset).find(k => locationTerms.includes(k.toUpperCase()));
        if (addrKey) updatedAsset[addrKey] = selectedLocation;
      }
      setInputValue('');
      setActiveSearch('');
    } else {
      updatedAsset.TAG_ADOCAO = "";
    }

    onUpdateAsset(updatedAsset);
  };

  const handleBulkConfirm = () => {
    if (filteredAssets.length === 0) return;

    filteredAssets.forEach(asset => {
      if (!asset._conferido) {
        const itemLoc = getItemLocation(asset);
        const isOtherLocation = selectedLocation && itemLoc !== selectedLocation;
        
        const updatedAsset = { 
          ...asset, 
          _conferido: true
        };

        if (isOtherLocation && selectedLocation) {
          updatedAsset.TAG_ADOCAO = "ADOTADO";
          const addrKey = Object.keys(asset).find(k => locationTerms.includes(k.toUpperCase()));
          if (addrKey) updatedAsset[addrKey] = selectedLocation;
        }

        onUpdateAsset(updatedAsset);
      }
    });

    setInputValue('');
    setActiveSearch('');
  };

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn relative">
        <div className="p-6 bg-white border-b border-gray-100 sticky top-0 z-10">
          <button 
            onClick={onBack}
            className="mb-4 flex items-center space-x-2 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-blue-600 transition-colors"
          >
            <ArrowLeft size={14} /> <span>Menu Principal</span>
          </button>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-gray-900 uppercase">Locais</h2>
            <button 
              onClick={() => setShowAddLocationModal(true)} 
              className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-blue-100"
            >
              <Plus size={28} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="PESQUISAR ENDEREÇOS..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value.toUpperCase())}
              className="w-full pl-11 pr-4 py-3.5 bg-gray-100 rounded-2xl text-sm font-black uppercase outline-none focus:bg-white placeholder:text-gray-300 border-2 border-transparent focus:border-blue-500 transition-all shadow-inner"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto pb-32 px-4 pt-4 no-scrollbar">
          <div className="grid grid-cols-1 gap-3">
            {allLocations.filter(l => l.toLowerCase().includes(locationSearch.toLowerCase())).map(loc => {
              const stats = locationStatsMap[loc];
              const isComplete = stats.isComplete;
              
              return (
                <button
                  key={loc}
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full flex flex-col rounded-[2rem] border transition-all active:scale-[0.98] overflow-hidden group
                    ${isComplete ? 'bg-emerald-50 border-emerald-200 shadow-md' : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-lg'}`}
                >
                  <div className="w-full p-5 flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors 
                        ${isComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                        {isComplete ? <Trophy size={24} /> : <Building size={24} />}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className={`font-black uppercase text-sm tracking-tight truncate block ${isComplete ? 'text-emerald-900' : 'text-gray-900'}`}>{loc}</span>
                          {isComplete && (
                            <div className="bg-emerald-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full flex items-center shadow-sm animate-bounceIn shrink-0">
                              <Check size={8} className="mr-0.5" strokeWidth={4} /> 100% INVENTARIADO!
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                            {stats.checked} de {stats.total} itens conferidos
                          </span>
                          <span className={`text-[8px] font-black ${isComplete ? 'text-emerald-600' : 'text-blue-500'}`}>
                            {stats.percentage}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className={isComplete ? 'text-emerald-300' : 'text-gray-300 group-hover:text-blue-400'} />
                  </div>
                  
                  {/* Barra de Progresso do Local */}
                  <div className="h-1.5 w-full bg-gray-100/50">
                    <div 
                      className={`h-full transition-all duration-700 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${stats.percentage}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* MODAL DE NOVO LOCAL */}
        {showAddLocationModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddLocationModal(false)}></div>
            <div className="bg-white w-full rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-bounceIn">
              <div className="p-8">
                <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 mb-6 mx-auto shadow-inner">
                  <MapPin size={32} />
                </div>
                <h3 className="text-xl font-black text-center text-gray-900 uppercase mb-2">Novo Local</h3>
                <p className="text-[10px] text-center font-black text-gray-400 uppercase tracking-widest mb-8">Defina o nome do setor ou endereço</p>
                
                <form onSubmit={handleSaveLocation} className="space-y-6">
                  <div className="relative">
                    <input 
                      ref={newLocationInputRef}
                      type="text" 
                      placeholder="EX: ALMOXARIFADO CENTRAL"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-5 rounded-2xl outline-none font-black text-sm uppercase transition-all shadow-inner placeholder:text-gray-200"
                    />
                  </div>
                  
                  <div className="flex space-x-3">
                    <button 
                      type="button"
                      onClick={() => setShowAddLocationModal(false)}
                      className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase active:scale-95 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={!newLocationName.trim()}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all"
                    >
                      <Save size={16} className="mr-2" /> Criar e Entrar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 animate-fadeIn">
      <div className="bg-blue-700 p-6 text-white shrink-0 relative overflow-hidden shadow-lg">
        <div className="flex items-center justify-between mb-4 relative z-10">
          <button 
            onClick={() => setIsInventorying(false)} 
            className="flex items-center space-x-2 bg-white/20 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider active:bg-white/40 border border-white/10"
          >
            <ArrowLeft size={14} /> <span>Mudar Local</span>
          </button>
          <button 
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 transition-all active:scale-90"
          >
            {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
          </button>
        </div>
        <div className="relative z-10 mb-6">
          <h2 className="text-2xl font-black truncate uppercase tracking-tight">{selectedLocation}</h2>
          <div className="flex items-center space-x-2 mt-1">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Sessão Ativa</p>
          </div>
        </div>
        <div className="flex bg-white/10 p-1.5 rounded-2xl relative z-10 border border-white/10 shadow-inner">
          <button 
            onClick={() => setFilter('pending')} 
            className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl transition-all ${filter === 'pending' ? 'bg-white text-blue-700 shadow-xl scale-105' : 'text-white/60 hover:text-white'}`}
          >
            <Circle size={14} className={filter === 'pending' ? 'text-blue-600' : 'text-white/40'} />
            <span className="text-[10px] font-black uppercase">Pendentes ({currentLocalStats.pending})</span>
          </button>
          <button 
            onClick={() => setFilter('checked')} 
            className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl transition-all ${filter === 'checked' ? 'bg-white text-emerald-600 shadow-xl scale-105' : 'text-white/60 hover:text-white'}`}
          >
            <CheckCircle2 size={14} className={filter === 'checked' ? 'text-emerald-500' : 'text-white/40'} />
            <span className="text-[10px] font-black uppercase">Conferidos ({currentLocalStats.checked})</span>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <form onSubmit={handleSearch} className="relative group">
          <input 
            type="text" 
            placeholder="NÚMERO DA PLAQUETA..."
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            className="w-full pl-6 pr-14 py-4 bg-gray-50 rounded-[1.2rem] text-sm border-2 border-transparent outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white font-black uppercase placeholder:text-gray-300 transition-all shadow-inner"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            {inputValue && (
              <button 
                type="button" 
                onClick={() => { setInputValue(''); setActiveSearch(''); }}
                className="w-8 h-8 flex items-center justify-center text-gray-400"
              >
                <X size={16} />
              </button>
            )}
            <button 
              type="submit"
              className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            >
              <Search size={20} />
            </button>
          </div>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 bg-gray-50">
        {activeSearch && filteredAssets.length > 1 && filter === 'pending' && (
          <div className="mb-4 animate-slideDown">
            <button 
              onClick={handleBulkConfirm}
              className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] shadow-xl shadow-indigo-100 flex items-center justify-center space-x-3 active:scale-[0.98] transition-all hover:bg-indigo-700 border-2 border-indigo-400"
            >
              <CheckCheck size={24} strokeWidth={3} />
              <div className="text-left">
                <span className="block text-[11px] font-black uppercase leading-none">Confirmar Todos</span>
                <span className="text-[8px] font-bold uppercase tracking-widest opacity-80">{filteredAssets.length} Itens Localizados</span>
              </div>
            </button>
          </div>
        )}

        {filteredAssets.length > 0 ? (
          <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 gap-4' : 'grid-cols-1 gap-3'} pb-32`}>
            {filteredAssets.map(asset => {
              const plaquetaLabel = getRobustValue(asset, plaquetaTerms) || String(asset.id);
              const isConferido = !!asset._conferido;
              const isAdopted = asset.TAG_ADOCAO === "ADOTADO";
              const desc = getFieldValue(asset, descTerms);
              const indice = getFieldValue(asset, indiceTerms);

              return (
                <div 
                  key={asset.id} 
                  onClick={() => onSelectAsset(asset)} 
                  className={`relative flex flex-col p-4 rounded-[2rem] border transition-all active:scale-95 cursor-pointer shadow-sm h-full 
                    ${isAdopted ? 'bg-violet-50 border-violet-200' : isConferido ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col space-y-1">
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
                      onClick={(e) => toggleCheck(e, asset)} 
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all 
                        ${isAdopted ? 'bg-violet-600 text-white shadow-lg' : isConferido ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-gray-300 border-2 border-gray-100'}`}
                    >
                      {isConferido || isAdopted ? <Check size={24} strokeWidth={3} /> : <div className="w-5 h-5 rounded-full border-2 border-current"></div>}
                    </button>
                  </div>
                  
                  <div className="flex-1">
                    <div className={`px-2 py-0.5 rounded-lg border flex items-center space-x-1 w-fit mb-2 
                      ${isAdopted ? 'bg-violet-100 border-violet-200' : 'bg-blue-50 border-blue-100'}`}>
                      <Layers size={8} className={isAdopted ? "text-violet-600" : "text-blue-600"} />
                      <span className={`text-[8px] font-black truncate ${isAdopted ? "text-violet-700" : "text-blue-700"}`}>{indice}</span>
                    </div>
                    <h4 className="text-[10px] font-black uppercase leading-tight mb-2 line-clamp-2 text-gray-900">{desc}</h4>
                  </div>
                  
                  <div className="mt-auto space-y-1.5">
                    <div className="bg-white/60 px-2.5 py-1 rounded-xl flex items-center space-x-1 w-fit shadow-inner border border-black/5">
                      <Hash size={10} className="text-gray-400" />
                      <span className="text-[10px] font-black text-gray-900 truncate">{plaquetaLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-gray-300 animate-fadeIn">
             <Layers size={64} className="opacity-10 mb-6" />
             <p className="font-black uppercase tracking-widest text-[10px]">Nada Encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
