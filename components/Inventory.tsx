
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
  Info,
  Layers,
  CheckCircle2
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  decision: 'YES' | 'NO' | null;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  yesButtonRef?: React.RefObject<HTMLButtonElement | null>;
  isConferidoTab: boolean;
  highlighted?: boolean;
  showLocation?: boolean; // Nova prop para exibir localização em modo lote
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
    
    let baseList = [];

    // Prioridade 1: Lote Ativo (Visualização Cross-Location e Ordenada)
    if (activeBatch) {
      const idSet = new Set(activeBatch.ids);
      baseList = assets.filter(a => idSet.has(String(a.id)));
    } 
    // Prioridade 2: Busca por Plaqueta
    else if (committedSearch) {
      const term = committedSearch.toUpperCase().trim();
      baseList = assets.filter(a => {
          const p = getPlaqueta(a);
          return p === term || p.padStart(6, '0') === term.padStart(6, '0');
      });
    } 
    // Prioridade 3: Listagem do Setor
    else {
      baseList = assets
        .filter(a => getItemLocation(a) === currentLoc)
        .filter(a => !checkIsBaixado(a))
        .filter(a => activeFilter === 'checked' ? !!a._conferido : !a._conferido);
    }

    // Algoritmo de Ordenação Natural (Crescente) para Hierarquia de Ativos
    return baseList.sort((a, b) => {
      const pA = getPlaqueta(a).padStart(12, '0'); // Pad maior para garantir ordenação de números longos
      const pB = getPlaqueta(b).padStart(12, '0');
      
      // Se as plaquetas forem iguais, ordena por ID ou sub-item (se existir campo específico)
      if (pA === pB) {
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      }
      
      return pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [assets, selectedLocation, committedSearch, activeFilter, activeBatch, getItemLocation, getPlaqueta, checkIsBaixado]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    if (searchInputRef.current) searchInputRef.current.blur();
  };

  const resetSearchAndFocus = useCallback(() => {
    setDisplayValue('000000'); 
    setCommittedSearch('');
    setActiveBatch(null);
    setShowNewAssetDialog(false); 
    setIsCreatingNewAsset(false);
    
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    if (inputMethod === 'scanner') {
      setIsScannerOpen(true);
    }
  }, [inputMethod]);

  const handleBulkConfirm = () => {
    if (activeBatch && activeBatch.ids.length > 0) {
      if (searchInputRef.current) searchInputRef.current.blur();
      onBulkUpdateAssets(activeBatch.ids);
      resetSearchAndFocus();
    }
  };

  const handleIndividualDecision = (id: string, decision: 'YES' | 'NO') => {
    if (searchInputRef.current) searchInputRef.current.blur();

    if (decision === 'NO') return;

    const clickedAsset = assets.find(a => String(a.id) === id);
    if (!clickedAsset) return;

    const plaqueta = getPlaqueta(clickedAsset);
    if (!plaqueta) {
      onBulkUpdateAssets([id]);
      resetSearchAndFocus();
      return;
    }

    // REGRA CROSS-LOCATION: Busca irmãos em TODOS os setores da empresa
    const siblings = assets.filter(a => 
      !a._conferido && 
      getPlaqueta(a) === plaqueta
    );

    if (siblings.length > 1) {
      setActiveBatch({
        plaqueta: plaqueta,
        ids: siblings.map(a => String(a.id))
      });
    } else {
      onBulkUpdateAssets([id]);
      resetSearchAndFocus();
    }
  };

  useEffect(() => {
    if (committedSearch && filteredAndSortedAssets.length > 1) {
      const pendingSiblings = filteredAndSortedAssets.filter(a => !a._conferido);
      if (pendingSiblings.length > 1) {
        setActiveBatch({
          plaqueta: committedSearch,
          ids: pendingSiblings.map(a => String(a.id))
        });
      }
    }
  }, [committedSearch, filteredAndSortedAssets]);

  useEffect(() => {
    if (committedSearch && filteredAndSortedAssets.length === 0) {
      setShowNewAssetDialog(true);
    }
  }, [committedSearch, filteredAndSortedAssets.length]);

  const handleAddNewLocation = () => {
    if (!newLocationName.trim()) return;
    setSelectedLocation(newLocationName.toUpperCase().trim());
    setIsInventorying(true);
    setNewLocationName('');
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
            <button onClick={handleAddNewLocation} className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center active:scale-95"><Plus size={24} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-24">
          {sortedLocations.map(loc => {
            const { total, checked } = locationStats[loc];
            const progress = total > 0 ? (checked / total) * 100 : 0;
            const isCompleted = progress >= 100;

            return (
              <button 
                key={loc} 
                onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} 
                className="group w-full relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl active:scale-[0.98] transition-all flex flex-col"
              >
                <div 
                  className={`absolute bottom-0 left-0 h-1 transition-all duration-700 ease-out
                    ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-600'}`} 
                  style={{ width: `${progress}%` }} 
                />
                
                <div className="p-5 flex items-center justify-between relative z-10">
                  <div className="flex items-center space-x-4">
                    <div className={`p-2.5 rounded-xl flex items-center justify-center transition-colors
                      ${isCompleted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-indigo-400'}`}>
                      {isCompleted ? <CheckCircle2 size={18} /> : <MapPin size={18} />}
                    </div>
                    <div className="text-left">
                      <span className={`text-sm font-bold block transition-colors ${isCompleted ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {loc}
                      </span>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{checked} / {total} ITENS</span>
                        {isCompleted && (
                          <span className="text-[7px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded tracking-tighter uppercase">Concluído</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-[12px] font-black font-mono tracking-tighter
                      ${isCompleted ? 'text-emerald-500' : 'text-indigo-500'}`}>
                      {Math.round(progress)}%
                    </span>
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
            <button onClick={() => setInputMethod('keyboard')} className={`p-2 rounded-lg transition-colors ${inputMethod === 'keyboard' ? 'bg-indigo-600' : 'text-slate-600'}`}><Keyboard size={16} /></button>
            <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2 rounded-lg transition-colors ${inputMethod === 'scanner' ? 'bg-indigo-600' : 'text-slate-600'}`}><Zap size={16} /></button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode="numeric"
            value={displayValue} 
            onChange={(e) => { 
              const r = e.target.value.replace(/\D/g, ''); 
              setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); 
            }}
            onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)}
            className="flex-1 bg-slate-800 border border-slate-700 px-4 py-3 text-2xl font-bold font-mono text-white rounded-xl outline-none focus:border-indigo-500 text-center tracking-[0.2em]"
          />
          <button onClick={() => triggerSearch(displayValue)} className="h-[52px] w-[52px] bg-indigo-600 rounded-xl flex items-center justify-center active:scale-95"><Search size={24} /></button>
        </div>

        <div className="flex mt-4 space-x-2">
          <button onClick={() => setActiveFilter('pending')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-colors ${activeFilter === 'pending' ? 'bg-white text-slate-950 border-white' : 'text-slate-500 border-slate-800'}`}>Pendente</button>
          <button onClick={() => setActiveFilter('checked')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-colors ${activeFilter === 'checked' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-500 border-slate-800'}`}>Conferido</button>
        </div>
      </div>

      {activeBatch && (
         <div className="px-6 py-4 bg-indigo-900/50 border-b border-indigo-500/30 animate-slideUp flex items-center justify-between shadow-2xl relative z-20">
            <div className="flex items-center space-x-3">
               <div className="p-2 bg-indigo-500 rounded-lg text-white">
                  <Layers size={18} />
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] font-black text-indigo-100 uppercase tracking-widest leading-none mb-1">Validação em Lote</span>
                  <span className="text-[11px] font-black text-white uppercase tracking-tight">Etiqueta {activeBatch.plaqueta} • {activeBatch.ids.length} itens</span>
               </div>
            </div>
            <div className="flex space-x-2">
               <button 
                 onClick={() => setActiveBatch(null)}
                 className="px-3 py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest active:scale-95"
               >
                 Ignorar
               </button>
               <button 
                 onClick={handleBulkConfirm}
                 className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-lg border border-emerald-400/20"
               >
                 Validar Todos
               </button>
            </div>
         </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar pb-32">
        {filteredAndSortedAssets.length > 0 ? (
          filteredAndSortedAssets.map((asset, index) => {
            const isHighlighted = activeBatch && getPlaqueta(asset) === activeBatch.plaqueta;
            return (
              <AssetCard 
                key={asset.id} 
                asset={asset} 
                onSelect={onSelectAsset} 
                decision={null} 
                onMakeDecision={handleIndividualDecision} 
                yesButtonRef={index === 0 ? firstYesButtonRef : undefined} 
                isConferidoTab={activeFilter === 'checked'}
                highlighted={isHighlighted}
                showLocation={!!activeBatch} // Mostra local apenas em modo lote
              />
            );
          })
        ) : (
          <div className="py-20 text-center opacity-20">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Nenhum item nesta visualização</p>
          </div>
        )}
      </div>

      {showNewAssetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-xs rounded-2xl p-8 text-center border border-slate-800">
            <AlertCircle size={32} className="mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-bold text-white uppercase">Inexistente</h3>
            <p className="text-[10px] font-medium text-slate-500 uppercase mt-2">Etiqueta <span className="text-red-500 font-bold">{committedSearch}</span> não encontrada nesta unidade.</p>
            <div className="mt-8 space-y-3">
              <button onClick={() => { setNewAssetData({ description: '', plaqueta: committedSearch }); setShowNewAssetDialog(false); setIsCreatingNewAsset(true); }} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[10px] active:scale-95 shadow-lg shadow-indigo-900/40">Inserir Agora</button>
              <button onClick={resetSearchAndFocus} className="w-full py-3 text-slate-500 font-bold uppercase text-[10px]">Ignorar</button>
            </div>
          </div>
        </div>
      )}

      {isCreatingNewAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-xs rounded-2xl p-6 border border-slate-800">
             <h3 className="text-sm font-bold text-white uppercase mb-6 tracking-tight">Nova Ficha Técnica</h3>
             <div className="space-y-4">
                <div className="px-4 py-2 bg-slate-950 rounded-lg font-mono font-bold text-indigo-400 text-lg border border-slate-800 text-center tracking-widest">{newAssetData.plaqueta}</div>
                <textarea rows={3} placeholder="MEMORIAL DESCRITIVO..." value={newAssetData.description} onChange={(e) => setNewAssetData({...newAssetData, description: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-slate-950 rounded-xl border border-slate-800 focus:border-indigo-500 outline-none text-xs font-bold uppercase text-white transition-all" />
                <div className="flex space-x-2 pt-2">
                   <button onClick={resetSearchAndFocus} className="flex-1 py-3 bg-slate-800 text-slate-500 rounded-xl font-bold uppercase text-[9px] tracking-widest">Cancelar</button>
                   <button onClick={() => { onUpdateAsset({ id: `new_${Date.now()}`, DESCRICAO_DO_ATIVO_IMOBILIZADO: newAssetData.description.toUpperCase(), PLAQUETA: newAssetData.plaqueta, LOCALIZACAO: selectedLocation || "", _isNew: true, _conferido: true }); resetSearchAndFocus(); }} className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[9px] tracking-widest active:scale-95 transition-all">Validar Ativo</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(val) => { setIsScannerOpen(false); triggerSearch(val.replace(/\D/g, '').slice(-6)); }} />}
    </div>
  );
};

export default Inventory;
