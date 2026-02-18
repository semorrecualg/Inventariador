
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  ArrowLeft, 
  MapPin, 
  Check,
  Keyboard, 
  Zap, 
  Search, 
  XCircle, 
  ChevronRight,
  Globe,
  Info,
  Hash,
  LayoutGrid,
  Plus,
  Building2,
  X,
  Tag,
  AlertTriangle,
  Briefcase,
  CheckCircle,
  Filter,
  Calendar,
  Truck
} from 'lucide-react';

const VIRTUAL_LABEL_LOC = "BENS A SEREM ETIQUETADOS";

const parseAssetDate = (val: any): Date | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;

  if (!isNaN(Number(s)) && Number(s) > 10000) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  }
  
  const parts = s.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const formatMonthYearBR = (val: any): string => {
  const date = parseAssetDate(val);
  if (date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return String(val || '').toUpperCase();
};

interface AssetCardProps {
  asset: Asset;
  selectedLocation: string | null;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  isInventariadoTab: boolean;
}

const AssetCard = React.memo(({ 
  asset, selectedLocation, onSelect, onMakeDecision, isInventariadoTab 
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  const normalize = (s: string) => s.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim();
  
  const locAtual = normalize(selectedLocation || "");
  const locAuditado = normalize(asset._localMaster || asset.ENDERECO || "");
  const originAddr = (asset.ENDERECO || "").toUpperCase();
  const originCia = (asset.EMPRESA || "").toUpperCase();
  
  const isDivergent = locAuditado !== "" && locAtual !== "" && locAuditado !== locAtual && selectedLocation !== VIRTUAL_LABEL_LOC;
  const isBaixado = String(asset.STATUS || '').toUpperCase().includes('BAIXADO');
  const precisaEtiquetar = normalize(asset.ETIQUETA || '') === 'ETIQUETAR' || asset.TAG_INVENTARIO === 'FALTA ETIQUETAR';

  let visualStatus = asset.TAG_INVENTARIO || 'PENDENTE';
  
  if (precisaEtiquetar) {
    visualStatus = isConferido ? "ETIQUETADO" : "FALTA ETIQUETAR";
  } else if (isDivergent && !isInventariadoTab) {
    visualStatus = isConferido ? "RE-ADOTADO" : "ADOTADO";
  } else if (!isConferido) {
    if ((asset as any)._isExternal) visualStatus = "EXTERNO";
    else if (isBaixado) visualStatus = "BAIXADO";
    else visualStatus = "PENDENTE";
  }

  const formattedDescription = useMemo(() => {
    const qt = asset.QT || "";
    const desc = asset.DESCRICAODOATIVO || "";
    const serial = asset.SERIAL ? `SN:${asset.SERIAL}` : "";
    const datePart = asset.DATAAQUSIC ? `AQ:${formatMonthYearBR(asset.DATAAQUSIC)}` : "";
    const fornecedor = (asset.NOMEFORNECEDOR || "").substring(0, 15).toUpperCase();

    return [qt, desc, serial, datePart, fornecedor]
      .filter(val => val !== "" && val !== undefined && val !== null)
      .join(' ');
  }, [asset]);

  const getGoldenColors = () => {
    if (isBaixado) return { bg: 'bg-red-950/40', border: 'border-red-500/50', badge: 'bg-red-600 text-white', btn: 'bg-red-600 border-red-800' };
    if (visualStatus === "ETIQUETADO") return { bg: 'bg-violet-950/30', border: 'border-violet-500/50', badge: 'bg-violet-600 text-white font-black', btn: 'bg-violet-600 border-violet-800 text-white shadow-violet-900/20' };
    if (visualStatus === "FALTA ETIQUETAR") return { bg: 'bg-amber-950/30', border: 'border-amber-500/50', badge: 'bg-amber-600 text-white font-black', btn: 'bg-amber-600 border-amber-800 text-white' };
    
    switch (visualStatus) {
      case 'ADOTADO':
        return { bg: 'bg-lime-900/20', border: 'border-lime-500/50', badge: 'bg-lime-500 text-black font-black', btn: 'bg-lime-500 border-lime-700 text-black shadow-lime-900/20' };
      case 'RE-ADOTADO':
        return { bg: 'bg-sky-950/40', border: 'border-sky-400/60', badge: 'bg-sky-500 text-white font-black', btn: 'bg-sky-600 border-sky-800 shadow-sky-900/20' };
      case 'NOVO ITEM':
        return { bg: 'bg-cyan-950/40', border: 'border-cyan-500/50', badge: 'bg-cyan-500 text-white', btn: 'bg-cyan-600 border-cyan-800' };
      case 'CONFERIDO':
      case 'INVENTARIADO':
        return { bg: 'bg-emerald-950/30', border: 'border-emerald-500/40', badge: 'bg-emerald-600 text-white', btn: 'bg-emerald-600 border-emerald-800' };
      case 'EXTERNO':
        return { bg: 'bg-blue-950/40', border: 'border-blue-500/50', badge: 'bg-blue-600 text-white', btn: 'bg-blue-600 border-blue-800' };
      default:
        return { bg: 'bg-slate-900', border: 'border-slate-800', badge: 'bg-slate-800 text-white', btn: 'bg-sky-600 border-sky-800' };
    }
  };

  const colors = getGoldenColors();
  const showCheckAction = !isConferido || (isDivergent && !isInventariadoTab);

  return (
    <div className={`mb-4 p-0 border rounded-[2rem] transition-all duration-300 active:scale-[0.98] relative overflow-hidden ${colors.bg} ${colors.border}`} onClick={() => onSelect(asset)}>
      <div className={`absolute top-0 left-0 flex items-center h-9 px-5 rounded-tl-[1.8rem] rounded-br-[2rem] border-r border-b border-inherit shadow-xl z-10 ${colors.badge}`}>
         <div className="flex items-center space-x-2">
            <Hash size={12} strokeWidth={4} />
            <span className="font-mono text-[12px] font-black uppercase tracking-tight leading-none">{asset.ETIQUETA || 'S/ ETQ'}</span>
            <span className="mx-1 opacity-40">|</span>
            <span className="text-[9px] font-black uppercase tracking-widest">{visualStatus}</span>
         </div>
      </div>
      <div className="p-6 pt-14 pr-16 flex flex-col space-y-3">
        <p className="text-[11px] font-bold uppercase leading-tight italic text-slate-100 px-1 line-clamp-3 tracking-tight">
          {formattedDescription || 'SEM DADOS TÉCNICOS'}
        </p>
        {(isDivergent || selectedLocation === VIRTUAL_LABEL_LOC) && (
          <div className={`px-4 py-2 rounded-2xl border flex flex-col shadow-2xl animate-fadeIn w-full overflow-hidden ${visualStatus === 'RE-ADOTADO' ? 'bg-sky-900/60 border-sky-400 text-white' : (visualStatus === 'FALTA ETIQUETAR' ? 'bg-amber-600/20 border-amber-500 text-white' : (visualStatus === 'ETIQUETADO' ? 'bg-violet-600/20 border-violet-500 text-violet-100' : 'bg-lime-400 border-lime-600 text-black'))}`}>
             <div className="flex items-center space-x-2 mb-1 border-b border-black/10 pb-1 opacity-80 overflow-hidden">
                <Building2 size={10} strokeWidth={3} className="shrink-0" />
                <span className="text-[8px] font-black uppercase tracking-tighter truncate whitespace-nowrap">CIA: {originCia}</span>
             </div>
             <div className="flex items-center space-x-2 overflow-hidden">
                <MapPin size={10} strokeWidth={3} className="shrink-0" />
                <span className="text-[9px] font-black font-mono leading-none truncate uppercase italic whitespace-nowrap">LOCAL: {originAddr}</span>
             </div>
          </div>
        )}
      </div>
      {showCheckAction ? (
        <button 
          onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
          className={`absolute bottom-4 right-4 w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all shrink-0 border-b-4 z-20 ${colors.btn}`}
        >
          <Check size={28} strokeWidth={4} />
        </button>
      ) : (
         <div className="absolute bottom-4 right-4 w-10 h-10 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center justify-center z-10 border-b-4 border-emerald-700">
            <Check size={20} strokeWidth={4} />
         </div>
      )}
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
  uniqueEnderecos: string[];
  uniqueCentrosDeCusto: string[];
}

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany, uniqueEnderecos, uniqueCentrosDeCusto }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [batchTagFocus, setBatchTagFocus] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isNewLocModalOpen, setIsNewLocModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocCC, setNewLocCC] = useState('');
  
  // v24.41 PRO: Painel de Filtros Inteligentes
  const isEmplaquetarMode = selectedLocation === VIRTUAL_LABEL_LOC;
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(isEmplaquetarMode);
  
  const [advDesc, setAdvDesc] = useState('');
  const [advCC, setAdvCC] = useState('');
  const [advSupplier, setAdvSupplier] = useState('');
  const [advDateStart, setAdvDateStart] = useState('');
  const [advDateEnd, setAdvDateEnd] = useState('');
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizeKey = (s: string) => s.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim();

  const suppliersList = useMemo(() => {
    const set = new Set<string>();
    assets.forEach(a => { if (a.NOMEFORNECEDOR) set.add(String(a.NOMEFORNECEDOR).toUpperCase().trim()); });
    return Array.from(set).sort();
  }, [assets]);

  const filteredAndSortedAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKey(batchTagFocus || committedSearch);
    const currentLocKey = normalizeKey(selectedLocation);

    let baseList = assets;

    if (isEmplaquetarMode) {
      // v24.41: Filtragem exclusiva para itens sem etiqueta ou marcados como falta etiquetar
      baseList = assets.filter(a => 
        normalizeKey(a.ETIQUETA || '') === 'ETIQUETAR' || 
        a.TAG_INVENTARIO === 'FALTA ETIQUETAR'
      );
      
      // Aplicar filtros inteligentes
      if (advDesc) baseList = baseList.filter(a => String(a.DESCRICAODOATIVO || '').toUpperCase().includes(advDesc.toUpperCase()));
      if (advCC) baseList = baseList.filter(a => normalizeKey(String(a.CENTRODECUSTO || '')) === normalizeKey(advCC));
      if (advSupplier) baseList = baseList.filter(a => normalizeKey(String(a.NOMEFORNECEDOR || '')) === normalizeKey(advSupplier));
      if (advDateStart || advDateEnd) {
        const start = advDateStart ? new Date(advDateStart) : null;
        const end = advDateEnd ? new Date(advDateEnd) : null;
        baseList = baseList.filter(a => {
          const ad = parseAssetDate(a.DATAAQUSIC);
          if (!ad) return false;
          if (start && ad < start) return false;
          if (end && ad > end) return false;
          return true;
        });
      }

      if (term) baseList = baseList.filter(a => normalizeKey(a.SERIAL || '').includes(term) || normalizeKey(a.DESCRICAODOATIVO || '').includes(term));
      if (activeFilter === 'checked') return baseList.filter(a => !!a._conferido);
      return baseList.filter(a => !a._conferido);
    }

    // MÓDULO INVENTÁRIO (INDACATO/MANTIDO)
    if (term) {
      let matches = assets.filter(a => normalizeKey(a.ETIQUETA || '') === term);
      if (matches.length === 0) return allAssets.filter(a => normalizeKey(a.ETIQUETA || '') === term).map(a => ({ ...a, _isExternal: true }));
      if (activeFilter === 'checked') return matches.filter(a => !!a._conferido && normalizeKey(a.ENDERECO || "") === currentLocKey);
      return matches.filter(a => !a._conferido || normalizeKey(a.ENDERECO || "") !== currentLocKey);
    }

    return baseList.filter(a => {
      const isBaixado = String(a.STATUS || '').toUpperCase().includes('BAIXADO');
      const itemLocKey = normalizeKey(a.ENDERECO || "");
      // Itens marcados como etiquetar não aparecem no inventário normal
      if (normalizeKey(a.ETIQUETA || '') === 'ETIQUETAR') return false;
      if (activeFilter === 'checked') return !!a._conferido && itemLocKey === currentLocKey;
      return !a._conferido && itemLocKey === currentLocKey && !isBaixado;
    }).sort((a, b) => String(a.ETIQUETA || '').localeCompare(String(b.ETIQUETA || ''), undefined, { numeric: true }));
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, batchTagFocus, advDesc, advCC, advSupplier, advDateStart, advDateEnd, isEmplaquetarMode]);

  const clearFilters = () => { 
    setCommittedSearch(''); setDisplayValue(''); setBatchTagFocus(null); 
    setAdvDesc(''); setAdvCC(''); setAdvSupplier(''); setAdvDateStart(''); setAdvDateEnd('');
  };

  const handleDecision = (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;
    onBulkUpdateAssets([id]);
    if (committedSearch) clearFilters();
  };

  const locationsList = useMemo(() => {
    const stats: Record<string, { total: number; checked: number; isVirtual?: boolean }> = {};
    let virtualCount = 0; let virtualChecked = 0;
    assets.forEach(a => {
      const isBaixado = String(a.STATUS || '').toUpperCase().includes('BAIXADO');
      if (isBaixado) return;
      const needsLabel = normalizeKey(a.ETIQUETA || '') === 'ETIQUETAR' || a.TAG_INVENTARIO === 'FALTA ETIQUETAR';
      if (needsLabel) { virtualCount++; if (a._conferido) virtualChecked++; return; }
      let loc = String(a.ENDERECO || '').trim().toUpperCase();
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++; if (a._conferido) stats[loc].checked++;
    });
    if (virtualCount > 0) stats[VIRTUAL_LABEL_LOC] = { total: virtualCount, checked: virtualChecked, isVirtual: true };
    return stats;
  }, [assets]);

  const sortedLocations = useMemo(() => {
    const keys = Object.keys(locationsList).sort();
    if (locationsList[VIRTUAL_LABEL_LOC]) return [VIRTUAL_LABEL_LOC, ...keys.filter(k => k !== VIRTUAL_LABEL_LOC)];
    return keys;
  }, [locationsList]);

  // v24.41: Ao entrar em modo EMPLAQUETAR, força a entrada na listagem do local virtual
  useEffect(() => {
    if (isEmplaquetarMode && !isInventorying) {
       setIsInventorying(true);
       setIsFilterPanelOpen(true);
    }
  }, [isEmplaquetarMode, isInventorying]);

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <>
          {/* TELA DE MAPEAMENTO GEOGRÁFICO - Exibida apenas no módulo INVENTÁRIO */}
          <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800 relative z-30 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
               <button onClick={onBack} className="flex items-center space-x-2 text-slate-500 font-black text-[10px] uppercase tracking-widest active:text-sky-400">
                  <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
               </button>
               <div className="flex space-x-2 items-center">
                  <button onClick={() => { setNewLocName(''); setNewLocCC(''); setIsNewLocModalOpen(true); }} className="bg-sky-600/20 p-2.5 rounded-xl border border-sky-500/30 text-sky-400 active:scale-90 transition-all shadow-lg"><Plus size={18} strokeWidth={3} /></button>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-600"><LayoutGrid size={18} /></div>
               </div>
            </div>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">Mapeamento Geográfico</h1>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mt-2 italic">Seleção de Localidade para Auditoria</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-32 no-scrollbar bg-slate-950">
            {sortedLocations.map(loc => {
              const stats = locationsList[loc];
              const progress = stats.total > 0 ? (stats.checked / stats.total) * 100 : 0;
              const isComplete = progress === 100;
              const isVirtual = stats.isVirtual;
              
              if (isVirtual) return null; // Esconde o local de plaqueteamento do mapeamento geográfico

              return (
                <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full bg-slate-900 border ${isComplete ? 'border-emerald-500/50' : 'border-slate-800'} rounded-[1.8rem] p-5 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden`}>
                  <div className={`absolute left-0 top-0 bottom-0 bg-emerald-600/10 transition-all duration-1000 z-0`} style={{ width: `${progress}%` }} />
                  <div className="flex items-center space-x-3 relative z-10">
                    <div className={`w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center ${isComplete ? 'text-emerald-500' : 'text-sky-500'} border border-slate-800`}>
                      <MapPin size={18} />
                    </div>
                    <div className="text-left">
                      <span className={`text-[12px] font-black uppercase block leading-none text-slate-100`}>{loc}</span>
                      <div className="flex items-center space-x-2 mt-2">
                        <span className={`text-[8px] font-black uppercase tracking-widest ${isComplete ? 'text-emerald-400' : 'text-slate-600'}`}>{stats.checked} / {stats.total} ITENS</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className={`relative z-10 ${isComplete ? 'text-emerald-500' : 'text-slate-800'}`} />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* TELA DE LISTAGEM - BENS A SEREM ETIQUETADOS (EMPLAQUETAR) OU LOCALIDADE (INVENTÁRIO) */}
          <div className="px-6 pt-10 pb-3 bg-slate-900 border-b border-slate-800 relative z-30 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { 
                if (isEmplaquetarMode) onBack(); else setIsInventorying(false); 
                clearFilters(); 
              }} className={`px-3 py-2 rounded-lg border flex items-center space-x-2 max-w-[85%] active:scale-95 transition-all ${isEmplaquetarMode ? 'bg-amber-600 text-white border-amber-500 shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                 {isEmplaquetarMode ? <Tag size={12} className="shrink-0" /> : <MapPin size={10} className="text-emerald-500 shrink-0" />}
                 <span className="text-[10px] font-black uppercase truncate italic tracking-tighter">{isEmplaquetarMode ? 'BENS A SEREM ETIQUETADOS' : selectedLocation}</span>
              </button>
              <div className="flex space-x-1.5">
                <button onClick={() => setInputMethod('keyboard')} className={`p-2 rounded-lg border transition-all ${inputMethod === 'keyboard' ? 'bg-sky-600 text-white border-sky-500' : 'text-slate-600 border-slate-800'}`}><Keyboard size={14} /></button>
                <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2 rounded-lg border transition-all ${inputMethod === 'scanner' ? 'bg-sky-600 text-white border-sky-500' : 'text-slate-600 border-slate-800'}`}><Zap size={14} /></button>
                {isEmplaquetarMode && (
                  <button onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)} className={`p-2 rounded-lg border transition-all ${isFilterPanelOpen ? 'bg-amber-400 text-black border-amber-400 shadow-lg' : 'text-amber-500 border-amber-900/50'}`}>
                    <Filter size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* PAINEL DE FILTROS INTELIGENTES - ATIVO POR PADRÃO NO MODO EMPLAQUETAR */}
            {isEmplaquetarMode && isFilterPanelOpen && (
              <div className="bg-slate-950/95 border border-amber-600/30 rounded-3xl p-5 mb-3 space-y-4 animate-slideUp shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-3 opacity-20"><Tag size={40} /></div>
                <div>
                  <label className="text-[8px] font-black uppercase text-amber-500 tracking-widest ml-1 mb-1 block">Descrição (Contém)</label>
                  <input type="text" value={advDesc} onChange={(e) => setAdvDesc(e.target.value)} placeholder="PESQUISAR NA DESCRIÇÃO..." className="w-full bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-[10px] font-black uppercase text-white outline-none focus:border-amber-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[8px] font-black uppercase text-amber-500 tracking-widest ml-1 mb-1 block">Centro de Custo</label>
                    <select value={advCC} onChange={(e) => setAdvCC(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-[10px] font-black uppercase text-white outline-none focus:border-amber-500">
                      <option value="">TODOS</option>
                      {uniqueCentrosDeCusto.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase text-amber-500 tracking-widest ml-1 mb-1 block">Fornecedor</label>
                    <select value={advSupplier} onChange={(e) => setAdvSupplier(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-[10px] font-black uppercase text-white outline-none focus:border-amber-500">
                      <option value="">TODOS</option>
                      {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-amber-500 tracking-widest ml-1 mb-1 block">Intervalo de Aquisição</label>
                  <div className="flex items-center space-x-2">
                     <input type="date" value={advDateStart} onChange={(e) => setAdvDateStart(e.target.value)} className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl text-[10px] font-black text-white" />
                     <span className="text-slate-800 font-black text-[8px]">A</span>
                     <input type="date" value={advDateEnd} onChange={(e) => setAdvDateEnd(e.target.value)} className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl text-[10px] font-black text-white" />
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-slate-800">
                   <button onClick={clearFilters} className="text-[8px] font-black uppercase text-red-500 tracking-widest px-4 py-2 bg-red-500/10 rounded-lg">Resetar Filtros</button>
                </div>
              </div>
            )}

            <div className="relative mb-3 flex items-center space-x-2">
              <div className="relative flex-1">
                 <input ref={searchInputRef} type="text" value={displayValue} onChange={(e) => setDisplayValue(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && setCommittedSearch(displayValue)} className="w-full bg-slate-950 border-2 border-slate-800 px-5 py-3.5 font-black font-mono text-xl text-center rounded-2xl outline-none focus:border-sky-600 text-white shadow-lg" placeholder={isEmplaquetarMode ? "SERIAL OU DESCRIÇÃO..." : "ETIQUETA..."} />
                 {(committedSearch || displayValue) && <button onClick={clearFilters} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 p-1"><XCircle size={16} /></button>}
              </div>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => { setActiveFilter('pending'); clearFilters(); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeFilter === 'pending' && !committedSearch && !advDesc && !advCC && !advSupplier ? 'bg-white text-slate-950 border-white shadow-xl' : 'text-slate-600 border-slate-800'}`}>Pendentes</button>
              <button onClick={() => { setActiveFilter('checked'); clearFilters(); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeFilter === 'checked' ? 'bg-sky-600 text-white border-sky-500 shadow-xl' : 'text-slate-600 border-slate-800'}`}>Inventariado</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar pb-44 bg-slate-950">
            {filteredAndSortedAssets.length > 0 ? (
              filteredAndSortedAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} selectedLocation={selectedLocation} onSelect={onSelectAsset} onMakeDecision={handleDecision} isInventariadoTab={activeFilter === 'checked'} />
              ))
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-center opacity-20">
                 <Search size={40} className="text-slate-500 mb-4" />
                 <p className="text-[10px] font-black uppercase tracking-widest">Nenhum registro encontrado</p>
                 <p className="text-[8px] font-bold uppercase tracking-widest mt-2">Revise os parâmetros aplicados</p>
              </div>
            )}
          </div>
        </>
      )}

      {isNewLocModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-bounceIn border border-slate-800" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsNewLocModalOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-black transition-colors"><X size={24} /></button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-sky-600/20 text-sky-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-sky-500/30"><MapPin size={32} /></div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Novo Local</h3>
            </div>
            <div className="space-y-4">
              <input type="text" value={newLocName} onChange={(e) => setNewLocName(e.target.value.toUpperCase())} placeholder="NOME DO LOCAL..." className="w-full bg-slate-950 p-4 border border-slate-800 rounded-2xl text-[12px] font-black uppercase text-white outline-none focus:border-sky-600" />
              <input type="text" value={newLocCC} onChange={(e) => setNewLocCC(e.target.value.toUpperCase())} placeholder="CENTRO DE CUSTO..." className="w-full bg-slate-950 p-4 border border-slate-800 rounded-2xl text-[12px] font-black uppercase text-white outline-none focus:border-sky-600" />
              <button onClick={() => { if (newLocName.trim()) { setSelectedLocation(newLocName.trim()); setIsInventorying(true); setIsNewLocModalOpen(false); } }} className="w-full py-4 mt-2 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg">Ativar Auditoria</button>
            </div>
          </div>
        </div>
      )}
      
      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(text) => { setDisplayValue(text.toUpperCase()); setCommittedSearch(text.toUpperCase()); setIsScannerOpen(false); }} />}
    </div>
  );
};

export default Inventory;
