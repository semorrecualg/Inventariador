
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ArrowLeft, 
  MapPin, 
  AlertCircle,
  AlertTriangle,
  Calendar,
  Building2,
  CheckCircle2,
  Save,
  Check,
  X,
  PlusCircle,
  FilePlus,
  Keyboard,
  Zap,
  Info
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  plaquetaTerms: string[];
  descTerms: string[];
  decision: 'YES' | 'NO' | null;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  yesButtonRef?: React.RefObject<HTMLButtonElement | null>;
  isConferidoTab: boolean;
}

// Fix: Defining the missing InventoryProps interface
interface InventoryProps {
  assets: Asset[];
  allAssets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (idsToUpdate: string[]) => void;
  onSelectAsset: (asset: Asset) => void;
  selectedLocation: string | null;
  setSelectedLocation: (location: string | null) => void;
  isInventorying: boolean;
  setIsInventorying: (isInventorying: boolean) => void;
  selectedCompany: string | null;
}

const AssetCard = React.memo(({ 
  asset, 
  onSelect, 
  plaquetaTerms, 
  descTerms,
  decision,
  onMakeDecision,
  yesButtonRef,
  isConferidoTab
}: AssetCardProps) => {
  
  const getVal = (a: Asset, terms: string[]) => {
    const keys = Object.keys(a);
    const normTerms = terms.map(t => t.toUpperCase());
    for (const k of keys) {
      if (normTerms.includes(k.toUpperCase())) {
        const val = a[k];
        if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "0") {
          return String(val).trim().toUpperCase();
        }
      }
    }
    return "";
  };

  const plaqueta = getVal(asset, plaquetaTerms) || "S/P";
  const desc = getVal(asset, descTerms) || "DESCRIÇÃO NÃO ENCONTRADA";
  const isConferido = !!asset._conferido;
  const isDuplicate = !!asset._isDuplicate || !!asset._isInternalDuplicate || !!asset._isExternalDuplicate;
  const isNew = !!asset._isNew;

  return (
    <div 
      onClick={() => onSelect(asset)} 
      className={`flex flex-col p-5 border transition-all active:bg-white group mb-4 rounded-[2.2rem] shadow-sm
        ${decision === 'YES' ? 'bg-emerald-100 border-emerald-500 ring-4 ring-emerald-500/10' : 
          decision === 'NO' ? 'bg-gray-100 border-gray-300 opacity-60' : 
          isConferido ? 'bg-emerald-50/40 border-emerald-200' : 'bg-red-50/30 border-red-100'}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-3 px-4 py-2 rounded-full border-2 transition-all
              ${isConferido || decision === 'YES' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-red-100 border-red-200 text-red-800'}`}>
              <span className="text-[9px] font-black uppercase opacity-60 tracking-tighter">ATIVO</span>
              <span className="text-xl font-black tracking-tighter leading-none">{plaqueta}</span>
            </div>
            {isNew && <span className="text-[8px] font-black bg-purple-600 text-white px-3 py-1.5 rounded-xl uppercase tracking-widest shadow-lg shadow-purple-100 animate-pulse">INCLUSÃO</span>}
          </div>
          {isDuplicate && (
            <div className="flex items-center space-x-1 px-3 py-1 bg-white text-amber-600 rounded-full w-fit border border-amber-100 mt-1">
               <AlertTriangle size={10} />
               <span className="text-[7px] font-black uppercase tracking-widest">Duplicidade</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!isConferidoTab && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'NO'); }}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-md active:scale-90
                  ${decision === 'NO' ? 'bg-gray-800 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}
              >
                <X size={24} strokeWidth={3} />
              </button>
              <button 
                ref={yesButtonRef}
                onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }}
                className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-90 focus:ring-4 focus:ring-emerald-200
                  ${decision === 'YES' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-500 border-2 border-emerald-100'}`}
              >
                <Check size={32} strokeWidth={4} />
              </button>
            </>
          )}
          {isConferidoTab && (
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg">
              <Check size={24} strokeWidth={4} />
            </div>
          )}
        </div>
      </div>

      <h3 className={`text-[14px] font-black uppercase leading-snug mb-4 px-1 ${isConferido ? 'text-emerald-950' : 'text-red-950'}`}>
        {desc}
      </h3>

      <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-start space-x-3
        ${isConferido ? 'bg-emerald-600/5 border-emerald-200/40' : 'bg-red-600/5 border-red-200/40'}`}>
        <Building2 size={14} className={isConferido ? 'text-emerald-600 shrink-0 mt-0.5' : 'text-red-500 shrink-0 mt-0.5'} />
        <div className="min-w-0 flex-1">
          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-1">Unidade / Razão</span>
          <span className={`text-[11px] font-black uppercase tracking-tight leading-snug block truncate ${isConferido ? 'text-emerald-900' : 'text-red-900'}`}>
             {getVal(asset, ['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE', 'RAZAO', 'CLIENTE']) || 'NÃO IDENTIFICADA'}
          </span>
        </div>
      </div>
    </div>
  );
});

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
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>(() => {
    return (localStorage.getItem('app_input_method') as 'keyboard' | 'scanner') || 'keyboard';
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const [showNewAssetDialog, setShowNewAssetDialog] = useState(false);
  const [isCreatingNewAsset, setIsCreatingNewAsset] = useState(false);
  const [newAssetData, setNewAssetData] = useState({ description: '', plaqueta: '' });
  
  const [localDecisions, setLocalDecisions] = useState<Record<string, 'YES' | 'NO'>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstYesButtonRef = useRef<HTMLButtonElement>(null);
  
  const plaquetaTerms = useMemo(() => ['PLAQUETA', 'PATRIMONIO', 'BEM', 'TAG'], []);
  const locationTerms = useMemo(() => ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END'], []);
  const descTerms = useMemo(() => ['DESC_SINTETICA', 'SINTETICA', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_ITEM', 'NOME'], []);

  useEffect(() => {
    localStorage.setItem('app_input_method', inputMethod);
  }, [inputMethod]);

  const forceCursorRight = useCallback(() => {
    if (searchInputRef.current) {
      const len = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(len, len);
    }
  }, []);

  const getPlaqueta = useCallback((asset: Asset): string => {
    const pKey = Object.keys(asset).find(k => plaquetaTerms.includes(k.toUpperCase()));
    return pKey ? String(asset[pKey]).trim() : "";
  }, [plaquetaTerms]);

  const getItemLocation = useCallback((asset: Asset): string => {
    const keys = Object.keys(asset);
    for (const term of locationTerms) {
      const match = keys.find(k => k.toUpperCase() === term.toUpperCase());
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

  const filteredAssetsInLocation = useMemo(() => {
    if (!selectedLocation) return [];
    let results: Asset[] = [];
    if (committedSearch) {
      results = allAssets.filter(asset => {
        const pVal = getPlaqueta(asset).toUpperCase();
        const sVal = committedSearch.toUpperCase().trim();
        return pVal === sVal || pVal.padStart(6, '0') === sVal.padStart(6, '0');
      });
    } else {
      results = assets.filter(asset => getItemLocation(asset) === selectedLocation || asset.TAG_ADOCAO === "ADOTADO");
    }

    return results
      .filter(asset => activeFilter === 'pending' ? !asset._conferido : !!asset._conferido)
      .sort((a, b) => getPlaqueta(a).localeCompare(getPlaqueta(b), undefined, { numeric: true }));
  }, [allAssets, assets, selectedLocation, committedSearch, activeFilter, getItemLocation, getPlaqueta]);

  // Lógica de Redirecionamento Automático
  const triggerSearch = (val: string) => {
    const searchedInAll = allAssets.find(a => {
        const p = getPlaqueta(a).toUpperCase();
        const s = val.toUpperCase().trim();
        return p === s || p.padStart(6, '0') === s.padStart(6, '0');
    });

    if (searchedInAll && searchedInAll._conferido && activeFilter === 'pending') {
        if (confirm(`Atenção: Ativo ${val} já está CONFERIDO!\n\nDeseja visualizar na aba de conferidos?`)) {
            setActiveFilter('checked');
            setCommittedSearch(val);
            setLocalDecisions({});
            searchInputRef.current?.blur();
            return;
        }
    }

    setCommittedSearch(val);
    setLocalDecisions({});
    searchInputRef.current?.blur();
  };

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
    // Se for registro único e marcar SIM, processa imediatamente
    if (filteredAssetsInLocation.length === 1 && decision === 'YES') {
        const assetId = String(filteredAssetsInLocation[0].id);
        onBulkUpdateAssets([assetId]);
        resetSearchAndFocus();
        return;
    }
    setLocalDecisions(prev => ({ ...prev, [id]: decision }));
  }, [filteredAssetsInLocation, onBulkUpdateAssets]);

  useEffect(() => {
    if (committedSearch && filteredAssetsInLocation.length > 0) {
      setTimeout(() => firstYesButtonRef.current?.focus(), 300);
    } else if (committedSearch && filteredAssetsInLocation.length === 0) {
      const existsAtAll = allAssets.some(a => {
        const p = getPlaqueta(a).toUpperCase();
        const s = committedSearch.toUpperCase().trim();
        return p === s || p.padStart(6, '0') === s.padStart(6, '0');
      });
      if (!existsAtAll) setShowNewAssetDialog(true);
    }
  }, [committedSearch, filteredAssetsInLocation.length, allAssets, getPlaqueta]);

  const handleSaveConferencia = () => {
    const yesIds = Object.entries(localDecisions).filter(([_, d]) => d === 'YES').map(([id]) => id);
    if (yesIds.length > 0) onBulkUpdateAssets(yesIds);
    resetSearchAndFocus();
  };

  const resetSearchAndFocus = useCallback(() => {
    setDisplayValue('000000');
    setCommittedSearch('');
    setLocalDecisions({});
    setShowNewAssetDialog(false);
    setIsCreatingNewAsset(false);
    
    if (inputMethod === 'scanner') {
        setIsScannerOpen(true);
    } else {
        setTimeout(() => {
            searchInputRef.current?.focus();
            forceCursorRight();
        }, 150);
    }
  }, [forceCursorRight, inputMethod]);

  const handleAssetSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    let formatted = raw.length > 6 ? raw.slice(-6) : raw.padStart(6, '0');
    setDisplayValue(formatted);
    if (committedSearch !== "") { setCommittedSearch(""); setLocalDecisions({}); }
    setTimeout(forceCursorRight, 0);
  };

  const handleSaveNewAsset = () => {
    if (!newAssetData.description) return alert("Informe uma descrição.");
    const newAsset: Asset = {
      id: `new_${Date.now()}`,
      PLAQUETA: newAssetData.plaqueta,
      DESCRIÇÃO: newAssetData.description.toUpperCase(),
      EMPRESA: selectedCompany?.toUpperCase() || "",
      LOCALIZACAO: selectedLocation?.toUpperCase() || "",
      TAG_INVENTARIO: "INCLUSAO",
      _isNew: true, _conferido: true
    };
    onUpdateAsset(newAsset);
    resetSearchAndFocus();
  };

  // Se houver mais de 1 registro encontrado na busca, o botão salvar aparece
  const showSaveButton = filteredAssetsInLocation.length > 1 && Object.keys(localDecisions).length > 0;

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn">
        <div className="p-6 pb-2">
          <button onClick={onBack} className="mb-4 text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1"><ArrowLeft size={10} /> <span>Menu Principal</span></button>
          <h2 className="text-2xl font-black text-black uppercase mb-6">Setores Operacionais</h2>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input type="text" placeholder="FILTRAR SETOR..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value.toUpperCase())} className="w-full pl-10 pr-4 py-3.5 bg-gray-50 rounded-2xl text-[10px] font-black uppercase outline-none border-2 border-transparent focus:border-blue-100 shadow-inner" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10 space-y-4">
          {Object.keys(locationStats).sort().filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full flex items-center justify-between p-6 rounded-[2.2rem] border transition-all active:scale-[0.98] ${percent === 100 ? 'bg-gray-50 border-gray-100 opacity-60' : stats.checked > 0 ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
                <div className="flex items-center space-x-4 text-left">
                  <div className={`p-3 rounded-2xl ${stats.checked > 0 ? 'bg-white/10 text-blue-400' : 'bg-gray-50 text-gray-400'}`}><MapPin size={20} /></div>
                  <div><span className={`text-[13px] font-black uppercase truncate block ${stats.checked > 0 ? 'text-white' : 'text-gray-900'}`}>{loc}</span><span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{stats.checked}/{stats.total} ITENS</span></div>
                </div>
                <span className={`text-[11px] font-black ${stats.checked > 0 ? 'text-blue-400' : 'text-blue-600'}`}>{percent}%</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative">
      <div className={`p-6 pb-2 shadow-sm relative z-10 transition-colors duration-500 ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50'}`}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); resetSearchAndFocus(); }} className="text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1"><ArrowLeft size={10} /> <span>Setores</span></button>
          
          {/* SELETOR DE ENTRADA */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner">
             <button onClick={() => setInputMethod('keyboard')} className={`px-4 py-1.5 rounded-lg flex items-center space-x-2 transition-all ${inputMethod === 'keyboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                <Keyboard size={12} />
                <span className="text-[8px] font-black uppercase">Manual</span>
             </button>
             <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`px-4 py-1.5 rounded-lg flex items-center space-x-2 transition-all ${inputMethod === 'scanner' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400'}`}>
                <Zap size={12} />
                <span className="text-[8px] font-black uppercase">Scanner</span>
             </button>
          </div>
        </div>
        
        <div className="relative mb-5">
          <input ref={searchInputRef} type="text" inputMode="numeric" value={displayValue} onChange={handleAssetSearchChange} onFocus={() => setTimeout(forceCursorRight, 0)} onSelect={forceCursorRight} onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)} className="w-full pl-20 pr-32 py-7 text-4xl font-black uppercase outline-none border-2 border-blue-100 bg-white/50 rounded-[2.2rem] focus:border-blue-500 focus:bg-white transition-all tracking-tighter text-blue-950 caret-blue-600 shadow-inner" />
          <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col items-start pointer-events-none"><span className="text-[7px] font-black text-blue-300 uppercase leading-none">Nº ATIVO</span></div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <button onClick={() => triggerSearch(displayValue)} className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><Search size={28} strokeWidth={3} /></button>
          </div>
        </div>

        <div className="flex space-x-4 px-2">
          <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); }} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all border-b-4 ${activeFilter === 'pending' ? 'bg-red-50 border-red-600 text-red-900 shadow-inner' : 'bg-transparent border-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest">Pendentes ({locationStats[selectedLocation!] ? locationStats[selectedLocation!].total - locationStats[selectedLocation!].checked : 0})</span>
          </button>
          <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); }} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all border-b-4 ${activeFilter === 'checked' ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-inner' : 'bg-transparent border-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest">Conferidos ({locationStats[selectedLocation!]?.checked || 0})</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-6 no-scrollbar pb-40 transition-colors duration-500 ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50/20'}`}>
        {filteredAssetsInLocation.length > 0 ? (
          <div className="mt-4 space-y-4">
            {filteredAssetsInLocation.map((asset, index) => (
              <AssetCard 
                key={asset.id} 
                asset={asset} 
                onSelect={onSelectAsset} 
                plaquetaTerms={plaquetaTerms} 
                descTerms={descTerms}
                decision={localDecisions[String(asset.id)] || null}
                onMakeDecision={handleMakeDecision}
                yesButtonRef={index === 0 ? firstYesButtonRef : undefined}
                isConferidoTab={activeFilter === 'checked'}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center flex flex-col items-center opacity-30">
            {committedSearch ? <AlertCircle size={40} className="mb-4" /> : activeFilter === 'pending' ? <Info size={40} className="mb-4" /> : <CheckCircle2 size={40} className="mb-4" />}
            <p className="text-[10px] font-black uppercase tracking-widest">
                {committedSearch ? `Ativo ${committedSearch} não nesta aba` : activeFilter === 'pending' ? 'Setor concluído ou limpo' : 'Aguardando Conferências'}
            </p>
          </div>
        )}
      </div>

      {showSaveButton && (
        <div className="fixed bottom-6 left-6 right-6 z-40 animate-slideUp">
           <button onClick={handleSaveConferencia} className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center space-x-3 active:scale-95 transition-all">
             <Save size={24} /><span>Salvar Conferência ({Object.keys(localDecisions).length})</span>
           </button>
        </div>
      )}

      {/* MODAL INCLUSÃO */}
      {showNewAssetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-bounceIn text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><AlertCircle size={32} /></div>
            <h3 className="text-xl font-black text-gray-900 uppercase leading-tight mb-2">Plaqueta Inexistente</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed mb-8">O ativo <span className="text-red-600 font-black">{committedSearch}</span> não existe na base. Deseja incluir?</p>
            <div className="space-y-3">
              <button onClick={() => { setNewAssetData({ description: '', plaqueta: committedSearch }); setShowNewAssetDialog(false); setIsCreatingNewAsset(true); }} className="w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase tracking-widest shadow-xl flex items-center justify-center space-x-2"><PlusCircle size={18} /><span>Sim, Incluir Novo</span></button>
              <button onClick={resetSearchAndFocus} className="w-full py-4 bg-gray-100 text-gray-500 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest">Não, Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* FORM INCLUSÃO */}
      {isCreatingNewAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-bounceIn overflow-hidden">
             <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><FilePlus size={24} /></div>
                <div><h3 className="text-xl font-black text-gray-900 uppercase leading-none">Inclusão</h3><p className="text-[8px] font-black text-purple-600 uppercase tracking-widest mt-1">Novo Ativo Manual</p></div>
             </div>
             <div className="space-y-5">
                <div><label className="block text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5 ml-2">Etiqueta Lida</label><div className="px-5 py-4 bg-gray-50 rounded-2xl font-black text-blue-600 text-lg">{newAssetData.plaqueta}</div></div>
                <div><label className="block text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1.5 ml-2">Descrição Completa</label><textarea autoFocus rows={3} placeholder="EX: CADEIRA..." value={newAssetData.description} onChange={(e) => setNewAssetData({...newAssetData, description: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-purple-500 focus:bg-white outline-none font-bold text-xs uppercase shadow-inner" /></div>
                <div className="flex space-x-3 pt-2">
                   <button onClick={resetSearchAndFocus} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px] tracking-widest">Sair</button>
                   <button onClick={handleSaveNewAsset} className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center justify-center space-x-2"><Save size={14} /><span>Salvar Ativo</span></button>
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
