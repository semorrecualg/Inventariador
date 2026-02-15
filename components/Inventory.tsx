
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ArrowLeft, 
  MapPin, 
  AlertCircle,
  Save,
  Check,
  X,
  PlusCircle,
  FilePlus,
  Keyboard,
  Zap,
  Plus,
  ArrowRightLeft,
  ShieldAlert,
  Info,
  History,
  Activity
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
  
  const normalizeStr = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').trim();

  const formatBRDate = (val: string) => {
    if (!val || val === "---" || val.trim() === "") return "---";
    const raw = val.trim();
    try {
      let date: Date;
      if (/^\d+$/.test(raw)) {
        const serial = Number(raw);
        if (serial > 0 && serial < 100000) {
          date = new Date(Math.round((serial - 25569) * 86400 * 1000));
        } else { return val; }
      } else {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
        date = new Date(raw);
      }
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const finalYear = date.getFullYear();
        if (finalYear < 1900 || finalYear > 2100) return val;
        return `${day}/${month}/${finalYear}`;
      }
    } catch (e) { return val; }
    return val;
  };

  const getVal = (terms: string[]) => {
    const normTerms = terms.map(t => normalizeStr(t));
    for (const term of normTerms) {
       const foundKey = Object.keys(asset).find(k => normalizeStr(k) === term);
       if (foundKey && asset[foundKey] !== undefined && asset[foundKey] !== null && String(asset[foundKey]).trim() !== "") {
           return String(asset[foundKey]).trim().toUpperCase();
       }
    }
    return "---";
  };

  const data = {
    etiqueta: getVal(['ETIQUETA', 'PLAQUETA', 'PATRIMONIO', 'TAG', 'BEM']),
    empresa: getVal(['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE']),
    status: asset.TAG_INVENTARIO || 'PENDENTE',
    registro: getVal(['REGISTRO', 'COD_ITEM', 'ID_ATIVO']),
    sub_registro: getVal(['SUB_REGISTRO', 'SUB', 'PARCELA']),
    qtde: getVal(['QTDE', 'QUANTIDADE', 'QTD']),
    local: getVal(['LOCAL', 'ENDERECO', 'LOCALIZACAO', 'SETOR']),
    centro_custo: getVal(['CENTRO_CUSTO', 'CENTRO_DE_CUSTO', 'CC', 'DEPARTAMENTO']),
    cnpj: getVal(['CNPJ', 'CPF_CNPJ']),
    fornecedor: getVal(['FORNECEDOR', 'NOME_FORNECEDOR']),
    conta: getVal(['CONTA_CONTABIL', 'CONTA', 'DESC_CONTA']),
    data_compra: formatBRDate(getVal(['DATA_COMPRA', 'DT_AQUISICAO', 'AQUISICAO'])),
    data_baixa: formatBRDate(getVal(['DATA_BAIXA', 'DT_BAIXA'])),
    descricao: getVal(['DESCRICAO_DO_ATIVO_IMOBILIZADO', 'DESCRIÇÃO_DO_ATIVO_IMOBILIZADO', 'DESCRICAO', 'DESCRIÇÃO', 'DESC_SINTETICA', 'NOME'])
  };

  const isBaixado = data.data_baixa !== "---" && data.data_baixa.trim() !== "";
  const isConferido = !!asset._conferido;
  const isAdopted = asset.TAG_ADOCAO === "ADOTADO" || asset.TAG_INVENTARIO === "ADOTADO";
  const isReAdopted = asset.TAG_ADOCAO === "RE-ADOTADO" || asset.TAG_INVENTARIO === "RE-ADOTADO NO INVENTARIO";
  const isAdoptionCase = !isConferido && data.local !== currentLocation && data.local !== "---" && currentLocation !== "" && !isBaixado;

  const getStatusColor = () => {
    if (isBaixado) return 'bg-fuchsia-900';
    if (data.status === 'INVENTARIADO' || data.status === 'CONFERIDO') return 'bg-emerald-600';
    if (isAdopted || isReAdopted) return 'bg-cyan-600';
    if (data.status === 'INCLUSAO') return 'bg-purple-600';
    return 'bg-red-500';
  };

  const DataRow = ({ label, value, full = false }: { label: string, value: string, full?: boolean }) => (
    <div className={`flex flex-col border-b py-2 ${full ? 'col-span-2' : 'col-span-1'} ${isBaixado ? 'border-fuchsia-400/20' : 'border-gray-50'}`}>
      <span className={`text-[7px] font-black uppercase tracking-widest leading-none mb-1 ${isBaixado ? 'text-fuchsia-200' : 'text-slate-400'}`}>
        {label}
      </span>
      <span className={`text-[10px] font-bold uppercase truncate leading-tight ${isBaixado ? 'text-white' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  );

  return (
    <div 
      onDoubleClick={() => onSelect(asset)}
      className={`flex flex-col mb-4 rounded-[1.5rem] border shadow-md overflow-hidden transition-all active:scale-[0.98] w-full relative group
        ${decision === 'YES' ? 'border-emerald-500 ring-4 ring-emerald-50' : 
          isBaixado ? 'border-fuchsia-900 bg-fuchsia-700 ring-4 ring-fuchsia-100' :
          isAdoptionCase ? 'border-orange-400 bg-amber-50 ring-4 ring-orange-100' : 'border-slate-100 bg-white'}`}
    >
      {/* Alerta de Baixa - Visual Disruptivo */}
      {isBaixado && (
        <div className="bg-yellow-400 text-fuchsia-950 text-[9px] font-black uppercase tracking-[0.3em] py-2 px-4 text-center z-10 flex items-center justify-center space-x-2 shadow-lg">
          <ShieldAlert size={14} fill="currentColor" />
          <span>ALERTA CRÍTICO: ATIVO BAIXADO / RETIRADO</span>
        </div>
      )}

      {/* Alerta de Adoção - Visual Amber */}
      {isAdoptionCase && (
        <div className="bg-orange-500 text-white text-[8px] font-black uppercase tracking-[0.2em] py-1.5 px-4 text-center z-10 flex items-center justify-center space-x-2">
          <ArrowRightLeft size={12} />
          <span>ADOTAÇÃO: LOCAL ORIGINAL DIVERGENTE</span>
        </div>
      )}

      {/* Header Técnico */}
      <div className={`px-5 pb-4 flex items-center justify-between border-b ${isBaixado ? 'pt-6 border-fuchsia-600 bg-fuchsia-800/50' : isAdoptionCase ? 'pt-6 border-slate-100 bg-amber-100/30' : 'pt-4 bg-slate-50/80 border-slate-100'}`}>
        <div className="flex flex-col">
          <div className="flex items-center space-x-1 mb-1">
             <div className={`w-1.5 h-1.5 rounded-full ${isBaixado ? 'bg-yellow-400 animate-pulse' : isConferido ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
             <span className={`text-[8px] font-black uppercase tracking-widest ${isBaixado ? 'text-fuchsia-200' : 'text-slate-400'}`}>IDENTIFICAÇÃO PATRIMONIAL</span>
          </div>
          <span className={`text-3xl font-black tracking-tighter leading-none font-mono ${isBaixado ? 'text-yellow-300' : 'text-blue-950'}`}>{data.etiqueta}</span>
        </div>
        
        <div className="flex items-center space-x-2">
           {(!isConferido || (data.local !== currentLocation && !isConferidoTab)) && (
            <div className="flex items-center space-x-2">
              <button 
                onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'NO'); }} 
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 shadow-sm transition-all active:scale-90 ${isBaixado ? 'bg-fuchsia-900 text-fuchsia-200 border-fuchsia-500' : 'bg-white text-slate-300 border-slate-200 hover:border-red-200 hover:text-red-500'}`}
              >
                <X size={24} />
              </button>
              <button 
                ref={yesButtonRef}
                onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
                className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center shadow-2xl active:scale-95 transition-all
                  ${isBaixado ? 'bg-yellow-400 text-fuchsia-900' : isAdoptionCase ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'}`}
              >
                <Check size={36} strokeWidth={4} />
              </button>
            </div>
          )}
          {isConferido && <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-4 border-white ${getStatusColor()}`}><Check size={28} strokeWidth={4} /></div>}
        </div>
      </div>

      {/* Descrição em Bloco de Destaque */}
      <div className={`px-5 py-4 border-b ${isBaixado ? 'bg-fuchsia-800/30 border-fuchsia-600' : 'bg-white border-slate-50'}`}>
        <span className={`text-[7px] font-black uppercase tracking-[0.2em] leading-none mb-2 block opacity-60 ${isBaixado ? 'text-fuchsia-200' : 'text-slate-400'}`}>DESCRIÇÃO TÉCNICA DO BEM</span>
        <span className={`text-[12px] font-extrabold uppercase leading-relaxed line-clamp-3 ${isBaixado ? 'text-white' : 'text-slate-900'}`}>
          {data.descricao}
        </span>
      </div>

      {/* Grid de Dados de Governança */}
      <div className={`px-5 py-5 grid grid-cols-2 gap-x-6 gap-y-2 ${isBaixado ? 'bg-fuchsia-800/20' : isAdoptionCase ? 'bg-amber-100/20' : 'bg-white'}`}>
        <DataRow label="UNIDADE OPERACIONAL" value={data.empresa} />
        <div className="flex flex-col border-b py-2 border-transparent">
          <span className={`text-[7px] font-black uppercase tracking-widest leading-none mb-1 ${isBaixado ? 'text-fuchsia-300' : 'text-slate-400'}`}>ESTADO DE GOVERNANÇA</span>
          <span className={`text-[8px] font-black text-white px-3 py-1 rounded-md inline-block self-start uppercase shadow-sm ${getStatusColor()}`}>
            {isBaixado ? 'ATIVO BAIXADO/DISPONÍVEL' : isAdoptionCase ? 'ADOTAÇÃO' : data.status}
          </span>
        </div>
        
        <DataRow label="CÓD. REGISTRO" value={data.registro} />
        <DataRow label="DATA DE AQUISIÇÃO" value={data.data_compra} />
        
        <div className={`flex flex-col border-b py-2 ${isAdoptionCase ? 'bg-orange-500/10 p-2 rounded-xl border-orange-500/20' : isBaixado ? 'border-fuchsia-400/20' : 'border-gray-50'}`}>
          <span className={`text-[7px] font-black uppercase tracking-widest leading-none mb-1 ${isBaixado ? 'text-fuchsia-300' : isAdoptionCase ? 'text-orange-600' : 'text-slate-400'}`}>
             {isAdoptionCase ? 'LOCALIZAÇÃO ORIGINAL' : 'ENDEREÇO PATRIMONIAL'}
          </span>
          <div className="flex items-center space-x-1">
             {isAdoptionCase && <History size={10} className="text-orange-600" />}
             <span className={`text-[10px] font-black uppercase truncate leading-tight ${isBaixado ? 'text-white' : isAdoptionCase ? 'text-orange-700' : 'text-slate-900'}`}>
               {data.local}
             </span>
          </div>
        </div>

        <div className="flex flex-col border-b py-2 border-gray-50">
           <span className={`text-[7px] font-black uppercase tracking-widest leading-none mb-1 ${isBaixado ? 'text-fuchsia-300' : 'text-slate-400'}`}>QUANTIDADE</span>
           <div className="flex items-center space-x-1">
              <Activity size={10} className={isBaixado ? 'text-fuchsia-300' : 'text-blue-500'} />
              <span className={`text-[10px] font-black ${isBaixado ? 'text-white' : 'text-slate-900'}`}>{data.qtde} UN</span>
           </div>
        </div>
        
        <DataRow label="CENTRO DE CUSTO" value={data.centro_custo} />
        <DataRow label="CONTA CONTÁBIL" value={data.conta} />
        
        <DataRow label="FORNECEDOR ORIGEM" value={data.fornecedor} full />
        
        {isBaixado && (
           <div className="col-span-2 mt-2 p-3 bg-fuchsia-950/40 rounded-xl border border-fuchsia-500/30">
              <span className="text-[7px] font-black text-fuchsia-300 uppercase block mb-1">MOTIVO DA BAIXA/DATA</span>
              <span className="text-[10px] font-black text-yellow-400 uppercase">{data.data_baixa} - RETIRADA CONTÁBIL</span>
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
  const [newLocationName, setNewLocationName] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstYesButtonRef = useRef<HTMLButtonElement>(null);

  const plaquetaTerms = ['ETIQUETA', 'PLAQUETA', 'PATRIMONIO', 'BEM', 'TAG', 'REGISTRO'];

  const getPlaqueta = useCallback((asset: Asset): string => {
    const key = Object.keys(asset).find(k => plaquetaTerms.includes(k.toUpperCase()));
    return key ? String(asset[key]).trim() : "";
  }, []);

  const getItemLocation = useCallback((asset: Asset): string => {
    const locationTerms = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END', 'LOCAL'];
    const keys = Object.keys(asset);
    for (const term of locationTerms) {
      const match = keys.find(k => k.toUpperCase() === term.toUpperCase());
      if (match && asset[match]) return String(asset[match]).trim().toUpperCase();
    }
    return "SEM ENDEREÇO";
  }, []);

  const isBaixado = useCallback((asset: Asset): boolean => {
    const val = String(asset['DATA_BAIXA'] || asset['DT_BAIXA'] || '').trim();
    return val !== "" && val !== "---";
  }, []);

  const locationStats = useMemo(() => {
    const stats: Record<string, { total: number, checked: number }> = {};
    assets.forEach(asset => {
      if (isBaixado(asset)) return;
      const loc = getItemLocation(asset);
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++;
      if (asset._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets, getItemLocation, isBaixado]);

  const filteredAssetsInLocation = useMemo(() => {
    if (!selectedLocation) return [];
    const currentLoc = selectedLocation.toUpperCase();
    
    let results: Asset[] = [];
    if (committedSearch) {
      const term = committedSearch.toUpperCase().trim();
      results = assets.filter(a => {
          const p = getPlaqueta(a).toUpperCase();
          return p === term || p.padStart(6, '0') === term.padStart(6, '0');
      });
    } else {
      results = assets.filter(a => getItemLocation(a) === currentLoc && !isBaixado(a));
    }

    return results
      .filter(a => {
          if (activeFilter === 'checked') {
            return !!a._conferido && (getItemLocation(a) === currentLoc || isBaixado(a));
          }
          return !a._conferido || (!!a._conferido && getItemLocation(a) !== currentLoc);
      })
      .sort((a, b) => {
          if (committedSearch && isBaixado(a) && !isBaixado(b)) return -1;
          if (committedSearch && !isBaixado(a) && isBaixado(b)) return 1;
          return getPlaqueta(a).localeCompare(getPlaqueta(b), undefined, { numeric: true });
      });
  }, [assets, selectedLocation, committedSearch, activeFilter, getItemLocation, getPlaqueta, isBaixado]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    setLocalDecisions({});
    searchInputRef.current?.blur();
  };

  const resetSearchAndFocus = useCallback(() => {
    setDisplayValue('000000'); setCommittedSearch(''); setLocalDecisions({});
    setShowNewAssetDialog(false); setIsCreatingNewAsset(false);
    if (inputMethod === 'scanner') setIsScannerOpen(true);
    else setTimeout(() => { searchInputRef.current?.focus(); }, 150);
  }, [inputMethod]);

  const handleMakeDecision = useCallback((id: string, decision: 'YES' | 'NO') => {
    const asset = filteredAssetsInLocation.find(a => String(a.id) === id);
    if (!asset) return;

    const itemPlaqueta = getPlaqueta(asset);
    const siblings = filteredAssetsInLocation.filter(a => getPlaqueta(a) === itemPlaqueta);

    if (decision === 'YES') {
        if (siblings.length > 1) {
            setLocalDecisions(prev => {
                const next = { ...prev };
                siblings.forEach(s => { next[String(s.id)] = 'YES'; });
                return next;
            });
        } else {
            onBulkUpdateAssets([id]);
            resetSearchAndFocus();
        }
    } else {
        setLocalDecisions(prev => ({ ...prev, [id]: 'NO' }));
    }
  }, [filteredAssetsInLocation, onBulkUpdateAssets, resetSearchAndFocus, getPlaqueta]);

  const showBatchButton = useMemo(() => {
    const yesCount = Object.values(localDecisions).filter(d => d === 'YES').length;
    return yesCount > 1;
  }, [localDecisions]);

  const handleAddNewLocation = () => {
    if (!newLocationName.trim()) return;
    const name = newLocationName.toUpperCase().trim();
    setSelectedLocation(name);
    setIsInventorying(true);
    setNewLocationName('');
  };

  useEffect(() => {
    if (committedSearch && filteredAssetsInLocation.length > 0) {
      setTimeout(() => firstYesButtonRef.current?.focus(), 300);
    } else if (committedSearch && filteredAssetsInLocation.length === 0) {
      const exists = assets.some(a => {
        const p = getPlaqueta(a).toUpperCase();
        return p === committedSearch || p.padStart(6, '0') === committedSearch.padStart(6, '0');
      });
      if (!exists && committedSearch !== "") setShowNewAssetDialog(true);
    }
  }, [committedSearch, filteredAssetsInLocation.length, assets, getPlaqueta]);

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-slate-50 animate-fadeIn w-full overflow-hidden">
        <div className="p-6 bg-white border-b border-gray-100 shadow-sm">
          <button onClick={onBack} className="mb-4 text-gray-400 text-[10px] font-black uppercase flex items-center space-x-2"><ArrowLeft size={16} /> <span>Voltar ao Menu</span></button>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">Setores do Inventário</h2>
          
          <div className="flex space-x-3 mb-6 items-center">
            <div className="flex-1 relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={18} />
              <input 
                type="text" 
                placeholder="NOME DO NOVO SETOR..." 
                value={newLocationName} 
                onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewLocation()}
                className="w-full pl-12 pr-4 py-5 bg-blue-50/50 rounded-2xl text-[11px] font-black uppercase outline-none border-2 border-transparent focus:border-blue-200 shadow-inner placeholder:text-blue-300 transition-all" 
              />
            </div>
            <button 
              onClick={handleAddNewLocation}
              disabled={!newLocationName.trim()}
              className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-[2.2rem] flex items-center justify-center shadow-md active:scale-95 disabled:opacity-20 transition-all"
            >
              <Plus size={28} strokeWidth={4} />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="FILTRAR EXISTENTES..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value.toUpperCase())} className="w-full pl-11 pr-4 py-4 bg-gray-50 rounded-2xl text-[10px] font-black uppercase outline-none border border-gray-100" />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20 space-y-3 no-scrollbar">
          {Object.keys(locationStats).sort().filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full flex items-center justify-between p-5 rounded-[2rem] border transition-all ${percent === 100 ? 'bg-emerald-50 border-emerald-100 shadow-sm' : 'bg-white shadow-md border-transparent hover:border-blue-200'}`}>
                <div className="flex items-center space-x-4 text-left min-w-0">
                  <div className={`p-3 rounded-2xl shadow-inner ${percent === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-500'}`}><MapPin size={22} /></div>
                  <div className="min-w-0">
                    <span className="text-[14px] font-black uppercase truncate block text-slate-900 tracking-tight">{loc}</span>
                    <span className={`text-[8px] font-black uppercase mt-1 px-2 py-0.5 rounded-full inline-block ${percent === 100 ? 'bg-emerald-200/50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                       {stats.checked}/{stats.total} CONFERIDOS
                    </span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <span className={`text-[12px] font-black font-mono ${percent === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{percent}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn relative w-full overflow-hidden">
      <div className={`p-5 pb-3 shadow-lg relative z-30 transition-colors ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50'}`}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); resetSearchAndFocus(); }} className="text-gray-400 text-[10px] font-black uppercase flex items-center space-x-2"><ArrowLeft size={14} /> <span>Setor: {selectedLocation}</span></button>
          <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 shadow-inner">
             <button onClick={() => setInputMethod('keyboard')} className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all ${inputMethod === 'keyboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><Keyboard size={14} /><span className="text-[9px] font-black uppercase">TECLADO</span></button>
             <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all ${inputMethod === 'scanner' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400'}`}><Zap size={14} /><span className="text-[9px] font-black uppercase">SCAN</span></button>
          </div>
        </div>
        
        <div className="relative mb-4 flex items-center w-full">
          <div className="flex-1 relative">
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
              className="w-full pl-6 pr-6 py-5 text-4xl font-black font-mono uppercase outline-none border-2 border-gray-100 bg-gray-50/30 rounded-[2rem] focus:border-blue-500 focus:bg-white transition-all text-blue-950 shadow-inner tracking-widest" 
            />
          </div>
          <button onClick={() => triggerSearch(displayValue)} className="ml-4 w-16 h-16 bg-blue-600 text-white rounded-[1.8rem] flex items-center justify-center shadow-2xl active:scale-95"><Search size={32} strokeWidth={4} /></button>
        </div>

        <div className="flex space-x-3">
          <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); }} className={`flex-1 py-4 rounded-2xl border-b-4 transition-all flex items-center justify-center space-x-2 ${activeFilter === 'pending' ? 'bg-white border-blue-600 text-blue-600 shadow-md' : 'text-gray-300 border-transparent opacity-50'}`}>
            <Info size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">PENDENTES</span>
          </button>
          <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); }} className={`flex-1 py-4 rounded-2xl border-b-4 transition-all flex items-center justify-center space-x-2 ${activeFilter === 'checked' ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-md' : 'text-gray-300 border-transparent opacity-50'}`}>
            <Check size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">CONFERIDOS</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-5 no-scrollbar pb-40 transition-colors ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50/10'}`}>
        {filteredAssetsInLocation.length > 0 ? (
          <div className="mt-6">
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
          <div className="py-24 text-center opacity-20 flex flex-col items-center">
            <AlertCircle size={64} className="mb-4 text-gray-200" />
            <p className="text-[12px] font-black uppercase tracking-[0.3em] text-gray-400">Setor em Conformidade</p>
          </div>
        )}
      </div>

      {showBatchButton && (
        <div className="fixed bottom-8 left-8 right-8 z-[60] animate-slideUp">
           <button onClick={() => { onBulkUpdateAssets(Object.entries(localDecisions).filter(([_, d]) => d === 'YES').map(([id]) => id)); resetSearchAndFocus(); }} className="w-full py-6 bg-emerald-600 text-white rounded-[2.2rem] font-black uppercase shadow-2xl flex items-center justify-center space-x-4 active:scale-95 border-2 border-emerald-400 ring-4 ring-emerald-50">
             <Save size={28} />
             <span>Gravar Conferência em Lote ({Object.entries(localDecisions).filter(([_, d]) => d === 'YES').length})</span>
           </button>
        </div>
      )}

      {showNewAssetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-[320px] rounded-[3rem] p-10 shadow-2xl text-center animate-bounceIn">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[1.8rem] flex items-center justify-center mx-auto mb-6 border border-red-100 shadow-inner"><AlertCircle size={40} /></div>
            <h3 className="text-2xl font-black text-gray-900 uppercase mb-3 tracking-tighter">Ativo Não Localizado</h3>
            <p className="text-[11px] font-bold text-gray-400 uppercase leading-relaxed mb-10">O identificador <span className="text-red-600 font-black font-mono">{committedSearch}</span> é inexistente na base master da unidade.</p>
            <div className="space-y-4">
              <button onClick={() => { setNewAssetData({ description: '', plaqueta: committedSearch }); setShowNewAssetDialog(false); setIsCreatingNewAsset(true); }} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] flex items-center justify-center space-x-3 shadow-xl shadow-blue-100 active:scale-95 transition-all"><PlusCircle size={20} /><span>Cadastrar Nova Ocorrência</span></button>
              <button onClick={resetSearchAndFocus} className="w-full py-4 text-gray-400 font-black uppercase text-[9px] tracking-[0.2em]">Retornar à Busca</button>
            </div>
          </div>
        </div>
      )}

      {isCreatingNewAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-white w-full max-w-[320px] rounded-[3rem] p-8 shadow-2xl relative overflow-hidden">
             <div className="flex items-center space-x-4 mb-6">
                <div className="w-14 h-14 bg-purple-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-lg"><FilePlus size={28} /></div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Inclusão Direta</h3>
                  <p className="text-[8px] font-black text-purple-600 uppercase tracking-widest leading-none">Novo Registro Patrimonial</p>
                </div>
             </div>
             <div className="space-y-5">
                <div className="px-6 py-4 bg-gray-50 rounded-2xl font-mono font-black text-blue-600 text-2xl border-2 border-dashed border-blue-200 text-center tracking-widest">{newAssetData.plaqueta}</div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-2">Memorial Descritivo do Ativo</label>
                  <textarea rows={4} placeholder="DESCREVA O BEM E SEU ESTADO DE CONSERVAÇÃO..." value={newAssetData.description} onChange={(e) => setNewAssetData({...newAssetData, description: e.target.value.toUpperCase()})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-purple-500 outline-none font-bold text-[11px] uppercase shadow-inner transition-all" />
                </div>
                <div className="flex space-x-3 pt-4">
                   <button onClick={resetSearchAndFocus} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[9px] tracking-widest">Cancelar</button>
                   <button onClick={() => { onUpdateAsset({ id: `new_${Date.now()}`, DESCRICAO_DO_ATIVO_IMOBILIZADO: newAssetData.description.toUpperCase(), PLAQUETA: newAssetData.plaqueta, EMPRESA: selectedCompany || "", _empresaNormalizada: (selectedCompany || "").toUpperCase().trim(), LOCALIZACAO: selectedLocation || "", _isNew: true, _conferido: true }); resetSearchAndFocus(); }} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-xl shadow-emerald-100 active:scale-95 transition-all">Salvar e Validar</button>
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
