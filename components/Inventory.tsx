
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  ArrowLeft, 
  ArrowRight,
  MapPin, 
  Check,
  Keyboard, 
  Zap, 
  Search, 
  XCircle, 
  ChevronRight,
  Globe,
  ShieldAlert,
  PlusCircle,
  RefreshCw,
  Box,
  Layers,
  Info,
  Hash,
  LayoutGrid,
  Calendar,
  Plus,
  Building2
} from 'lucide-react';

// Utilitário de Formatação de Data Profissional (MM/AAAA) para Cards
const formatMonthYearBR = (val: any): string => {
  if (!val) return "";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "NULL") return "";

  let date: Date | null = null;
  if (!isNaN(Number(s)) && Number(s) > 10000) {
    date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  } else if (s.includes('-') || s.includes('/')) {
    const parts = s.split(/[/-]/);
    if (parts[0].length === 4) date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    else if (parts[2].length === 4) date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }

  if (date && !isNaN(date.getTime())) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return s.toUpperCase();
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
  
  const isDivergent = locAuditado !== "" && locAtual !== "" && locAuditado !== locAtual;
  const isBaixado = String(asset.STATUS || '').toUpperCase().includes('BAIXADO');

  let visualStatus = asset.TAG_INVENTARIO || 'PENDENTE';
  
  if (isDivergent && !isInventariadoTab) {
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
    
    switch (visualStatus) {
      case 'ADOTADO':
        return { bg: 'bg-lime-900/20', border: 'border-lime-500/50', badge: 'bg-lime-400 text-black font-black', btn: 'bg-lime-500 border-lime-700 text-black shadow-lime-900/20' };
      case 'RE-ADOTADO':
        return { bg: 'bg-sky-950/40', border: 'border-sky-400/60', badge: 'bg-sky-500 text-white font-black', btn: 'bg-sky-600 border-sky-800 shadow-sky-900/20' };
      case 'NOVO ITEM':
        return { bg: 'bg-amber-950/40', border: 'border-amber-500/50', badge: 'bg-amber-500 text-white', btn: 'bg-amber-600 border-amber-800' };
      case 'CONFERIDO':
      case 'INVENTARIADO':
        return { bg: 'bg-emerald-950/30', border: 'border-emerald-500/40', badge: 'bg-emerald-600 text-white', btn: 'bg-emerald-600 border-emerald-800' };
      case 'EXTERNO':
        return { bg: 'bg-blue-950/40', border: 'border-blue-500/50', badge: 'bg-blue-600 text-white', btn: 'bg-blue-600 border-blue-800' };
      default:
        return { bg: 'bg-slate-900', border: 'border-slate-800', badge: 'bg-slate-800 text-slate-500', btn: 'bg-indigo-600 border-indigo-800' };
    }
  };

  const colors = getGoldenColors();
  const showCheckAction = !isConferido || (isDivergent && !isInventariadoTab);

  return (
    <div className={`mb-2 p-5 border rounded-[2rem] transition-all duration-300 active:scale-[0.98] relative overflow-hidden ${colors.bg} ${colors.border}`} onClick={() => onSelect(asset)}>
      
      {/* BOTÃO MOVIDO PARA EXTREMIDADE SUPERIOR DIREITA v24.22 */}
      {showCheckAction && (
        <button 
          onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
          className={`absolute top-4 right-4 w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all shrink-0 border-b-4 z-20 ${colors.btn}`}
        >
          <Check size={28} strokeWidth={4} />
        </button>
      )}

      {/* CONTEÚDO COM PADDING PARA NÃO COLIDIR COM O BOTÃO */}
      <div className="pr-14 flex flex-col space-y-3">
        {/* LINHA 1: ETIQUETA E STATUS */}
        <div className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border font-black uppercase tracking-tighter text-[11px] w-fit ${colors.badge}`}>
          <Hash size={12} strokeWidth={3} className="opacity-50" />
          <span>{asset.ETIQUETA || 'S/ ETQ'}</span>
          <span className="mx-1 opacity-30">|</span>
          <span className="text-[8px] tracking-widest">{visualStatus}</span>
        </div>

        {/* LINHA 2: DESCRIÇÃO (INVERTIDA COM LOCALIZAÇÃO v24.22) */}
        <p className="text-[11px] font-bold uppercase leading-tight italic text-slate-100 px-1 line-clamp-2">
          {formattedDescription || 'SEM DADOS TÉCNICOS'}
        </p>

        {/* LINHA 3: SELO DE DIVERGÊNCIA (TIEBREAKER) - REDIMENSIONADO v24.23 */}
        {isDivergent && (
          <div className={`px-4 py-2 rounded-2xl border-2 flex flex-col shadow-2xl animate-fadeIn w-full overflow-hidden ${visualStatus === 'RE-ADOTADO' ? 'bg-sky-900/60 border-sky-400 text-white' : 'bg-lime-400 border-lime-600 text-black'}`}>
             <div className="flex items-center space-x-2 mb-1 border-b border-black/10 pb-1 opacity-80 overflow-hidden">
                <Building2 size={10} strokeWidth={3} className="shrink-0" />
                <span className="text-[8px] font-black uppercase tracking-tighter truncate whitespace-nowrap">CIA: {originCia}</span>
             </div>
             <div className="flex items-center space-x-2 overflow-hidden">
                <MapPin size={10} strokeWidth={3} className="shrink-0" />
                <span className="text-[9px] font-black font-mono leading-none truncate uppercase italic whitespace-nowrap">ÚLT: {originAddr}</span>
             </div>
          </div>
        )}
      </div>

      {/* INDICADOR DE CONFERIDO SE NÃO TIVER BOTÃO */}
      {!showCheckAction && (
         <div className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 z-10">
            <Check size={20} strokeWidth={3} />
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
}

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [batchTagFocus, setBatchTagFocus] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  
  // States para Novo Local
  const [isNewLocModalOpen, setIsNewLocModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizeKey = (s: string) => s.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim();

  const filteredAndSortedAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKey(batchTagFocus || committedSearch);
    const currentLocKey = normalizeKey(selectedLocation);

    if (term) {
      let matches = assets.filter(a => normalizeKey(a.ETIQUETA || '') === term);
      if (matches.length === 0) {
        return allAssets.filter(a => normalizeKey(a.ETIQUETA || '') === term).map(a => ({ ...a, _isExternal: true }));
      }
      if (activeFilter === 'checked') {
        return matches.filter(a => !!a._conferido && normalizeKey(a.ENDERECO || "") === currentLocKey);
      } else {
        return matches.filter(a => !a._conferido || normalizeKey(a.ENDERECO || "") !== currentLocKey);
      }
    }

    const currentLoc = selectedLocation.toUpperCase();
    return assets.filter(a => {
      const isBaixado = String(a.STATUS || '').toUpperCase().includes('BAIXADO');
      const itemLocKey = normalizeKey(a.ENDERECO || "");
      const isSameLoc = itemLocKey === currentLocKey;
      if (activeFilter === 'checked') return !!a._conferido && isSameLoc;
      return !a._conferido && isSameLoc && !isBaixado;
    }).sort((a, b) => String(a.ETIQUETA || '').localeCompare(String(b.ETIQUETA || ''), undefined, { numeric: true }));
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, batchTagFocus]);

  const isBatchView = useMemo(() => {
    const currentLocKey = normalizeKey(selectedLocation || "");
    const items = filteredAndSortedAssets.filter(a => !a._conferido || normalizeKey(a.ENDERECO || "") !== currentLocKey);
    if (items.length < 2) return false;
    const firstTag = normalizeKey(items[0].ETIQUETA || '');
    return firstTag !== "" && items.every(a => normalizeKey(a.ETIQUETA || '') === firstTag);
  }, [filteredAndSortedAssets, selectedLocation]);

  const clearFilters = () => { setCommittedSearch(''); setDisplayValue(''); setBatchTagFocus(null); };

  const handleDecision = (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;
    const asset = assets.find(a => String(a.id) === String(id));
    if (!asset) return;
    const tag = normalizeKey(asset.ETIQUETA || '');
    const currentLocKey = normalizeKey(selectedLocation || "");
    const duplicates = (tag && tag !== "") ? assets.filter(a => normalizeKey(a.ETIQUETA || '') === tag && (!a._conferido || normalizeKey(a.ENDERECO || "") !== currentLocKey)) : [];

    if (duplicates.length > 1 && !batchTagFocus) {
      setBatchTagFocus(tag);
      setCommittedSearch('');
      setDisplayValue('');
    } else {
      onBulkUpdateAssets([id]);
      if (batchTagFocus) {
        const remaining = duplicates.filter(d => String(d.id) !== String(id));
        if (remaining.length === 0) setBatchTagFocus(null);
      }
      if (committedSearch) clearFilters();
    }
  };

  const locationsList = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    assets.forEach(a => {
      if (String(a.STATUS || '').toUpperCase().includes('BAIXADO')) return;
      let loc = String(a.ENDERECO || '').trim().toUpperCase();
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++;
      if (a._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets]);

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <>
          <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800 relative z-30 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
               <button onClick={onBack} className="flex items-center space-x-2 text-slate-500 font-black text-[10px] uppercase tracking-widest active:text-indigo-400">
                  <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
               </button>
               <div className="flex space-x-2 items-center">
                  <button 
                    onClick={() => { setNewLocName(''); setIsNewLocModalOpen(true); }}
                    className="bg-indigo-600/20 p-2.5 rounded-xl border border-indigo-500/30 text-indigo-400 active:scale-90 transition-all shadow-lg"
                    title="Incluir Novo Local"
                  >
                    <Plus size={18} strokeWidth={3} />
                  </button>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-600">
                    <LayoutGrid size={18} />
                  </div>
               </div>
            </div>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">Mapeamento Geográfico</h1>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mt-2 italic">Selecione a unidade de auditoria</p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-2 pb-32 no-scrollbar bg-slate-950">
            {Object.keys(locationsList).length > 0 ? (
              Object.keys(locationsList).sort().map(loc => {
                const stats = locationsList[loc];
                const progress = stats.total > 0 ? (stats.checked / stats.total) * 100 : 0;
                const isComplete = progress === 100;
                return (
                  <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full bg-slate-900 border ${isComplete ? 'border-emerald-500/50' : 'border-slate-800'} rounded-[1.8rem] p-4 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden`}>
                    <div className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-600/20 to-emerald-600/5 transition-all duration-1000 ease-out z-0 border-r border-emerald-500/10" style={{ width: `${progress}%` }} />
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className={`w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center ${isComplete ? 'text-emerald-500' : 'text-indigo-500'} border border-slate-800 group-active:text-white transition-colors`}><MapPin size={18} /></div>
                      <div className="text-left">
                        <span className="text-[11px] font-black text-slate-100 uppercase block leading-none">{loc}</span>
                        <div className="flex items-center space-x-2 mt-1.5">
                          <span className={`text-[8px] font-black uppercase tracking-widest ${isComplete ? 'text-emerald-400' : 'text-slate-600'}`}>{stats.checked} / {stats.total} ITENS</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`relative z-10 ${isComplete ? 'text-emerald-500' : 'text-slate-800'}`} />
                  </button>
                );
              })
            ) : (
              <div className="py-24 text-center opacity-20 flex flex-col items-center">
                <Info size={48} className="mb-4 text-slate-700" />
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Aguardando mapeamento master</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="px-6 pt-10 pb-3 bg-slate-900 border-b border-slate-800 relative z-30 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { setIsInventorying(false); clearFilters(); }} className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center space-x-2 max-w-[75%] text-slate-400 active:scale-95 transition-all">
                 <MapPin size={10} className="text-emerald-500 shrink-0" />
                 <span className="text-[9px] font-black uppercase truncate italic tracking-tighter">{selectedLocation || 'SELECIONAR LOCAL'}</span>
              </button>
              <div className="flex space-x-1.5">
                <button onClick={() => setInputMethod('keyboard')} className={`p-2 rounded-lg border transition-all ${inputMethod === 'keyboard' ? 'bg-indigo-600 text-white border-indigo-500' : 'text-slate-600 border-slate-800'}`}><Keyboard size={14} /></button>
                <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2 rounded-lg border transition-all ${inputMethod === 'scanner' ? 'bg-indigo-600 text-white border-indigo-500' : 'text-slate-600 border-slate-800'}`}><Zap size={14} /></button>
              </div>
            </div>

            <div className="relative mb-3 flex items-center space-x-2">
              <div className="relative flex-1">
                 <input ref={searchInputRef} type="text" value={displayValue} onChange={(e) => setDisplayValue(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && setCommittedSearch(displayValue)} className="w-full bg-slate-950 border-2 border-slate-800 px-5 py-3.5 font-black font-mono text-xl text-center rounded-2xl outline-none focus:border-indigo-600 text-white shadow-lg transition-all" placeholder="ETIQUETA..." />
                 {(committedSearch || displayValue) && <button onClick={clearFilters} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 p-1"><XCircle size={16} /></button>}
              </div>
            </div>

            <div className="flex space-x-2">
              <button onClick={() => { setActiveFilter('pending'); clearFilters(); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeFilter === 'pending' && !committedSearch && !batchTagFocus ? 'bg-white text-slate-950 border-white' : 'text-slate-600 border-slate-800'}`}>Pendentes</button>
              <button onClick={() => { setActiveFilter('checked'); clearFilters(); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeFilter === 'checked' ? 'bg-indigo-600 text-white border-indigo-500' : 'text-slate-600 border-slate-800'}`}>Inventariado</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar pb-44 bg-slate-950">
            {isBatchView && (
              <div className="w-full mb-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-700 border-2 border-white/20 rounded-3xl flex items-center justify-between shadow-xl animate-bounceIn">
                <div className="flex items-center space-x-3 text-white">
                  <div className="bg-white/20 p-2 rounded-xl"><Globe size={24} strokeWidth={3} /></div>
                  <div>
                    <p className="text-[8px] font-black uppercase opacity-70 italic">Identidade de Lote</p>
                    <p className="text-[13px] font-black uppercase leading-tight text-white tracking-tighter italic">Confirmar {filteredAndSortedAssets.length} Registros</p>
                  </div>
                </div>
                <button onClick={() => { onBulkUpdateAssets(filteredAndSortedAssets.map(a => String(a.id))); clearFilters(); }} className="px-5 py-3 bg-white text-indigo-900 rounded-xl font-black uppercase text-[10px] active:scale-95 shadow-lg">Confirmar</button>
              </div>
            )}

            {filteredAndSortedAssets.length > 0 ? (
              <div className="space-y-1">
                {filteredAndSortedAssets.map((asset) => (
                  <AssetCard 
                    key={asset.id} 
                    asset={asset} 
                    selectedLocation={selectedLocation} 
                    onSelect={onSelectAsset} 
                    onMakeDecision={handleDecision} 
                    isInventariadoTab={activeFilter === 'checked'} 
                  />
                ))}
                
                {committedSearch && (
                  <div className="pt-6 pb-10">
                     <button 
                        onClick={() => { setManualDescription(''); setIsManualModalOpen(true); }} 
                        className="w-full py-5 bg-slate-900 border-2 border-dashed border-amber-600/40 text-amber-500 rounded-[2rem] font-black uppercase text-[10px] flex items-center justify-center space-x-2 shadow-xl active:scale-95 transition-all"
                     >
                        <PlusCircle size={18} /> 
                        <span>Não é este item? Incluir Novo Registro</span>
                     </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-24 text-center flex flex-col items-center">
                {committedSearch ? (
                  <div className="animate-bounceIn w-full max-w-xs">
                    <div className="bg-amber-900/10 border-2 border-amber-600/40 p-6 rounded-[2.5rem] mb-6">
                      <ShieldAlert size={40} className="text-amber-500 mx-auto mb-3" />
                      <p className="text-[10px] text-slate-400 font-black uppercase italic leading-tight text-center">Etiqueta {committedSearch} não localizada no banco global.</p>
                    </div>
                    <button onClick={() => { setManualDescription(''); setIsManualModalOpen(true); }} className="w-full py-5 bg-amber-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] flex items-center justify-center space-x-2 shadow-xl active:scale-95 transition-all"><PlusCircle size={18} /> <span>Incluir Novo Registro</span></button>
                  </div>
                ) : (
                  <div className="opacity-20 flex flex-col items-center">
                    <Layers size={48} className="text-slate-700 mb-4" />
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Aguardando Auditoria</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {isNewLocModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-slate-800 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-600/10 rounded-full blur-3xl"></div>
            <h3 className="text-xl font-black text-white uppercase text-center mb-6 italic tracking-tighter">Novo Local de Auditoria</h3>
            <div className="space-y-4">
              <div className="relative">
                <input autoFocus type="text" value={newLocName} onChange={(e) => setNewLocName(e.target.value.toUpperCase())} className="w-full px-5 py-5 bg-slate-950 rounded-2xl border-2 border-slate-800 focus:border-indigo-600 outline-none text-white text-[14px] font-black uppercase text-center shadow-inner tracking-tight" placeholder="NOME DO LOCAL..." />
              </div>
              <p className="text-[8px] font-black text-slate-600 uppercase text-center tracking-[0.2em]">Ex: DEPÓSITO B, SALA TÉCNICA 03, ETC.</p>
              
              <button onClick={() => {
                if (newLocName.trim() === '') return;
                setSelectedLocation(newLocName.trim());
                setIsInventorying(true);
                setIsNewLocModalOpen(false);
              }} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-2xl flex items-center justify-center space-x-2 active:scale-95 transition-all"><Plus size={18} strokeWidth={3} /><span>Criar e Iniciar</span></button>
              
              <button onClick={() => setIsNewLocModalOpen(false)} className="w-full py-2 text-slate-600 font-black uppercase text-[8px] tracking-widest italic">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-slate-800">
            <h3 className="text-xl font-black text-white uppercase text-center mb-6 italic tracking-tighter">Inclusão Manual</h3>
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                 <p className="text-[8px] font-black text-slate-600 uppercase mb-1">Unidade de Inventário</p>
                 <p className="text-[10px] font-black text-indigo-400 uppercase truncate italic">{selectedLocation}</p>
              </div>
              <div>
                <textarea rows={3} value={manualDescription} onChange={(e) => setManualDescription(e.target.value.toUpperCase())} className="w-full px-5 py-4 bg-slate-950 rounded-2xl border-2 border-slate-800 focus:border-amber-600 outline-none text-white text-[12px] font-bold uppercase resize-none shadow-inner" placeholder="DESCRIÇÃO DO NOVO ATIVO..." />
              </div>
              <button onClick={() => {
                const tag = committedSearch || displayValue || 'NOVO';
                const newAsset: Asset = { 
                  id: `man_${Date.now()}`, 
                  EMPRESA: selectedCompany || "GERAL", 
                  _conferido: true, 
                  ETIQUETA: tag, 
                  DESCRICAODOATIVO: manualDescription.trim(), 
                  ENDERECO: (selectedLocation || "").toUpperCase(), 
                  TAG_INVENTARIO: "NOVO ITEM", 
                  QT: "1", 
                  STATUS: "ATIVO", 
                  DATAAQUSIC: new Date().toISOString(),
                  _isNew: true 
                };
                onUpdateAsset(newAsset); setIsManualModalOpen(false); clearFilters();
              }} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-2xl flex items-center justify-center space-x-2 active:scale-95 transition-all"><PlusCircle size={18} /><span>Confirmar Novo Registro</span></button>
              <button onClick={() => setIsManualModalOpen(false)} className="w-full py-1 text-slate-600 font-black uppercase text-[8px] tracking-widest italic">Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(val) => { setIsScannerOpen(false); setCommittedSearch(val.toUpperCase()); setDisplayValue(val.toUpperCase()); }} />}
    </div>
  );
};

export default Inventory;
