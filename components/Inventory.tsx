
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import { 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Hash, 
  Check,
  CheckCheck,
  MapPin,
  X,
  Plus,
  Filter,
  AlertCircle,
  ArrowUp,
  Lock,
  Zap,
  Square,
  CheckSquare,
  AlertTriangle,
  Info,
  RefreshCw,
  Calendar,
  Building2,
  Box,
  Clipboard,
  Tag,
  FileText
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  onToggle: (e: React.MouseEvent, a: Asset) => void;
  plaquetaTerms: string[];
  descTerms: string[];
  isSelectableMode?: boolean;
  isSelected?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

const AssetCard = React.memo(({ 
  asset, 
  onSelect, 
  onToggle, 
  plaquetaTerms, 
  descTerms, 
  isSelectableMode,
  isSelected,
  buttonRef
}: AssetCardProps) => {
  
  const normalizeStr = (s: string) => 
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

  const getVal = (a: Asset, terms: string[], keywords: string[] = []) => {
    const keys = Object.keys(a);
    const normTerms = terms.map(normalizeStr);
    const normKeywords = keywords.map(normalizeStr);
    
    // Tenta primeiro o match exato
    for (const k of keys) {
      const nk = normalizeStr(k);
      if (normTerms.includes(nk)) {
        const val = a[k];
        if (val !== undefined && val !== null && val !== "") return String(val).trim().toUpperCase();
      }
    }

    // Tenta por palavra-chave contida no nome da coluna
    for (const k of keys) {
      const nk = normalizeStr(k);
      if (normKeywords.some(kw => nk.includes(kw))) {
        const val = a[k];
        if (val !== undefined && val !== null && val !== "") return String(val).trim().toUpperCase();
      }
    }
    return "";
  };

  const formatDate = (val: string) => {
    if (!val || val === "" || val === "0") return "--/--/----";
    if (/^\d{2}[/.]\d{2}[/.]\d{4}/.test(val)) return val.split(' ')[0].replace(/\./g, '/');
    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    if (/^\d{5}$/.test(val)) {
        const date = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
        return date.toLocaleDateString('pt-BR');
    }
    return val;
  };

  const plaqueta = getVal(asset, plaquetaTerms, ['PLAQUETA', 'PATR', 'BEM', 'TAG']) || "S/P";
  const desc = getVal(asset, descTerms, ['DESC', 'NOME', 'ITEM', 'SINTETICA', 'PRODUTO']) || "DESCRIÇÃO NÃO ENCONTRADA";
  const qtde = getVal(asset, ['QTDE', 'QUANTIDADE', 'QTD'], ['QUANT']) || "1";
  const registro = getVal(asset, ['REGISTRO', 'REG', 'NUMERO'], ['NR_REG', 'REGIST']) || "N/A";
  const sItem = getVal(asset, ['S_ITEM', 'SUBITEM', 'SUB_ITEM'], ['SUB']) || "000";
  const rawDate = getVal(asset, ['DT_AQUISICAO', 'DATA_AQUISICAO', 'DT_AQ', 'DATA'], ['AQUIS', 'CADASTRO', 'INICIO']);
  const dtAq = formatDate(rawDate);
  
  // CORREÇÃO: Ampliando busca por Razão Social
  const razao = getVal(
    asset, 
    ['RAZAO_SOCIAL', 'RAZAO', 'NOME_EMPRESA', 'RAZAO SOCIAL'], 
    ['RAZAO', 'SOCIAL', 'EMPRESA', 'NOME_EMP', 'FORNEC', 'CLIENTE', 'PROPRIETARIO', 'NOME']
  ) || "NÃO IDENTIFICADO";

  const isConferido = isSelectableMode ? isSelected : !!asset._conferido;

  return (
    <div 
      onClick={() => onSelect(asset)} 
      className={`flex flex-col p-5 border-b border-gray-100 transition-all active:bg-gray-50 group mb-2
        ${isConferido ? 'bg-emerald-50/40' : 'bg-white'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border-2 transition-all
            ${isConferido ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
            <span className="text-[8px] font-black uppercase opacity-60 tracking-tighter leading-none whitespace-nowrap">Nº ATIVO</span>
            <span className="text-[15px] font-black tracking-tighter leading-none">{plaqueta}</span>
          </div>
          {asset.TAG_ADOCAO === "ADOTADO" && (
            <span className="text-[7px] font-black bg-blue-600 text-white px-2 py-1 rounded-lg uppercase tracking-[0.2em]">ADOTADO</span>
          )}
        </div>
        <button 
          ref={buttonRef}
          onClick={(e) => onToggle(e, asset)} 
          className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-all shadow-sm active:scale-90 focus:ring-4 focus:ring-blue-500 focus:outline-none focus:scale-110
            ${isConferido 
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 ring-2 ring-emerald-400' 
              : 'bg-gray-50 text-gray-200 border border-gray-200 hover:border-blue-400 hover:text-blue-500 focus:bg-blue-600 focus:text-white'}`}
        >
          {isSelectableMode ? (
            isConferido ? <CheckSquare size={24} strokeWidth={3} /> : <Square size={24} strokeWidth={2.5} />
          ) : (
            <Check size={26} strokeWidth={4} />
          )}
        </button>
      </div>

      <h3 className={`text-[13px] font-black uppercase leading-snug tracking-tight mb-4 px-1
        ${isConferido ? 'text-emerald-950' : 'text-gray-900'}`}>
        {desc}
      </h3>

      <div className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden shadow-sm
        ${isConferido ? 'bg-emerald-100/30 border-emerald-200/40' : 'bg-slate-50 border-slate-200/60'}`}>
        <div className="grid grid-cols-3 divide-x divide-gray-200/50 border-b border-gray-200/40">
          <div className="p-3 flex flex-col items-center">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1">Qtd</span>
            <span className={`text-[11px] font-mono font-black ${isConferido ? 'text-emerald-800' : 'text-slate-700'}`}>{qtde}</span>
          </div>
          <div className="p-3 flex flex-col items-center">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1">Registro</span>
            <span className={`text-[11px] font-mono font-black ${isConferido ? 'text-emerald-800' : 'text-slate-700'}`}>{registro}</span>
          </div>
          <div className="p-3 flex flex-col items-center">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1">S_Item</span>
            <span className={`text-[11px] font-mono font-black ${isConferido ? 'text-emerald-800' : 'text-slate-700'}`}>{sItem}</span>
          </div>
        </div>
        <div className={`p-3 flex items-center justify-between px-5 ${isConferido ? 'bg-emerald-500/5' : 'bg-white/40'}`}>
          <div className="flex items-center space-x-2">
            <Calendar size={12} className={isConferido ? 'text-emerald-500' : 'text-slate-400'} />
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Aquisição</span>
          </div>
          <span className={`text-[11px] font-black ${isConferido ? 'text-emerald-900' : 'text-slate-800'}`}>{dtAq}</span>
        </div>
        <div className={`p-4 border-t border-gray-200/40 flex items-start space-x-3
          ${isConferido ? 'bg-emerald-600/10' : 'bg-blue-600/5'}`}>
          <Building2 size={14} className={isConferido ? 'text-emerald-600 shrink-0 mt-0.5' : 'text-blue-500 shrink-0 mt-0.5'} />
          <div className="min-w-0 flex-1">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-1">Razão Social / Identificação</span>
            <span className={`text-[11px] font-black uppercase tracking-tight leading-snug block break-words
              ${isConferido ? 'text-emerald-950' : 'text-blue-950'}`}>{razao}</span>
          </div>
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
  assets, 
  allAssets, 
  onBack, 
  onUpdateAsset, 
  onBulkUpdateAssets,
  onSelectAsset, 
  selectedLocation, 
  setSelectedLocation, 
  isInventorying, 
  setIsInventorying 
}) => {
  const [assetSearch, setAssetSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [selectedInBatch, setSelectedInBatch] = useState<Set<string>>(new Set());
  const [conflictAsset, setConflictAsset] = useState<Asset | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstMatchButtonRef = useRef<HTMLButtonElement | null>(null);
  
  const locationTerms = useMemo(() => ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'LOCALIZAÇÃO'], []);
  const plaquetaTerms = useMemo(() => ['PLAQUETA', 'PATRIMONIO', 'BEM', 'TAG', 'PATRIMÔNIO', 'ETIQUETA'], []);
  const descTerms = useMemo(() => ['DESC_SINTETICA', 'DESC SINTETICA', 'SINTETICA', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_ITEM', 'NOME', 'ITEM'], []);

  useEffect(() => {
    if (isInventorying) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isInventorying, selectedLocation]);

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

  const allLocations = useMemo(() => Object.keys(locationStats).sort(), [locationStats]);

  const filteredAssetsInLocation = useMemo(() => {
    if (!selectedLocation) return [];

    let rawResults: Asset[] = [];

    if (assetSearch.length > 0) {
      rawResults = allAssets.filter(asset => {
        const pKey = Object.keys(asset).find(k => plaquetaTerms.includes(k.toUpperCase()));
        if (!pKey) return false;
        
        const pVal = String(asset[pKey]).toUpperCase().trim();
        const sVal = assetSearch.toUpperCase().trim();
        
        return pVal === sVal || 
               pVal.padStart(6, '0') === sVal.padStart(6, '0') ||
               pVal.includes(sVal);
      }).filter(asset => {
        if (activeFilter === 'pending' && asset._conferido) return false;
        if (activeFilter === 'checked' && !asset._conferido) return false;
        return true;
      });
    } else {
      rawResults = assets.filter(asset => {
        const loc = getItemLocation(asset);
        if (loc !== selectedLocation && asset.TAG_ADOCAO !== "ADOTADO") return false;
        
        if (activeFilter === 'pending' && asset._conferido) return false;
        if (activeFilter === 'checked' && !asset._conferido) return false;
        
        return true;
      });
    }

    // Ordenação Numérica Estrita por Plaqueta
    return rawResults.sort((a, b) => {
      const getP = (item: Asset) => {
        const pk = Object.keys(item).find(k => plaquetaTerms.includes(k.toUpperCase()));
        return pk ? String(item[pk]) : "";
      };
      return getP(a).localeCompare(getP(b), undefined, { numeric: true });
    });
  }, [assets, allAssets, selectedLocation, assetSearch, activeFilter, getItemLocation, plaquetaTerms]);

  const isBatchMode = assetSearch.length === 6 && filteredAssetsInLocation.length > 1;

  const resetSearchAndFocus = useCallback(() => {
    setAssetSearch('');
    setSelectedInBatch(new Set());
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }, []);

  const handleAssetSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Máscara 000000 com Shift Left
    const rawValue = e.target.value.replace(/\D/g, ''); 
    if (rawValue === '') {
      setAssetSearch('');
    } else {
      const padded = rawValue.slice(-6).padStart(6, '0');
      setAssetSearch(padded);
    }
    setSelectedInBatch(new Set()); 
  };

  const processToggleUpdate = (asset: Asset) => {
    const updated = { ...asset, _conferido: !asset._conferido };
    if (updated._conferido && getItemLocation(asset) !== selectedLocation) {
       const locKey = Object.keys(updated).find(k => locationTerms.includes(k.toUpperCase())) || 'LOCALIZACAO';
       updated[locKey] = selectedLocation?.toUpperCase();
       updated.TAG_ADOCAO = "ADOTADO";
    }
    onUpdateAsset(updated);
    resetSearchAndFocus();
  };

  const handleToggle = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    if (isBatchMode) {
      setSelectedInBatch(prev => {
        const next = new Set(prev);
        if (next.has(String(asset.id))) next.delete(String(asset.id));
        else next.add(String(asset.id));
        return next;
      });
      return;
    }
    if (asset._conferido) {
      setConflictAsset(asset);
      return;
    }
    processToggleUpdate(asset);
  }, [onUpdateAsset, selectedLocation, locationTerms, getItemLocation, assetSearch, isBatchMode, processToggleUpdate]);

  const handleConfirmBatch = () => {
    if (selectedInBatch.size > 0) {
      onBulkUpdateAssets(Array.from(selectedInBatch));
    }
    resetSearchAndFocus();
  };

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn">
        <div className="p-6 pb-2">
          <button onClick={onBack} className="mb-4 text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1">
            <ArrowLeft size={10} /> <span>Menu Principal</span>
          </button>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-black uppercase tracking-tight">Setores Operacionais</h2>
          </div>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input 
              type="text" 
              placeholder="PESQUISAR SETOR..." 
              value={locationSearch} 
              onChange={(e) => setLocationSearch(e.target.value.toUpperCase())} 
              className="w-full pl-10 pr-4 py-3.5 bg-gray-50 rounded-2xl text-[10px] font-black uppercase outline-none border-2 border-transparent focus:border-blue-100 transition-all shadow-inner" 
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10 space-y-4">
          {allLocations.filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
            const isStarted = stats.checked > 0;
            const isDone = percent === 100;

            return (
              <button 
                key={loc} 
                disabled={isDone}
                onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} 
                className={`w-full flex items-center justify-between p-6 rounded-[2.2rem] border transition-all relative overflow-hidden active:scale-[0.98] 
                  ${isDone ? 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed' : 
                    isStarted ? 'bg-gray-900 border-gray-800 shadow-xl' : 'bg-white border-gray-100 shadow-sm'}`}
              >
                <div className="flex items-center space-x-4 min-w-0 pr-4 text-left relative z-10">
                  <div className={`p-3 rounded-2xl ${isDone ? 'bg-emerald-100 text-emerald-600' : isStarted ? 'bg-white/10 text-blue-400' : 'bg-gray-50 text-gray-400'}`}>
                    {isDone ? <Lock size={20} /> : <MapPin size={20} />}
                  </div>
                  <div className="min-w-0">
                    <span className={`text-[13px] font-black uppercase truncate block ${isStarted ? 'text-white' : 'text-gray-900'}`}>{loc}</span>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{stats.checked}/{stats.total} ITENS</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end relative z-10">
                  {isDone ? (
                    <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20">
                      <span className="text-[10px] font-black">100%</span>
                      <CheckCheck size={12} strokeWidth={4} />
                    </div>
                  ) : (
                    <span className={`text-[11px] font-black ${isStarted ? 'text-blue-400' : 'text-blue-600'}`}>{percent}%</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative">
      <div className="p-6 pb-2 shadow-sm relative z-10 bg-white">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); setAssetSearch(''); }} className="text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1">
            <ArrowLeft size={10} /> <span>Trocar Setor</span>
          </button>
          <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
             <MapPin size={10} className="text-blue-600" />
             <span className="text-[9px] font-black text-blue-900 uppercase truncate max-w-[150px]">{selectedLocation}</span>
          </div>
        </div>
        <div className="relative mb-5" onClick={() => searchInputRef.current?.focus()}>
          <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col items-start pointer-events-none">
             <span className="text-[7px] font-black text-blue-300 uppercase leading-none">Nº ATIVO</span>
             <span className="text-[6px] font-black text-blue-200 uppercase mt-0.5 tracking-tighter">LEITURA</span>
          </div>
          <input 
            ref={searchInputRef} type="text" inputMode="numeric" placeholder="000000" 
            value={assetSearch} onChange={handleAssetSearchChange} 
            className="w-full pl-20 pr-12 py-7 text-4xl font-black uppercase outline-none border-2 border-blue-100 bg-blue-50/20 rounded-[2.2rem] focus:border-blue-500 focus:bg-white transition-all tracking-tighter text-blue-950 placeholder:text-blue-100/50 shadow-inner" 
          />
          {assetSearch && <button onClick={(e) => { e.stopPropagation(); setAssetSearch(''); }} className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-200"><X size={28} /></button>}
        </div>

        <div className="flex space-x-6 px-2">
          <button onClick={() => setActiveFilter('pending')} className={`flex-1 flex flex-col items-center pb-3 border-b-2 transition-all ${activeFilter === 'pending' ? 'border-blue-600 text-blue-900' : 'border-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest">Pendentes ({locationStats[selectedLocation!] ? locationStats[selectedLocation!].total - locationStats[selectedLocation!].checked : 0})</span>
          </button>
          <button onClick={() => setActiveFilter('checked')} className={`flex-1 flex flex-col items-center pb-3 border-b-2 transition-all ${activeFilter === 'checked' ? 'border-emerald-600 text-emerald-900' : 'border-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest">Conferidos ({locationStats[selectedLocation!]?.checked || 0})</span>
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 no-scrollbar pb-40">
        {filteredAssetsInLocation.length > 0 ? (
          <div className="mt-4 space-y-4">
            {filteredAssetsInLocation.map((asset, index) => (
              <AssetCard 
                key={asset.id} 
                asset={asset} 
                onSelect={onSelectAsset} 
                onToggle={handleToggle} 
                plaquetaTerms={plaquetaTerms} 
                descTerms={descTerms} 
                isSelectableMode={isBatchMode}
                isSelected={selectedInBatch.has(String(asset.id))}
                buttonRef={index === 0 ? firstMatchButtonRef : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center flex flex-col items-center">
            {assetSearch ? (
               <>
                 <AlertCircle size={40} className="text-gray-100 mb-4" />
                 <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-relaxed px-10">
                    O item {assetSearch} não consta nesta lista de {activeFilter === 'pending' ? 'PENDENTES' : 'CONFERIDOS'}
                 </p>
                 <button 
                  onClick={() => setActiveFilter(activeFilter === 'pending' ? 'checked' : 'pending')}
                  className="mt-6 text-[9px] font-black text-blue-600 uppercase border-b border-blue-600 pb-1"
                 >
                    Alternar para {activeFilter === 'pending' ? 'CONFERIDOS' : 'PENDENTES'}
                 </button>
               </>
            ) : (
               <>
                 <CheckCheck size={40} className="text-emerald-50 mb-4" />
                 <p className="text-[10px] font-black text-gray-200 uppercase tracking-[0.3em]">
                    {activeFilter === 'pending' ? 'Área Limpa' : 'Nada conferido ainda'}
                 </p>
               </>
            )}
          </div>
        )}
      </div>

      {isBatchMode && (
        <div className="absolute bottom-6 left-6 right-6 flex flex-col space-y-3 z-30">
          <button 
            onClick={handleConfirmBatch}
            disabled={selectedInBatch.size === 0}
            className={`w-full py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center space-x-3
              ${selectedInBatch.size > 0 ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed grayscale'}`}
          >
             <CheckCheck size={20} strokeWidth={3} />
             <span>Confirmar Seleção ({selectedInBatch.size})</span>
          </button>
        </div>
      )}

      {conflictAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-bounceIn overflow-hidden">
            <div className="flex items-center space-x-3 mb-6">
               <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                  <AlertTriangle size={28} />
               </div>
               <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter leading-none">Aviso de Registro</h3>
                  <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mt-1">Item já inventariado anteriormente</p>
               </div>
            </div>

            <div className="bg-gray-50 rounded-3xl p-5 border border-gray-100 space-y-4 mb-8">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                 <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Local Registrado</span>
                 <div className="flex items-center space-x-1.5 text-blue-600">
                    <MapPin size={10} />
                    <span className="text-[10px] font-black uppercase truncate max-w-[140px]">{getItemLocation(conflictAsset)}</span>
                 </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-2xl flex items-start space-x-2">
                  <RefreshCw size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[9px] font-bold text-amber-700 uppercase leading-relaxed">Deseja re-registrar no local atual ({selectedLocation})?</p>
              </div>
            </div>

            <div className="space-y-3">
               <button 
                onClick={() => { processToggleUpdate(conflictAsset); setConflictAsset(null); }}
                className="w-full py-5 bg-emerald-600 text-white rounded-[1.8rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center space-x-2"
               >
                 <CheckCheck size={18} />
                 <span>Sim, Registrar Aqui</span>
               </button>
               <button 
                onClick={() => { setConflictAsset(null); resetSearchAndFocus(); }}
                className="w-full py-4 bg-gray-100 text-gray-500 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
               >
                 Manter Original
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
