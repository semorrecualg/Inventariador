
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  Search, 
  ArrowLeft, 
  MapPin, 
  AlertCircle,
  AlertTriangle,
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
        if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim().toUpperCase();
      }
    }
    return "";
  };

  const plaqueta = getVal(asset, plaquetaTerms) || "S/P";
  const desc = getVal(asset, descTerms) || "DESCRIÇÃO NÃO ENCONTRADA";
  const isConferido = !!asset._conferido;
  const isNew = !!asset._isNew;

  return (
    <div 
      onClick={() => onSelect(asset)} 
      className={`flex flex-col p-5 border transition-all mb-4 rounded-[2.2rem] shadow-sm
        ${decision === 'YES' ? 'bg-emerald-100 border-emerald-500 ring-4 ring-emerald-500/10' : 
          decision === 'NO' ? 'bg-gray-100 border-gray-300 opacity-60' : 
          isConferido ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/30 border-red-100'}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-3 px-4 py-2 rounded-full border-2 transition-all
              ${isConferido || decision === 'YES' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-red-100 border-red-200 text-red-800'}`}>
              <span className="text-[9px] font-black uppercase opacity-60">ATIVO</span>
              <span className="text-xl font-black tracking-tighter leading-none">{plaqueta}</span>
            </div>
            {isNew && <span className="text-[8px] font-black bg-purple-600 text-white px-3 py-1.5 rounded-xl uppercase tracking-widest animate-pulse">INCLUSÃO</span>}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {!isConferidoTab && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'NO'); }} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-md active:scale-90 ${decision === 'NO' ? 'bg-gray-800 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}><X size={24} strokeWidth={3} /></button>
              <button ref={yesButtonRef} onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-90 focus:ring-4 focus:ring-emerald-200 ${decision === 'YES' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-500 border-2 border-emerald-100'}`}><Check size={32} strokeWidth={4} /></button>
            </>
          )}
          {isConferidoTab && <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg"><Check size={24} strokeWidth={4} /></div>}
        </div>
      </div>

      <h3 className={`text-[13px] font-black uppercase leading-snug mb-4 px-1 ${isConferido ? 'text-emerald-950' : 'text-red-950'}`}>{desc}</h3>

      <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-start space-x-3 ${isConferido ? 'bg-emerald-600/5 border-emerald-200/40' : 'bg-red-600/5 border-red-200/40'}`}>
        <Building2 size={14} className={isConferido ? 'text-emerald-600 shrink-0 mt-0.5' : 'text-red-500 shrink-0 mt-0.5'} />
        <div className="min-w-0 flex-1">
          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-1">Unidade Operacional</span>
          <span className={`text-[10px] font-black uppercase tracking-tight leading-snug block truncate ${isConferido ? 'text-emerald-900' : 'text-red-900'}`}>
             {getVal(asset, ['EMPRESA', 'RAZAO_SOCIAL', 'UNIDADE', 'RAZAO', 'CLIENTE']) || 'NÃO IDENTIFICADA'}
          </span>
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

  const plaquetaTerms = ['PLAQUETA', 'PATRIMONIO', 'BEM', 'TAG', 'REGISTRO'];
  const locationTerms = ['ENDERECO', 'LOCALIZACAO', 'SETOR', 'COD_END'];

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
    let results: Asset[] = committedSearch 
      ? allAssets.filter(a => {
          const p = getPlaqueta(a).toUpperCase();
          const s = committedSearch.toUpperCase().trim();
          return p === s || p.padStart(6, '0') === s.padStart(6, '0');
        })
      : assets.filter(a => getItemLocation(a) === selectedLocation || a.TAG_ADOCAO === "ADOTADO");

    return results
      .filter(a => activeFilter === 'pending' ? !a._conferido : !!a._conferido)
      .sort((a, b) => getPlaqueta(a).localeCompare(getPlaqueta(b), undefined, { numeric: true }));
  }, [allAssets, assets, selectedLocation, committedSearch, activeFilter, getItemLocation, getPlaqueta]);

  const triggerSearch = (val: string) => {
    const searchedGlobally = allAssets.find(a => {
        const p = getPlaqueta(a).toUpperCase();
        const s = val.toUpperCase().trim();
        return p === s || p.padStart(6, '0') === s.padStart(6, '0');
    });

    if (searchedGlobally && searchedGlobally._conferido && activeFilter === 'pending') {
        alert(`O ativo ${val} já foi CONFERIDO anteriormente.`);
        setActiveFilter('checked');
        setCommittedSearch(val);
        setLocalDecisions({});
        searchInputRef.current?.blur();
        return;
    }

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
    // LÓGICA DE 1 CLIQUE: Se for registro único, salva e limpa
    if (filteredAssetsInLocation.length === 1 && decision === 'YES') {
        onBulkUpdateAssets([id]);
        resetSearchAndFocus();
        return;
    }
    setLocalDecisions(prev => ({ ...prev, [id]: decision }));
  }, [filteredAssetsInLocation, onBulkUpdateAssets, resetSearchAndFocus]);

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

  if (!isInventorying) {
    return (
      <div className="flex flex-col h-full bg-white animate-fadeIn">
        <div className="p-6 pb-2">
          <button onClick={onBack} className="mb-4 text-gray-400 text-[9px] font-black uppercase tracking-widest flex items-center space-x-1"><ArrowLeft size={12} /> <span>Voltar ao Menu</span></button>
          <h2 className="text-2xl font-black text-black uppercase mb-6">Locais do Inventário</h2>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input type="text" placeholder="FILTRAR LOCAL..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value.toUpperCase())} className="w-full pl-10 pr-4 py-4 bg-gray-50 rounded-2xl text-[10px] font-black uppercase outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10 space-y-4">
          {Object.keys(locationStats).sort().filter(l => l.includes(locationSearch)).map(loc => {
            const stats = locationStats[loc];
            const percent = Math.round((stats.checked / stats.total) * 100);
            return (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className={`w-full flex items-center justify-between p-6 rounded-[2.2rem] border transition-all ${percent === 100 ? 'bg-gray-50 opacity-60' : stats.checked > 0 ? 'bg-gray-900 text-white' : 'bg-white shadow-sm'}`}>
                <div className="flex items-center space-x-4 text-left">
                  <div className={`p-3 rounded-2xl ${stats.checked > 0 ? 'bg-white/10 text-blue-400' : 'bg-gray-100 text-gray-400'}`}><MapPin size={20} /></div>
                  <div><span className="text-[13px] font-black uppercase truncate block">{loc}</span><span className="text-[8px] font-black opacity-40 uppercase">{stats.checked}/{stats.total} ITENS</span></div>
                </div>
                <span className="text-[11px] font-black">{percent}%</span>
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
          <button onClick={() => { setIsInventorying(false); resetSearchAndFocus(); }} className="text-gray-400 text-[9px] font-black uppercase flex items-center space-x-1"><ArrowLeft size={12} /> <span>Trocar Local</span></button>
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
             <button onClick={() => setInputMethod('keyboard')} className={`px-4 py-1.5 rounded-lg flex items-center space-x-2 ${inputMethod === 'keyboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><Keyboard size={12} /><span className="text-[8px] font-black uppercase tracking-widest">Teclado</span></button>
             <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`px-4 py-1.5 rounded-lg flex items-center space-x-2 ${inputMethod === 'scanner' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400'}`}><Zap size={12} /><span className="text-[8px] font-black uppercase tracking-widest">Scanner</span></button>
          </div>
        </div>
        
        <div className="relative mb-5">
          <input ref={searchInputRef} type="text" inputMode="numeric" value={displayValue} onChange={(e) => { const r = e.target.value.replace(/\D/g, ''); setDisplayValue(r.length > 6 ? r.slice(-6) : r.padStart(6, '0')); setTimeout(forceCursorRight, 0); }} onFocus={() => setTimeout(forceCursorRight, 0)} onSelect={forceCursorRight} onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)} className="w-full pl-20 pr-32 py-7 text-4xl font-black uppercase outline-none border-2 border-blue-100 bg-white rounded-[2.2rem] focus:border-blue-500 transition-all text-blue-950" />
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[7px] font-black text-blue-300 uppercase pointer-events-none">Nº ATIVO</div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2"><button onClick={() => triggerSearch(displayValue)} className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95"><Search size={28} strokeWidth={3} /></button></div>
        </div>

        <div className="flex space-x-4 px-2">
          <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); }} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all border-b-4 ${activeFilter === 'pending' ? 'bg-red-50 border-red-600 text-red-900 shadow-inner' : 'bg-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase">Pendentes ({locationStats[selectedLocation!] ? locationStats[selectedLocation!].total - locationStats[selectedLocation!].checked : 0})</span>
          </button>
          <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); }} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all border-b-4 ${activeFilter === 'checked' ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-inner' : 'bg-transparent text-gray-300'}`}>
            <span className="text-[10px] font-black uppercase">Conferidos ({locationStats[selectedLocation!]?.checked || 0})</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-6 no-scrollbar pb-40 transition-colors duration-500 ${activeFilter === 'pending' ? 'bg-white' : 'bg-emerald-50/20'}`}>
        {filteredAssetsInLocation.length > 0 ? (
          <div className="mt-4 space-y-4">
            {filteredAssetsInLocation.map((asset, index) => (
              <AssetCard key={asset.id} asset={asset} onSelect={onSelectAsset} plaquetaTerms={plaquetaTerms} descTerms={['DESC_SINTETICA', 'DESCRICAO', 'NOME']} decision={localDecisions[String(asset.id)] || null} onMakeDecision={handleMakeDecision} yesButtonRef={index === 0 ? firstYesButtonRef : undefined} isConferidoTab={activeFilter === 'checked'} />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center opacity-30 flex flex-col items-center">
            {committedSearch ? <AlertCircle size={40} className="mb-4" /> : <Info size={40} className="mb-4" />}
            <p className="text-[10px] font-black uppercase tracking-widest">{committedSearch ? `Ativo ${committedSearch} não encontrado aqui` : 'Aguardando ação'}</p>
          </div>
        )}
      </div>

      {(filteredAssetsInLocation.length > 1 && Object.keys(localDecisions).length > 0) && (
        <div className="fixed bottom-6 left-6 right-6 z-40 animate-slideUp">
           <button onClick={() => { onBulkUpdateAssets(Object.entries(localDecisions).filter(([_, d]) => d === 'YES').map(([id]) => id)); resetSearchAndFocus(); }} className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase shadow-2xl flex items-center justify-center space-x-3 active:scale-95"><Save size={24} /><span>Salvar Alterações ({Object.keys(localDecisions).length})</span></button>
        </div>
      )}

      {showNewAssetDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><AlertCircle size={32} /></div>
            <h3 className="text-xl font-black text-gray-900 uppercase mb-2">Plaqueta Inexistente</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed mb-8">O ativo <span className="text-red-600 font-black">{committedSearch}</span> não consta na base. Deseja incluir?</p>
            <div className="space-y-3">
              <button onClick={() => { setNewAssetData({ description: '', plaqueta: committedSearch }); setShowNewAssetDialog(false); setIsCreatingNewAsset(true); }} className="w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase flex items-center justify-center space-x-2"><PlusCircle size={18} /><span>Sim, Incluir Novo</span></button>
              <button onClick={resetSearchAndFocus} className="w-full py-4 bg-gray-100 text-gray-500 rounded-[1.5rem] font-black uppercase text-[10px]">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {isCreatingNewAsset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative overflow-hidden">
             <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white"><FilePlus size={24} /></div>
                <div><h3 className="text-xl font-black text-gray-900 uppercase">Inclusão</h3><p className="text-[8px] font-black text-purple-600 uppercase mt-1">Novo Ativo Manual</p></div>
             </div>
             <div className="space-y-5">
                <div><label className="block text-[8px] font-black text-gray-400 uppercase mb-1.5">Etiqueta Lida</label><div className="px-5 py-4 bg-gray-50 rounded-2xl font-black text-blue-600 text-lg">{newAssetData.plaqueta}</div></div>
                <div><label className="block text-[8px] font-black text-gray-400 uppercase mb-1.5">Descrição do Item</label><textarea autoFocus rows={3} placeholder="EX: CADEIRA..." value={newAssetData.description} onChange={(e) => setNewAssetData({...newAssetData, description: e.target.value})} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-purple-500 focus:bg-white outline-none font-bold text-xs uppercase shadow-inner" /></div>
                <div className="flex space-x-3 pt-2">
                   <button onClick={resetSearchAndFocus} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px]">Sair</button>
                   <button onClick={() => { onUpdateAsset({ id: `new_${Date.now()}`, PLAQUETA: newAssetData.plaqueta, DESCRICAO: newAssetData.description.toUpperCase(), EMPRESA: selectedCompany || "", LOCALIZACAO: selectedLocation || "", _isNew: true, _conferido: true }); resetSearchAndFocus(); }} className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl font-black uppercase flex items-center justify-center space-x-2"><Save size={14} /><span>Salvar Ativo</span></button>
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
