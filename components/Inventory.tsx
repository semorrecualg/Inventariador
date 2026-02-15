
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ArrowLeft, 
  MapPin, 
  AlertCircle,
  Check,
  X,
  Keyboard,
  Zap,
  Plus,
  Layers,
  CheckCircle2,
  Tag as TagIcon,
  FileSearch,
  Type,
  Copy,
  CheckSquare
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  decision: 'YES' | 'NO' | null;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  yesButtonRef?: React.RefObject<HTMLButtonElement | null>;
  isConferidoTab: boolean;
  highlighted?: boolean;
  showLocation?: boolean;
}

const AssetCard = React.memo(({ 
  asset, onSelect, decision, onMakeDecision, yesButtonRef, isConferidoTab, highlighted, showLocation
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  
  const checkIsBaixado = (item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA'];
    for (const term of terms) {
      const val = String(item[term] || '').trim();
      if (val !== "" && val !== "---" && val !== "0" && val.toUpperCase() !== "NULL") return true;
    }
    return false;
  };
  
  const isBaixado = checkIsBaixado(asset);
  const etiqueta = asset['PLAQUETA'] || asset['ETIQUETA'] || asset['PATRIMONIO'] || '';
  const displayEtiqueta = etiqueta || 'S/ PLAQUETA';
  const descricao = asset['DESCRICAO_DO_ATIVO_IMOBILIZADO'] || asset['DESCRICAO'] || 'SEM DESCRIÇÃO';
  const localizacao = asset['LOCALIZACAO'] || asset['SETOR'] || 'N/A';
  const tagInv = asset.TAG_INVENTARIO;

  return (
    <div 
      className={`mb-3 p-4 bg-slate-900 border rounded-xl shadow-none transition-all duration-200 active:scale-[0.99]
        ${highlighted ? 'border-indigo-500 bg-indigo-950/20 shadow-[0_0_20px_rgba(79,70,229,0.1)]' : 
          decision === 'YES' ? 'border-emerald-500' : 
          isBaixado ? 'border-red-900/50 bg-red-950/20' : 'border-slate-800'}`}
      onClick={() => onSelect(asset)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Etiqueta</span>
              <h3 className={`text-lg font-bold font-mono tracking-tighter leading-none ${!etiqueta ? 'text-slate-600 italic' : 'text-slate-100'}`}>
                {displayEtiqueta}
              </h3>
            </div>

            {showLocation && (
              <div className="flex items-center space-x-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                <MapPin size={8} className="text-indigo-400" />
                <span className="text-[7px] font-black text-indigo-300 uppercase truncate max-w-[80px]">{localizacao}</span>
              </div>
            )}

            {!isConferido && (
              <span className="bg-amber-900/30 text-amber-500 text-[8px] font-black px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-widest">
                PENDENTE
              </span>
            )}
            
            {isBaixado && (
              <span className="bg-red-600 text-white text-[7px] px-1.5 py-0.5 rounded font-black tracking-tighter uppercase">
                BAIXADO
              </span>
            )}
            
            {(tagInv || isConferido) && isConferido && (
              <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter
                ${tagInv === 'INCLUSAO' ? 'bg-purple-600 text-white' : 
                  tagInv === 'ADOTADO' ? 'bg-blue-600 text-white' : 
                  tagInv === 'RE-ADOTADO NO INVENTARIO' ? 'bg-cyan-600 text-white' : 
                  'bg-emerald-600 text-white'}`}>
                {tagInv || 'CONFERIDO'}
              </span>
            )}
          </div>

          <p className="text-sm font-bold text-slate-200 line-clamp-3 leading-snug uppercase tracking-tight">
            {descricao}
          </p>
        </div>

        {(!isConferido || isConferidoTab) && (
          <div className="flex flex-col space-y-2">
            <button 
              ref={yesButtonRef}
              onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }}
              className={`w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-lg transition-transform active:scale-90
                ${isBaixado ? 'bg-red-700' : 'bg-indigo-600 active:bg-indigo-500'}`}
            >
              <Check size={28} strokeWidth={3} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'NO'); }}
              className="w-14 h-10 bg-slate-800 text-slate-500 rounded-xl flex items-center justify-center active:scale-95 border border-slate-700/50"
            >
              <X size={20} />
            </button>
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
  onBulkUpdateAssets: (ids: string[]) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (loc: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (val: boolean) => void;
  selectedCompany: string | null;
}

const Inventory: React.FC<InventoryProps> = ({ 
  assets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany
}) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [searchMode, setSearchMode] = useState<'TAG' | 'DESCRIPTION'>('TAG');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showNewAssetDialog, setShowNewAssetDialog] = useState(false);
  const [isCreatingNewAsset, setIsCreatingNewAsset] = useState(false);
  const [newAssetData, setNewAssetData] = useState({ description: '', plaqueta: '' });
  const [newLocationName, setNewLocationName] = useState('');
  
  const [activeBatch, setActiveBatch] = useState<{plaqueta: string, ids: string[]} | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstYesButtonRef = useRef<HTMLButtonElement>(null);

  const getPlaqueta = useCallback((asset: Asset) => {
    return String(asset['PLAQUETA'] || asset['ETIQUETA'] || asset['PATRIMONIO'] || '').trim().toUpperCase();
  }, []);

  const getDescription = useCallback((asset: Asset) => {
    return String(asset['DESCRICAO_DO_ATIVO_IMOBILIZADO'] || asset['DESCRICAO'] || asset['DESC_SINTETICA'] || '').trim().toUpperCase();
  }, []);

  const getItemLocation = useCallback((asset: Asset) => {
    return String(asset['LOCALIZACAO'] || asset['SETOR'] || asset['LOCAL'] || 'SEM LOCAL').trim().toUpperCase();
  }, []);

  const checkIsBaixado = useCallback((item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA'];
    for (const term of terms) {
      const val = String(item[term] || '').trim();
      if (val !== "" && val !== "---" && val !== "0" && val.toUpperCase() !== "NULL") return true;
    }
    return false;
  }, []);

  const locationStats = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    assets.forEach(a => {
      if (checkIsBaixado(a)) return;
      const loc = getItemLocation(a);
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++;
      if (a._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets, getItemLocation, checkIsBaixado]);

  const sortedLocations = useMemo(() => {
    return Object.keys(locationStats).sort();
  }, [locationStats]);

  const filteredAndSortedAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const currentLoc = selectedLocation.toUpperCase();
    const searchVal = displayValue.toUpperCase().trim();
    
    let baseList = [];

    // Prioridade 1: Lote Ativo
    if (activeBatch) {
      const idSet = new Set(activeBatch.ids);
      baseList = assets.filter(a => idSet.has(String(a.id)));
    } 
    // Prioridade 2: Busca por Descrição (Contains / Auto-increment)
    else if (searchMode === 'DESCRIPTION' && searchVal.length > 2) {
      baseList = assets.filter(a => {
        const desc = getDescription(a);
        return desc.includes(searchVal);
      });
    }
    // Prioridade 3: Busca por Plaqueta
    else if (committedSearch && searchMode === 'TAG') {
      const term = committedSearch.toUpperCase().trim();
      baseList = assets.filter(a => {
          const p = getPlaqueta(a);
          return p === term || p.padStart(6, '0') === term.padStart(6, '0');
      });
    } 
    // Prioridade 4: Listagem do Setor
    else {
      baseList = assets
        .filter(a => getItemLocation(a) === currentLoc)
        .filter(a => !checkIsBaixado(a))
        .filter(a => activeFilter === 'checked' ? !!a._conferido : !a._conferido);
    }

    return baseList.sort((a, b) => {
      const pA = getPlaqueta(a).padStart(12, '0');
      const pB = getPlaqueta(b).padStart(12, '0');
      if (pA === pB) return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      return pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [assets, selectedLocation, committedSearch, displayValue, searchMode, activeFilter, activeBatch, getItemLocation, getPlaqueta, getDescription, checkIsBaixado]);

  const triggerSearch = (val: string) => {
    if (searchMode === 'TAG') setCommittedSearch(val);
    if (searchInputRef.current) searchInputRef.current.blur();
  };

  const toggleSearchMode = () => {
    const newMode = searchMode === 'TAG' ? 'DESCRIPTION' : 'TAG';
    setSearchMode(newMode);
    setDisplayValue(newMode === 'TAG' ? '000000' : '');
    setCommittedSearch('');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const resetSearchAndFocus = useCallback(() => {
    setDisplayValue(searchMode === 'TAG' ? '000000' : ''); 
    setCommittedSearch('');
    setActiveBatch(null);
    setShowNewAssetDialog(false); 
    setIsCreatingNewAsset(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (inputMethod === 'scanner' && searchMode === 'TAG') setIsScannerOpen(true);
  }, [inputMethod, searchMode]);

  const handleBulkConfirm = () => {
    if (activeBatch && activeBatch.ids.length > 0) {
      onBulkUpdateAssets(activeBatch.ids);
      resetSearchAndFocus();
    }
  };

  const handleIndividualDecision = (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;
    const clickedAsset = assets.find(a => String(a.id) === id);
    if (!clickedAsset) return;
    const plaqueta = getPlaqueta(clickedAsset);
    if (!plaqueta) {
      onBulkUpdateAssets([id]);
      resetSearchAndFocus();
      return;
    }
    const siblings = assets.filter(a => !a._conferido && getPlaqueta(a) === plaqueta);
    if (siblings.length > 1) {
      setActiveBatch({ plaqueta: plaqueta, ids: siblings.map(a => String(a.id)) });
    } else {
      onBulkUpdateAssets([id]);
      resetSearchAndFocus();
    }
  };

  useEffect(() => {
    if (searchMode === 'TAG' && committedSearch && filteredAndSortedAssets.length > 1) {
      const pendingSiblings = filteredAndSortedAssets.filter(a => !a._conferido);
      if (pendingSiblings.length > 1) {
        setActiveBatch({ plaqueta: committedSearch, ids: pendingSiblings.map(a => String(a.id)) });
      }
    }
  }, [committedSearch, filteredAndSortedAssets, searchMode]);

  useEffect(() => {
    if (searchMode === 'TAG' && committedSearch && filteredAndSortedAssets.length === 0) {
      setShowNewAssetDialog(true);
    }
  }, [committedSearch, filteredAndSortedAssets.length, searchMode]);

  const handleCreateNewAsset = () => {
    if (!newAssetData.description) return;
    const currentLoc = selectedLocation || "SEM LOCAL";
    const newAsset: Asset = {
      id: `new_${Date.now()}`,
      DESCRICAO: newAssetData.description.toUpperCase(),
      PLAQUETA: newAssetData.plaqueta || committedSearch || '',
      LOCALIZACAO: currentLoc.toUpperCase(),
      _conferido: true,
      TAG_INVENTARIO: 'INCLUSAO'
    };
    onUpdateAsset(newAsset);
    resetSearchAndFocus();
  };

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-slate-950 animate-fadeIn">
        <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800">
          <button onClick={onBack} className="flex items-center text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-6">
            <ArrowLeft size={14} className="mr-2" /> Painel
          </button>
          <h2 className="text-xl font-bold text-white uppercase tracking-tight leading-none mb-1">Setores Ativos</h2>
          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-[0.2em] mb-6">Unidade: {selectedCompany}</p>
          <div className="mt-6 flex space-x-2">
            <input 
              type="text" 
              placeholder="NOVO SETOR..." 
              value={newLocationName} 
              onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-3 bg-slate-800 rounded-xl text-xs font-bold uppercase outline-none border border-slate-700 focus:border-indigo-500"
            />
            <button onClick={() => { if(newLocationName.trim()) { setSelectedLocation(newLocationName.trim().toUpperCase()); setIsInventorying(true); setNewLocationName(''); } }} className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center active:scale-95"><Plus size={24} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-24">
          {sortedLocations.map(loc => {
            const { total, checked } = locationStats[loc];
            const progress = total > 0 ? (checked / total) * 100 : 0;
            const isCompleted = progress >= 100;
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="group w-full relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl active:scale-[0.98] transition-all flex flex-col">
                <div className={`absolute bottom-0 left-0 h-1 transition-all duration-700 ease-out ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${progress}%` }} />
                <div className="p-5 flex items-center justify-between relative z-10">
                  <div className="flex items-center space-x-4">
                    <div className={`p-2.5 rounded-xl flex items-center justify-center transition-colors ${isCompleted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-indigo-400'}`}>
                      {isCompleted ? <CheckCircle2 size={18} /> : <MapPin size={18} />}
                    </div>
                    <div className="text-left">
                      <span className={`text-sm font-bold block transition-colors ${isCompleted ? 'text-emerald-400' : 'text-slate-200'}`}>{loc}</span>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{checked} / {total} ITENS</span>
                        {isCompleted && <span className="text-[7px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded tracking-tighter uppercase">Concluído</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-[12px] font-black font-mono tracking-tighter ${isCompleted ? 'text-emerald-500' : 'text-indigo-500'}`}>{Math.round(progress)}%</span>
                    <span className="text-[7px] font-bold text-slate-700 uppercase tracking-widest mt-1">Acessar</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-4 bg-slate-900 text-white shadow-none relative z-30">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); resetSearchAndFocus(); }} className="flex items-center text-slate-500 text-[9px] font-bold uppercase tracking-widest">
            <ArrowLeft size={14} className="mr-1" /> {selectedLocation}
          </button>
          <div className="flex space-x-2">
            <button 
              onClick={toggleSearchMode} 
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl border transition-all active:scale-95
                ${searchMode === 'DESCRIPTION' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
            >
              {searchMode === 'DESCRIPTION' ? <TagIcon size={16} /> : <FileSearch size={16} />}
              <span className="text-[8px] font-black uppercase tracking-widest">{searchMode === 'TAG' ? 'SEM ETIQUETA' : 'BUSCAR PLAQUETA'}</span>
            </button>
            <button onClick={() => setInputMethod('keyboard')} className={`p-2 rounded-lg transition-colors ${inputMethod === 'keyboard' ? 'bg-indigo-600' : 'text-slate-600'}`}><Keyboard size={16} /></button>
            {searchMode === 'TAG' && (
              <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2 rounded-lg transition-colors ${inputMethod === 'scanner' ? 'bg-indigo-600' : 'text-slate-600'}`}><Zap size={16} /></button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <input 
              ref={searchInputRef}
              type="text" 
              inputMode={searchMode === 'TAG' ? "numeric" : "text"}
              value={displayValue} 
              placeholder={searchMode === 'TAG' ? "000000" : "DESCREVA O ITEM..."}
              onChange={(e) => { 
                if (searchMode === 'TAG') {
                  const r = e.target.value.replace(/\D/g, ''); 
                  setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); 
                } else {
                  setDisplayValue(e.target.value.toUpperCase());
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)}
              className={`w-full bg-slate-800 border px-4 py-3 font-bold text-white rounded-xl outline-none focus:border-indigo-500 tracking-[0.1em] transition-all
                ${searchMode === 'TAG' ? 'font-mono text-2xl text-center border-slate-700' : 'text-sm border-amber-600/50'}`}
            />
          </div>
          {searchMode === 'TAG' && (
            <button onClick={() => triggerSearch(displayValue)} className="h-[52px] w-[52px] bg-indigo-600 rounded-xl flex items-center justify-center active:scale-95"><Search size={24} /></button>
          )}
        </div>

        <div className="flex mt-4 space-x-2">
          <button onClick={() => setActiveFilter('pending')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-colors ${activeFilter === 'pending' ? 'bg-white text-slate-950 border-white' : 'text-slate-500 border-slate-800'}`}>Pendente</button>
          <button onClick={() => setActiveFilter('checked')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-colors ${activeFilter === 'checked' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-500 border-slate-800'}`}>Conferido</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar pb-32">
        {filteredAndSortedAssets.length > 0 ? (
          filteredAndSortedAssets.map((asset, index) => (
            <AssetCard 
              key={asset.id} 
              asset={asset} 
              onSelect={onSelectAsset} 
              decision={null} 
              onMakeDecision={handleIndividualDecision} 
              yesButtonRef={index === 0 ? firstYesButtonRef : undefined} 
              isConferidoTab={activeFilter === 'checked'}
              highlighted={activeBatch && getPlaqueta(asset) === activeBatch.plaqueta}
              showLocation={!!activeBatch || searchMode === 'DESCRIPTION'} 
            />
          ))
        ) : (
          <div className="py-20 text-center opacity-20">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {searchMode === 'DESCRIPTION' && displayValue.length < 3 ? 'Digite para buscar por descrição' : 'Nenhum item encontrado'}
            </p>
          </div>
        )}
      </div>

      {/* FOOTER BAR: CONFERÊNCIA EM LOTE (Bulk Confirmation) */}
      {activeBatch && (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-900 border-t border-slate-800 z-50 animate-slideUp">
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-500/20 text-amber-500 rounded-lg">
                  <Copy size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-widest">Múltiplos Itens</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{activeBatch.ids.length} ativos com etiqueta {activeBatch.plaqueta}</p>
                </div>
              </div>
              <button onClick={() => setActiveBatch(null)} className="p-2 text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            
            <button 
              onClick={handleBulkConfirm}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all"
            >
              <CheckSquare size={20} strokeWidth={3} />
              <span>Confirmar Todo o Lote</span>
            </button>
            
            <p className="text-[8px] text-center text-slate-600 uppercase font-black tracking-[0.2em] mt-3">Confirmação Simultânea de Patrimônio</p>
          </div>
        </div>
      )}

      {showNewAssetDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl">
            {!isCreatingNewAsset ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-tight italic mb-2">Item não cadastrado</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">A etiqueta {committedSearch} não foi localizada na base de dados desta unidade.</p>
                <div className="space-y-3">
                  <button onClick={() => setIsCreatingNewAsset(true)} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest active:scale-95 transition-all">Novo Cadastro</button>
                  <button onClick={resetSearchAndFocus} className="w-full py-4 bg-slate-800 text-slate-400 rounded-xl font-black uppercase tracking-widest active:scale-95 transition-all">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center mb-6">
                   <h3 className="text-lg font-bold text-white uppercase">Inclusão Direta</h3>
                   <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Cadastrando item em {selectedLocation}</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Descrição do Ativo</label>
                    <textarea autoFocus value={newAssetData.description} onChange={(e) => setNewAssetData(prev => ({...prev, description: e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase outline-none focus:border-indigo-500 min-h-[100px]" placeholder="EX: CADEIRA ESCRITÓRIO GIRATÓRIA..."></textarea>
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Etiqueta (Opcional)</label>
                    <input type="text" value={newAssetData.plaqueta || committedSearch} onChange={(e) => setNewAssetData(prev => ({...prev, plaqueta: e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase outline-none focus:border-indigo-500" placeholder="000000" />
                  </div>
                </div>
                <div className="flex space-x-2 pt-4">
                   <button onClick={handleCreateNewAsset} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">Salvar</button>
                   <button onClick={() => setIsCreatingNewAsset(false)} className="px-6 py-4 bg-slate-800 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest">Voltar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(val) => { setIsScannerOpen(false); triggerSearch(val.replace(/\D/g, '').slice(-6)); }} />}
    </div>
  );
};

export default Inventory;
