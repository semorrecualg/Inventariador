
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ArrowLeft, 
  MapPin, 
  AlertCircle,
  AlertTriangle,
  Save,
  Check,
  X,
  PlusCircle,
  FilePlus,
  Keyboard,
  Zap,
  Info,
  Link2,
  Box,
  Hash,
  RefreshCcw,
  Move,
  Clock,
  Layers
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  plaquetaTerms: string[];
  decision: 'YES' | 'NO' | null;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  yesButtonRef?: React.RefObject<HTMLButtonElement | null>;
  isConferidoTab: boolean;
  currentLocation: string;
}

const AssetCard = React.memo(({ 
  asset, 
  onSelect, 
  plaquetaTerms, 
  decision,
  onMakeDecision,
  yesButtonRef,
  isConferidoTab,
  currentLocation
}: AssetCardProps) => {
  const getVal = (terms: string[]) => {
    const normTerms = terms.map(t => t.toUpperCase());
    for (const term of normTerms) {
       const foundKey = Object.keys(asset).find(k => k.toUpperCase() === term);
       if (foundKey && asset[foundKey] !== undefined && asset[foundKey] !== null && String(asset[foundKey]).trim() !== "") {
           return String(asset[foundKey]).trim().toUpperCase();
       }
    }
    return "";
  };

  const getItemLocation = () => {
    const locationTerms = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'LOCAL'];
    return getVal(locationTerms) || "SEM ENDEREÇO";
  };

  const descSintetica = getVal(['DESC_SINTETICA', 'DESCRICAO', 'DESCRIÇÃO', 'NOME']) || "SEM DESCRIÇÃO";
  const empresa = getVal(['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE', 'RAZAO']) || "GBR";
  const qtde = getVal(['QTDE', 'QUANTIDADE', 'QUANT', 'QTD']) || "1";
  const registro = getVal(['REGISTRO', 'COD_ITEM', 'ID_ATIVO', 'CONTROLE']) || "---";
  const sItem = getVal(['S_ITEM', 'S_ITEM', 'SUB_ITEM', 'SUB']) || "0";
  const aquisicao = getVal(['DT.AQUISICAO', 'DT_AQUISICAO', 'DATA_AQUISICAO', 'AQUISICAO', 'DATA']) || "---";
  const situacao = getVal(['STATUS', 'SITUACAO', 'TAG_INVENTARIO']) || "ATIVO";
  const conta = getVal(['DESCRICAO_DA_CONTA', 'DESC_CONTA', 'CONTA_CONTABIL', 'CONTA']) || "NÃO DEF.";
  const plaqueta = getVal(plaquetaTerms) || "S/P";
  const currentAssetLoc = getItemLocation();
  
  const isConferido = !!asset._conferido;
  const isNew = !!asset._isNew;
  const isAdopted = asset.TAG_ADOCAO === "ADOTADO" || (asset.TAG_INVENTARIO === "ADOTADO");
  const isReAdopted = asset.TAG_ADOCAO === "RE-ADOTADO" || (asset.TAG_INVENTARIO === "RE-ADOTADO NO INVENTARIO");

  const needsReInventory = isConferido && currentAssetLoc !== currentLocation && !isReAdopted;

  // Temas Visuais
  let theme = 'bg-red-50/20 border-red-100 shadow-red-50';
  let statusLabel = 'PENDENTE';
  let labelColor = 'bg-red-500';
  let textColor = 'text-gray-900';
  let subTextColor = 'text-gray-400';
  let infoBoxBg = 'bg-white/70';

  if (isConferido) {
    if (isNew) {
      theme = 'bg-purple-50 border-purple-200 shadow-purple-100';
      statusLabel = 'INCLUSÃO';
      labelColor = 'bg-purple-600';
    } else if (isReAdopted) {
      theme = 'bg-cyan-50 border-cyan-200 shadow-cyan-100';
      statusLabel = 'RE-ADOTADO';
      labelColor = 'bg-cyan-600';
    } else if (isAdopted) {
      theme = 'bg-cyan-50 border-cyan-200 shadow-cyan-100';
      statusLabel = 'ADOTADO';
      labelColor = 'bg-cyan-600';
    } else {
      theme = 'bg-emerald-50 border-emerald-200 shadow-emerald-100';
      statusLabel = 'INVENTARIADO';
      labelColor = 'bg-emerald-600';
    }
  } else {
    if (currentAssetLoc !== currentLocation && currentAssetLoc !== "SEM ENDEREÇO") {
        theme = 'bg-yellow-400 border-yellow-600 shadow-xl animate-pulse ring-4 ring-yellow-200';
        statusLabel = 'ALERTA: ADOÇÃO';
        labelColor = 'bg-yellow-600';
        textColor = 'text-black';
        subTextColor = 'text-black/60';
    }
  }

  if (needsReInventory && !isConferidoTab) {
      theme = 'bg-slate-900 border-fuchsia-500 shadow-2xl ring-4 ring-fuchsia-500/20 animate-pulse';
      statusLabel = 'RE-ADOTAR NO INVENTÁRIO?';
      labelColor = 'bg-fuchsia-600';
      textColor = 'text-white';
      subTextColor = 'text-fuchsia-200/60';
      infoBoxBg = 'bg-black/40';
  }

  return (
    <div 
      onClick={() => onSelect(asset)} 
      className={`flex flex-col p-6 border transition-all mb-4 rounded-[2.8rem] shadow-sm relative overflow-hidden active:scale-[0.98]
        ${decision === 'YES' ? 'bg-emerald-100 border-emerald-500 ring-4 ring-emerald-500/30' : 
          decision === 'NO' ? 'bg-gray-100 border-gray-300 opacity-60' : theme}`}
    >
      {/* Label de Status Reposicionado para não conflitar com botões */}
      <div className={`absolute top-0 left-0 px-6 py-2.5 ${labelColor} text-white text-[7.5px] font-black uppercase tracking-[0.2em] rounded-br-[1.8rem] shadow-md flex items-center z-20`}>
        {isReAdopted || needsReInventory ? <RefreshCcw size={10} className="mr-2" /> : isAdopted ? <Move size={10} className="mr-2" /> : <Check size={10} className="mr-2" />} {statusLabel}
      </div>

      <div className="flex items-center justify-between mb-4 mt-6">
        <div className="flex flex-col">
          <div className={`flex items-center space-x-4 px-6 py-3 rounded-2xl border-2 transition-all
            ${(isConferido && !needsReInventory) || decision === 'YES' ? 'bg-white border-transparent shadow-inner' : 'bg-white/20 border-white/20'}`}>
            <span className={`text-[10px] font-black uppercase opacity-40 tracking-widest leading-none ${needsReInventory ? 'text-white' : ''}`}>PLAQUETA</span>
            <span className={`text-2xl font-black tracking-tighter leading-none ${needsReInventory ? 'text-white' : 'text-black'}`}>{plaqueta}</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {(!isConferido || needsReInventory) && !isConferidoTab && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'NO'); }} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-90 ${decision === 'NO' ? 'bg-gray-800 text-white' : 'bg-white/10 text-white border border-white/20'}`}><X size={26} strokeWidth={3} /></button>
              <button ref={yesButtonRef} onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} className={`w-18 h-18 rounded-[1.8rem] flex items-center justify-center transition-all shadow-xl active:scale-90 focus:ring-4 focus:ring-emerald-200 ${decision === 'YES' ? 'bg-emerald-600 text-white animate-pulse' : 'bg-fuchsia-500 text-white border-2 border-fuchsia-400'}`}><Check size={40} strokeWidth={4} /></button>
            </>
          )}
          {isConferido && !needsReInventory && <div className={`w-16 h-16 text-white rounded-full flex items-center justify-center shadow-lg ${labelColor}`}><Check size={36} strokeWidth={4} /></div>}
        </div>
      </div>

      <div className="px-2 mb-4">
        <h3 className={`text-[18px] font-black uppercase leading-[1.2] drop-shadow-sm ${textColor}`}>{descSintetica}</h3>
      </div>

      {(currentAssetLoc !== currentLocation && currentAssetLoc !== "SEM ENDEREÇO") && (
          <div className={`mb-4 px-5 py-3 rounded-2xl border flex items-center space-x-3 
            ${needsReInventory ? 'bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-100' : 'bg-black/10 border-black/5 text-black'}`}>
              <RefreshCcw size={14} className={needsReInventory ? "text-fuchsia-400" : "text-black"} />
              <span className="text-[10px] font-black uppercase tracking-widest">Local Anterior: {currentAssetLoc}</span>
          </div>
      )}

      {needsReInventory && (
          <div className="mb-4 px-5 py-3 bg-fuchsia-600 text-white rounded-2xl border border-fuchsia-400 flex items-center justify-center space-x-2 shadow-lg">
              <Clock size={14} />
              <span className="text-[9px] font-black uppercase tracking-[0.15em]">RE-ADOTAR NO SETOR ATUAL?</span>
          </div>
      )}

      <div className={`${infoBoxBg} backdrop-blur-md p-5 rounded-[2rem] border-l-4 border-blue-500 shadow-sm flex flex-col space-y-3`}>
         <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center">
            <span className={`text-[10px] font-bold uppercase tracking-tight ${subTextColor}`}>EMPRESA: <b className={textColor}>{empresa}</b></span>
            <div className={`w-1 h-1 rounded-full ${needsReInventory ? 'bg-white/20' : 'bg-gray-200'}`}></div>
            <span className={`text-[10px] font-bold uppercase tracking-tight ${subTextColor}`}>QTDE: <b className={textColor}>{qtde}</b></span>
         </div>
         
         <div className={`flex flex-wrap gap-x-5 gap-y-1.5 items-center p-3 rounded-xl border shadow-inner ${needsReInventory ? 'bg-black/40 border-white/10' : 'bg-gray-50/80 border-gray-100'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-tight ${needsReInventory ? 'text-fuchsia-400' : 'text-blue-400'}`}>COD.ITEM: <b className={textColor}>{registro}</b></span>
            <div className={`w-1 h-1 rounded-full ${needsReInventory ? 'bg-white/20' : 'bg-blue-200'}`}></div>
            <span className={`text-[10px] font-bold uppercase tracking-tight ${needsReInventory ? 'text-fuchsia-400' : 'text-blue-400'}`}>SUB: <b className={textColor}>{sItem}</b></span>
         </div>

         <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center">
            <span className={`text-[10px] font-bold uppercase tracking-tight ${subTextColor}`}>AQUISIÇÃO: <b className={textColor}>{aquisicao}</b></span>
            <div className={`w-1 h-1 rounded-full ${needsReInventory ? 'bg-white/20' : 'bg-gray-200'}`}></div>
            <span className={`text-[10px] font-bold uppercase tracking-tight ${subTextColor}`}>SITUAÇÃO: <b className={textColor}>{situacao}</b></span>
         </div>

         <div className={`pt-2 mt-1 border-t ${needsReInventory ? 'border-white/10' : 'border-gray-100'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-tight leading-relaxed ${subTextColor}`}>CONTA CONTÁBIL: <b className={needsReInventory ? 'text-blue-300' : 'text-blue-600/80'}>{conta}</b></span>
         </div>
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
  assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany
}) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>(() => (localStorage.getItem('app_input_method') as any) || 'keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showNewAssetDialog, setShowNewAssetDialog] = useState(false);
  const [isCreatingNewAsset, setIsCreatingNewAsset] = useState(false);
  const [newAssetData, setNewAssetData] = useState({ description: '', plaqueta: '' });
  const [localDecisions, setLocalDecisions] = useState<Record<string, 'YES' | 'NO'>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstYesButtonRef = useRef<HTMLButtonElement>(null);

  const plaquetaTerms = ['PLAQUETA', 'PATRIMONIO', 'BEM', 'TAG', 'REGISTRO', 'ETIQUETA'];
  const locationTerms = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'LOCAL'];

  useEffect(() => { localStorage.setItem('app_input_method', inputMethod); }, [inputMethod]);

  const forceCursorRight = useCallback(() => {
    if (searchInputRef.current) {
      const len = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(len, len);
    }
  }, []);

  const getPlaqueta = useCallback((asset: Asset): string => {
    const key = Object.keys(asset).find(k => plaquetaTerms.includes(k.toUpperCase()));
    return key ? String(asset[key]).trim() : "";
  }, []);

  const getItemLocation = useCallback((asset: Asset): string => {
    const keys = Object.keys(asset);
    for (const term of locationTerms) {
      const match = keys.find(k => k.toUpperCase() === term.toUpperCase());
      if (match && asset[match]) return String(asset[match]).trim().toUpperCase();
    }
    return "SEM ENDEREÇO";
  }, []);

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
    const currentLoc = selectedLocation.toUpperCase();
    
    let results: Asset[] = [];
    if (committedSearch) {
      const term = committedSearch.toUpperCase().trim();
      results = allAssets.filter(a => {
          const p = getPlaqueta(a).toUpperCase();
          return p === term || p.padStart(6, '0') === term.padStart(6, '0');
      });
    } else {
      results = allAssets.filter(a => getItemLocation(a) === currentLoc);
    }

    return results
      .filter(a => {
          if (activeFilter === 'checked') {
            return !!a._conferido && getItemLocation(a) === currentLoc;
          }
          return !a._conferido || (!!a._conferido && getItemLocation(a) !== currentLoc);
      })
      .sort((a, b) => getPlaqueta(a).localeCompare(getPlaqueta(b), undefined, { numeric: true }));
  }, [allAssets, selectedLocation, committedSearch, activeFilter, getItemLocation, getPlaqueta]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    setLocalDecisions({});
    searchInputRef.current?.blur();
  };

  const resetSearchAndFocus = useCallback(() => {
    setDisplayValue('000000'); setCommittedSearch(''); setLocalDecisions({});
    setShowNewAssetDialog(false); setIsCreatingNewAsset(false);
    if (inputMethod === 'scanner') setIsScannerOpen(true);
    else setTimeout(() => { searchInputRef.current?.focus(); forceCursorRight(); }, 150);
  }, [inputMethod, forceCursorRight]);

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
    const asset = filteredAssetsInLocation.find(a => String(a.id) === id);
    if (!asset) return;

    const itemPlaqueta = getPlaqueta(asset);
    const siblings = filteredAssetsInLocation.filter(a => getPlaqueta(a) === itemPlaqueta);

    if (decision === 'YES') {
        // DETECÇÃO AUTOMÁTICA DE LOTE: Se clicar em um item com duplicidade na lista, seleciona todos
        if (siblings.length > 1) {
            setLocalDecisions(prev => {
                const next = { ...prev };
                siblings.forEach(s => { next[String(s.id)] = 'YES'; });
                return next;
            });
        } else {
            // Se for único, confirma direto
            onBulkUpdateAssets([id]);
            resetSearchAndFocus();
        }
    } else {
        setLocalDecisions(prev => ({ ...prev, [id]: 'NO' }));
    }
  }, [filteredAssetsInLocation, onBulkUpdateAssets, resetSearchAndFocus, getPlaqueta]);

  useEffect(() => {
    if (committedSearch && filteredAssetsInLocation.length > 0) {
      setTimeout(() => firstYesButtonRef.current?.focus(), 300);
    } else if (committedSearch && filteredAssetsInLocation.length === 0) {
      const exists = allAssets.some(a => {
        const p = getPlaqueta(a).toUpperCase();
        const s = committedSearch.toUpperCase().trim();
        return p === s || p.padStart(6, '0') === s.padStart(6, '0');
      });
      if (!exists) setShowNewAssetDialog(true);
    }
  }, [committedSearch, filteredAssetsInLocation.length, allAssets, getPlaqueta]);

  // Se houver mais de um SIM ou se a busca resultou em múltiplos itens da mesma etiqueta
  const showBatchButton = useMemo(() => {
    const yesCount = Object.values(localDecisions).filter(d => d === 'YES').length;
    return yesCount > 1;
  }, [localDecisions]);

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn">
        <div className="p-6 pb-2">
          <button onClick={onBack} className="mb-4 text-gray-400 text-[10px] font-black uppercase flex items-center space-x-1"><ArrowLeft size={14} /> <span>Menu Principal</span></button>
          <h2 className="text-2xl font-black text-black uppercase mb-6">Setores Operacionais</h2>
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input type="text" placeholder="FILTRAR POR NOME..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value.toUpperCase())} className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl text-[10px] font-black uppercase outline-none shadow-inner" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10 space-y-4">
          {Object.keys(locationStats).sort().filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full flex items-center justify-between p-6 rounded-[2.2rem] border transition-all ${percent === 100 ? 'bg-gray-50 opacity-60' : stats.checked > 0 ? 'bg-gray-900 text-white shadow-xl shadow-gray-200' : 'bg-white shadow-sm'}`}>
                <div className="flex items-center space-x-4 text-left">
                  <div className={`p-3 rounded-2xl ${stats.checked > 0 ? 'bg-white/10 text-blue-400' : 'bg-gray-100 text-gray-400'}`}><MapPin size={24} /></div>
                  <div><span className="text-[14px] font-black uppercase truncate block">{loc}</span><span className="text-[9px] font-black opacity-40 uppercase tracking-widest">{stats.checked}/{stats.total} ITENS</span></div>
                </div>
                <span className="text-xs font-black">{percent}%</span>
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
          <button onClick={() => { setIsInventorying(false); resetSearchAndFocus(); }} className="text-gray-400 text-[10px] font-black uppercase flex items-center space-x-1"><ArrowLeft size={14} /> <span>Trocar Local</span></button>
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner">
             <button onClick={() => setInputMethod('keyboard')} className={`px-4 py-1.5 rounded-lg flex items-center space-x-2 ${inputMethod === 'keyboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><Keyboard size={12} /><span className="text-[8px] font-black uppercase">Manual</span></button>
             <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`px-4 py-1.5 rounded-lg flex items-center space-x-2 ${inputMethod === 'scanner' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400'}`}><Zap size={12} /><span className="text-[8px] font-black uppercase">Scanner</span></button>
          </div>
        </div>
        
        <div className="relative mb-5">
          <input ref={searchInputRef} type="text" inputMode="numeric" value={displayValue} onChange={(e) => { const r = e.target.value.replace(/\D/g, ''); setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); setTimeout(forceCursorRight, 0); }} onFocus={() => setTimeout(forceCursorRight, 0)} onSelect={forceCursorRight} onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)} className="w-full pl-20 pr-32 py-7 text-4xl font-black uppercase outline-none border-2 border-blue-100 bg-white rounded-[2.5rem] focus:border-blue-500 transition-all text-blue-950 shadow-inner" />
          <div className="absolute left-7 top-1/2 -translate-y-1/2 text-[8px] font-black text-blue-300 uppercase pointer-events-none">ETIQUETA</div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2"><button onClick={() => triggerSearch(displayValue)} className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><Search size={28} strokeWidth={3} /></button></div>
        </div>

        <div className="flex space-x-4 px-2">
          <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); }} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all border-b-4 ${activeFilter === 'pending' ? 'bg-red-50 border-red-600 text-red-900 shadow-inner' : 'bg-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest">Pendentes ({locationStats[selectedLocation!] ? locationStats[selectedLocation!].total - locationStats[selectedLocation!].checked : 0})</span>
          </button>
          <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); }} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all border-b-4 ${activeFilter === 'checked' ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-inner' : 'bg-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest">Conferidos ({locationStats[selectedLocation!]?.checked || 0})</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-6 no-scrollbar pb-40 transition-colors duration-500 ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50/10'}`}>
        {filteredAssetsInLocation.length > 0 ? (
          <div className="mt-4 space-y-4">
            {filteredAssetsInLocation.map((asset, index) => (
              <AssetCard 
                key={asset.id} 
                asset={asset} 
                onSelect={onSelectAsset} 
                plaquetaTerms={plaquetaTerms} 
                decision={localDecisions[String(asset.id)] || null} 
                onMakeDecision={handleMakeDecision} 
                yesButtonRef={index === 0 ? firstYesButtonRef : undefined} 
                isConferidoTab={activeFilter === 'checked'}
                currentLocation={selectedLocation || ""}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center opacity-30 flex flex-col items-center">
            {committedSearch ? <AlertCircle size={48} className="mb-4 text-gray-200" /> : <Info size={48} className="mb-4 text-gray-200" />}
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">{committedSearch ? `Ativo ${committedSearch} não encontrado` : 'Aguardando Bipagem...'}</p>
          </div>
        )}
      </div>

      {showBatchButton && (
        <div className="fixed bottom-8 left-6 right-6 z-40 animate-slideUp">
           <button onClick={() => { onBulkUpdateAssets(Object.entries(localDecisions).filter(([_, d]) => d === 'YES').map(([id]) => id)); resetSearchAndFocus(); }} className="w-full py-5 bg-emerald-600 text-white rounded-[2.2rem] font-black uppercase shadow-2xl flex items-center justify-center space-x-3 active:scale-95 border-4 border-emerald-400/50"><Save size={24} /><span>Confirmar Lote ({Object.entries(localDecisions).filter(([_, d]) => d === 'YES').length})</span></button>
        </div>
      )}

      {showNewAssetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative text-center animate-bounceIn">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><AlertCircle size={36} /></div>
            <h3 className="text-xl font-black text-gray-900 uppercase mb-2 tracking-tight">Ativo não Identificado</h3>
            <p className="text-[11px] font-bold text-gray-400 uppercase leading-relaxed mb-8">O código <span className="text-red-600 font-black">{committedSearch}</span> não existe no banco. Deseja incluir?</p>
            <div className="space-y-3">
              <button onClick={() => { setNewAssetData({ description: '', plaqueta: committedSearch }); setShowNewAssetDialog(false); setIsCreatingNewAsset(true); }} className="w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase flex items-center justify-center space-x-2"><PlusCircle size={20} /><span>Sim, Cadastrar Agora</span></button>
              <button onClick={resetSearchAndFocus} className="w-full py-4 bg-gray-100 text-gray-500 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isCreatingNewAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/85 backdrop-blur-xl">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative overflow-hidden animate-bounceIn">
             <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><FilePlus size={24} /></div>
                <div><h3 className="text-xl font-black text-gray-900 uppercase">Novo Registro</h3><p className="text-[8px] font-black text-purple-600 uppercase mt-1 tracking-widest">Inclusão Manual em Campo</p></div>
             </div>
             <div className="space-y-5">
                <div><label className="block text-[9px] font-black text-gray-400 uppercase mb-1.5 ml-2">Etiqueta Lida</label><div className="px-5 py-4 bg-gray-50 rounded-2xl font-black text-blue-600 text-xl border border-gray-100">{newAssetData.plaqueta}</div></div>
                <div><label className="block text-[9px] font-black text-gray-400 uppercase mb-1.5 ml-2">Descrição do Item</label><textarea autoFocus rows={3} placeholder="EX: CADEIRA ESCRITÓRIO PRETA..." value={newAssetData.description} onChange={(e) => setNewAssetData({...newAssetData, description: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-purple-500 focus:bg-white outline-none font-bold text-xs uppercase shadow-inner" /></div>
                <div className="flex space-x-3 pt-4">
                   <button onClick={resetSearchAndFocus} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px]">Descartar</button>
                   <button onClick={() => { onUpdateAsset({ id: `new_${Date.now()}`, PLAQUETA: newAssetData.plaqueta, DESCRICAO: newAssetData.description.toUpperCase(), EMPRESA: selectedCompany || "", LOCALIZACAO: selectedLocation || "", _isNew: true, _conferido: true }); resetSearchAndFocus(); }} className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl font-black uppercase flex items-center justify-center space-x-2 shadow-lg"><Save size={16} /><span>Salvar Ativo</span></button>
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
