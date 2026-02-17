
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  ArrowLeft, 
  MapPin, 
  Check,
  Keyboard, 
  Zap, 
  Plus, 
  Search, 
  ClipboardCheck, 
  XCircle, 
  PlusCircle, 
  FilePlus, 
  Save, 
  LayoutGrid,
  ChevronRight,
  Info
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  isConferidoTab: boolean;
  highlighted?: boolean;
  isAdotado?: boolean;
  isExternal?: boolean;
}

const AssetCard = React.memo(({ 
  asset, onSelect, onMakeDecision, isConferidoTab, highlighted, isAdotado, isExternal 
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  
  const checkIsBaixado = (item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA', 'SITUACAO'];
    for (const term of terms) {
      const val = String(item[term] || '').trim().toUpperCase();
      if (val !== "" && val !== "---" && val !== "0" && val !== "NULL" && val !== "ATIVO") return true;
    }
    return false;
  };
  
  const isBaixado = checkIsBaixado(asset);
  const plaquetaInv = asset.PLAQUETA_INVENTARIO;
  
  const originalPlaqueta = asset._plaquetaMaster || 'S/ PLACA';
  const displayPlaqueta = plaquetaInv || originalPlaqueta;
  const descricao = asset._descricaoMaster || 'ITEM SEM DESCRIÇÃO';
  
  const tagInv = asset.TAG_INVENTARIO;

  let cardStyle = "bg-slate-900/40 border-slate-800";
  let badgeStyle = "bg-slate-800 text-slate-400 border-slate-700";
  let btnStyle = "bg-indigo-600";
  let tagLabel = tagInv || 'PENDENTE';

  if (isBaixado) {
    cardStyle = "bg-red-950/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]";
    badgeStyle = "bg-red-600 text-white border-red-400";
    btnStyle = "bg-red-600";
    tagLabel = "BAIXADO";
  } else if (isExternal) {
    cardStyle = "bg-fuchsia-950/20 border-fuchsia-500/50 shadow-[0_0_20px_rgba(217,70,239,0.4)]";
    badgeStyle = "bg-fuchsia-600 text-white border-fuchsia-400";
    btnStyle = "bg-fuchsia-600";
    tagLabel = "EXTERNO";
  } else if (tagInv === 'NOVO ITEM INCLUÍDO') {
    cardStyle = "bg-purple-950/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)]";
    badgeStyle = "bg-purple-600 text-white border-purple-400";
    btnStyle = "bg-purple-600";
    tagLabel = "NOVO ITEM";
  } else if (isAdotado || tagInv === 'ADOTADO') {
    cardStyle = "bg-blue-950/20 border-blue-500/50";
    badgeStyle = "bg-blue-600 text-white border-blue-400";
    btnStyle = "bg-blue-600";
    tagLabel = "ADOÇÃO";
  } else if (isConferido) {
    cardStyle = "bg-emerald-950/10 border-emerald-600/30";
    badgeStyle = "bg-emerald-600 text-white border-emerald-500";
    btnStyle = "bg-emerald-600";
    tagLabel = "CONFERIDO";
  }

  if (highlighted) cardStyle += " ring-2 ring-indigo-500 bg-slate-900 shadow-2xl";

  return (
    <div className={`mb-3 p-4 border rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-between ${cardStyle} ${isConferido && !isConferidoTab && !isBaixado && !isExternal ? 'opacity-30' : ''}`} onClick={() => onSelect(asset)}>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center space-x-2 mb-1">
          <h3 className={`text-xl font-black font-mono tracking-tighter ${tagInv === 'NOVO ITEM INCLUÍDO' ? 'text-purple-400' : isBaixado ? 'text-red-400' : 'text-white'}`}>{displayPlaqueta}</h3>
          <span className={`text-[7px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border ${badgeStyle}`}>{tagLabel}</span>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase line-clamp-2 leading-tight italic">
          {descricao}
          {(isExternal || isAdotado) && (
            <span className={`block mt-1 font-black text-[8px] ${isExternal ? 'text-fuchsia-400' : 'text-blue-400'}`}>Unidade: {asset._empresaNormalizada} - Setor Master: {asset._localMaster}</span>
          )}
        </p>
      </div>
      {(!isConferido || isConferidoTab || isBaixado || isExternal) && (
        <button onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-xl active:scale-90 transition-all shrink-0 ${btnStyle}`}><Check size={28} strokeWidth={4} /></button>
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
  databaseHeaders?: string[];
}

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany, databaseHeaders = [] }) => {
  const [displayValue, setDisplayValue] = useState('000000');
  const [committedSearch, setCommittedSearch] = useState('');
  const [batchTagFocus, setBatchTagFocus] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'TAG' | 'DESCRIPTION'>('TAG');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const checkIsBaixado = useCallback((item: any) => {
    const terms = ['DATA_BAIXA', 'DT_BAIXA', 'DATA_DA_BAIXA', 'BAIXA', 'DATA_DE_BAIXA', 'SITUACAO'];
    for (const term of terms) {
      const val = String(item[term] || '').trim().toUpperCase();
      if (val !== "" && val !== "---" && val !== "0" && val !== "NULL" && val !== "ATIVO") return true;
    }
    return false;
  }, []);

  const getAssetTagValue = useCallback((asset: Asset): string => {
    if (asset.PLAQUETA_INVENTARIO) return String(asset.PLAQUETA_INVENTARIO).trim().toUpperCase();
    return String(asset._plaquetaMaster || "").trim().toUpperCase();
  }, []);

  // Consolidação Profunda de Locais por Unidade
  const locationsList = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    assets.forEach(a => {
      if (checkIsBaixado(a)) return;
      
      let loc = String(a._localMaster || '').trim().toUpperCase();
      // Elimina resíduos de erro de planilha na visualização
      if (loc === "" || loc === "0" || loc === "NULL" || loc.includes("#N/D") || loc.includes("#REF")) {
        loc = 'SETOR NÃO CADASTRADO';
      }

      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++;
      if (a._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets, checkIsBaixado]);

  const currentCompanyAssets = useMemo(() => {
    if (!selectedCompany) return [];
    const sel = String(selectedCompany).toUpperCase().trim();
    return allAssets.filter(a => String(a._empresaNormalizada || '').toUpperCase().trim() === sel);
  }, [allAssets, selectedCompany]);

  const filteredAndSortedAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const currentLoc = selectedLocation.toUpperCase();
    let baseList = [];
    if (batchTagFocus) {
      const term = batchTagFocus.toUpperCase().trim();
      baseList = currentCompanyAssets.filter(a => {
        const tagV = getAssetTagValue(a);
        return tagV === term || tagV.padStart(6, '0') === term.padStart(6, '0');
      });
    } else if (committedSearch) {
      const term = committedSearch.toUpperCase().trim();
      baseList = currentCompanyAssets.filter(a => {
        const tagV = getAssetTagValue(a);
        const descV = String(a._descricaoMaster || '').toUpperCase();
        return searchMode === 'TAG' ? (tagV === term || tagV.padStart(6, '0') === term.padStart(6, '0')) : descV.includes(term);
      });
      if (baseList.length === 0) {
        baseList = allAssets.filter(a => {
          const tagV = getAssetTagValue(a);
          return (tagV === term || tagV.padStart(6, '0') === term.padStart(6, '0')) && String(a._empresaNormalizada || '').toUpperCase() !== String(selectedCompany).toUpperCase();
        });
      }
    } else {
      baseList = assets.filter(a => {
        let loc = String(a._localMaster || '').trim().toUpperCase();
        if (loc === "" || loc.includes("#N/D")) loc = 'SETOR NÃO CADASTRADO';
        return loc === currentLoc && !checkIsBaixado(a);
      });
    }
    if (!batchTagFocus && !committedSearch) baseList = baseList.filter(a => activeFilter === 'checked' ? !!a._conferido : !a._conferido);
    return baseList.sort((a, b) => getAssetTagValue(a).localeCompare(getAssetTagValue(b), undefined, { numeric: true }));
  }, [assets, allAssets, currentCompanyAssets, selectedLocation, committedSearch, batchTagFocus, activeFilter, getAssetTagValue, selectedCompany, checkIsBaixado, searchMode]);

  const isBatchView = useMemo(() => {
    const pendings = filteredAndSortedAssets.filter(a => !a._conferido);
    if (pendings.length < 2) return false;
    const firstTag = getAssetTagValue(pendings[0]);
    if (!firstTag || firstTag === "0" || firstTag === "" || firstTag.toUpperCase() === "S/ PLACA") return false;
    return pendings.every(a => getAssetTagValue(a) === firstTag);
  }, [filteredAndSortedAssets, getAssetTagValue]);

  const clearFilters = () => { setCommittedSearch(''); setBatchTagFocus(null); setDisplayValue(searchMode === 'TAG' ? '000000' : ''); };

  const handleIncludeManual = () => { setManualDescription(''); setIsManualModalOpen(true); };

  const onConfirmManualInclusion = () => {
    if (!manualDescription.trim()) return;
    const tag = committedSearch || displayValue || '000000';
    const newAsset: Asset = { id: `manual_${Date.now()}`, _empresaNormalizada: selectedCompany || "GERAL", _isNew: true, _conferido: true, _plaquetaMaster: tag, _descricaoMaster: manualDescription.toUpperCase().trim(), _localMaster: (selectedLocation || "SETOR NÃO CADASTRADO").toUpperCase(), PLAQUETA_INVENTARIO: tag, TAG_INVENTARIO: "NOVO ITEM INCLUÍDO" };
    onUpdateAsset(newAsset); setIsManualModalOpen(false); clearFilters();
  };

  const handleDecision = (id: string, decision: 'YES' | 'NO') => {
    if (decision === 'NO') return;
    const asset = allAssets.find(a => String(a.id) === id);
    if (!asset) return;
    const tag = getAssetTagValue(asset);
    const duplicates = (tag && tag !== "0" && tag !== "S/ PLACA") ? currentCompanyAssets.filter(a => getAssetTagValue(a) === tag && !a._conferido) : [];
    if (duplicates.length > 1 && !batchTagFocus) { setBatchTagFocus(tag); setCommittedSearch(''); } else { onBulkUpdateAssets([id]); if (committedSearch || batchTagFocus) { const remaining = duplicates.filter(d => String(d.id) !== String(id)); if (remaining.length === 0) clearFilters(); } }
  };

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-slate-950 animate-fadeIn w-full overflow-hidden">
        <div className="px-6 pt-12 pb-8 bg-slate-900 border-b border-slate-800">
          <button onClick={onBack} className="flex items-center text-slate-600 text-[10px] font-black uppercase mb-6 tracking-widest"><ArrowLeft size={14} className="mr-2" /> Central de Ativos</button>
          <div className="flex items-center justify-between">
            <div><h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Endereços Físicos</h2><p className="text-[9px] font-black text-indigo-500 uppercase mt-1 tracking-widest truncate max-w-[250px]">{selectedCompany}</p></div>
            <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-indigo-400 shadow-xl"><LayoutGrid size={24} /></div>
          </div>
          <div className="mt-8 flex space-x-2">
            <input type="text" placeholder="NOVO ENDEREÇO PARA ESTA UNIDADE..." value={newLocationName} onChange={(e) => setNewLocationName(e.target.value.toUpperCase())} className="flex-1 px-5 py-4 bg-slate-800 rounded-2xl text-[10px] font-black uppercase outline-none border border-slate-700 focus:border-indigo-600 text-white shadow-inner" />
            <button onClick={() => { if(newLocationName.trim()) { setSelectedLocation(newLocationName.trim().toUpperCase()); setIsInventorying(true); setNewLocationName(''); } }} className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center active:scale-95 shadow-lg"><Plus size={24} strokeWidth={3} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-32 no-scrollbar bg-slate-950">
          {Object.keys(locationsList).length > 0 ? (
            Object.keys(locationsList).sort().map(loc => {
              const { total, checked } = locationsList[loc];
              const progress = (checked / total) * 100;
              return (
                <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-5 relative overflow-hidden active:scale-[0.98] transition-all group">
                  <div className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 ${progress >= 100 ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ width: `${progress}%` }} />
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-start space-x-4 min-w-0 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${progress >= 100 ? 'bg-emerald-950/30 text-emerald-500' : 'bg-slate-950 text-indigo-500 shadow-inner'}`}><MapPin size={22} /></div>
                      <div className="text-left min-w-0 flex-1">
                        <span className={`text-[12px] font-black uppercase block tracking-tight leading-tight whitespace-normal break-words ${progress >= 100 ? 'text-emerald-500' : 'text-slate-100'}`}>{loc}</span>
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1 block">{checked} / {total} ATIVOS CONFERIDOS</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-800 shrink-0 ml-2" />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-24 text-center opacity-20 flex flex-col items-center"><Info size={64} className="mb-4" /><p className="text-[10px] font-black uppercase tracking-[0.3em]">Nenhum Endereço Identificado</p></div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-4 bg-slate-900 border-b border-slate-800 relative z-30 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setIsInventorying(false); clearFilters(); }} className="flex items-center text-slate-500 text-[9px] font-black uppercase tracking-widest truncate max-w-[200px]"><ArrowLeft size={14} className="mr-1" /> {selectedLocation}</button>
          <div className="flex space-x-2">
            {(committedSearch || batchTagFocus) && <button onClick={clearFilters} className="p-2.5 bg-red-900/20 text-red-500 rounded-xl border border-red-500/20"><XCircle size={18} /></button>}
            <button onClick={() => { setSearchMode(prev => prev === 'TAG' ? 'DESCRIPTION' : 'TAG'); clearFilters(); }} className={`px-4 py-2.5 rounded-2xl border text-[8px] font-black uppercase ${searchMode === 'DESCRIPTION' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500'}`}>{searchMode === 'TAG' ? 'TEXTO' : 'PLACA'}</button>
            <button onClick={() => setInputMethod('keyboard')} className={`p-2.5 rounded-xl ${inputMethod === 'keyboard' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}><Keyboard size={18} /></button>
            <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2.5 rounded-xl ${inputMethod === 'scanner' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}><Zap size={18} /></button>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <input ref={searchInputRef} type="text" inputMode={searchMode === 'TAG' ? "numeric" : "text"} value={displayValue} onChange={(e) => { if (searchMode === 'TAG') { const r = e.target.value.replace(/\D/g, ''); setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); } else setDisplayValue(e.target.value.toUpperCase()); }} onKeyDown={(e) => e.key === 'Enter' && setCommittedSearch(displayValue)} className={`w-full bg-slate-950 border-2 px-6 py-5 font-black rounded-[2rem] outline-none focus:border-indigo-600 text-white ${searchMode === 'TAG' ? 'font-mono text-5xl text-center' : 'text-sm'}`} placeholder={searchMode === 'TAG' ? "000000" : "QUAL O ATIVO?"} />
        </div>
        <div className="flex mt-4 space-x-2">
          <button onClick={() => { setActiveFilter('pending'); clearFilters(); }} className={`flex-1 py-4 rounded-xl text-[11px] font-black uppercase border ${activeFilter === 'pending' && !committedSearch && !batchTagFocus ? 'bg-white text-slate-950 shadow-md' : 'text-slate-600 border-slate-800'}`}>Pendentes</button>
          <button onClick={() => { setActiveFilter('checked'); clearFilters(); }} className={`flex-1 py-4 rounded-xl text-[11px] font-black uppercase border ${activeFilter === 'checked' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 border-slate-800'}`}>Conferidos</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar pb-44 bg-slate-950">
        {isBatchView && (
          <div className="w-full mb-6 p-5 bg-amber-500 border-4 border-white/30 rounded-3xl flex items-center justify-between shadow-[0_15px_50px_rgba(245,158,11,0.4)] relative overflow-hidden">
            <div className="flex items-center space-x-3 text-black z-10"><ClipboardCheck size={24} /><div><p className="text-[10px] font-black uppercase leading-none mb-1">Confirmação em Lote</p><p className="text-[14px] font-black uppercase leading-none">{filteredAndSortedAssets.filter(a => !a._conferido).length} Itens Identificados</p></div></div>
            <button onClick={() => { onBulkUpdateAssets(filteredAndSortedAssets.filter(a => !a._conferido).map(a => String(a.id))); clearFilters(); }} className="px-6 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase active:scale-95 transition-all z-10">Efetivar</button>
          </div>
        )}
        {filteredAndSortedAssets.length > 0 ? (
          filteredAndSortedAssets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onSelect={onSelectAsset} onMakeDecision={handleDecision} isConferidoTab={activeFilter === 'checked'} highlighted={committedSearch !== '' || batchTagFocus !== null} isAdotado={(asset._localMaster || 'SETOR NÃO CADASTRADO').toUpperCase() !== (selectedLocation || "").toUpperCase()} isExternal={String(asset._empresaNormalizada).toUpperCase() !== String(selectedCompany).toUpperCase()} />
          ))
        ) : (
          <div className="py-24 text-center opacity-40 flex flex-col items-center">
            <Search size={64} className="mb-4 text-slate-700" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 text-center">Setor sem registros ativos</p>
            {committedSearch && <button onClick={handleIncludeManual} className="px-8 py-5 bg-purple-600 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest flex items-center space-x-3 shadow-2xl active:scale-95"><FilePlus size={20} /><span>Incluir Novo Manual</span></button>}
          </div>
        )}
      </div>
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border border-slate-800">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-600/20 text-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-purple-500/20"><FilePlus size={32} /></div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Novo Registro</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase mt-1 tracking-widest">Placa Coletada: {committedSearch || displayValue}</p>
            </div>
            <div className="space-y-6">
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 mb-2 space-y-1">
                 <div className="flex justify-between items-center"><span className="text-[8px] font-black text-slate-600 uppercase">Unidade</span><span className="text-[9px] font-black text-indigo-400 uppercase truncate max-w-[120px]">{selectedCompany}</span></div>
                 <div className="flex justify-between items-center"><span className="text-[8px] font-black text-slate-600 uppercase">Endereço Atual</span><span className="text-[9px] font-black text-indigo-400 uppercase truncate max-w-[120px]">{selectedLocation}</span></div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-purple-400 uppercase tracking-widest mb-2 ml-2">Descrição do Ativo</label>
                <textarea autoFocus rows={4} value={manualDescription} onChange={(e) => setManualDescription(e.target.value.toUpperCase())} className="w-full px-6 py-5 bg-slate-950 rounded-[1.8rem] border-2 border-slate-800 focus:border-purple-600 outline-none text-white text-sm font-bold uppercase transition-all resize-none shadow-inner" placeholder="EX: AR CONDICIONADO 12000 BTU..." />
              </div>
              <button onClick={onConfirmManualInclusion} disabled={!manualDescription.trim()} className="w-full py-5 bg-emerald-600 disabled:bg-slate-800 text-white rounded-[1.8rem] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-2"><Save size={18} strokeWidth={3} /><span>Finalizar Inclusão</span></button>
              <button onClick={() => setIsManualModalOpen(false)} className="w-full py-4 text-slate-500 font-black uppercase text-[9px] tracking-widest">Descartar</button>
            </div>
          </div>
        </div>
      )}
      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(val) => { setIsScannerOpen(false); setCommittedSearch(val.replace(/\D/g, '').slice(-6)); }} />}
    </div>
  );
};

export default Inventory;
