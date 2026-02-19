
import React, { useState, useMemo, useCallback } from 'react';
import { Asset, AppScreen } from '../types';
import Scanner from './Scanner';
import { 
  ArrowLeft, 
  MapPin, 
  Check,
  Keyboard, 
  Zap, 
  ChevronRight,
  Building2,
  Hash,
  Briefcase,
  AlertOctagon,
  Square,
  CheckSquare,
  ListChecks,
  Plus,
  Trash2,
  Search,
  X,
  AlertTriangle,
  FilePlus2,
  Calendar
} from 'lucide-react';

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

const formatEtiqueta = (val: any): string => {
  const s = String(val || '').trim();
  if (!s || s.toUpperCase() === 'ETIQUETAR') return s.toUpperCase();
  return s.padStart(6, '0');
};

interface AssetCardProps {
  asset: Asset;
  selectedLocation: string | null;
  onSelect: (a: Asset) => void;
  onMakeDecision: (id: string, decision: 'YES' | 'NO') => void;
  selectedCompany: string | null;
  isBatchMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

const AssetCard = React.memo(({ 
  asset, selectedLocation, onSelect, onMakeDecision, selectedCompany, isBatchMode, isSelected, onToggleSelect
}: AssetCardProps) => {
  const isConferido = !!asset._conferido;
  const normalize = (s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';
  
  const locAuditado = normalize(asset._localMaster || asset.ENDERECO || "");
  const locAtual = normalize(selectedLocation || "");
  
  const isDivergentLoc = locAuditado !== "" && locAtual !== "" && locAuditado !== locAtual;
  const companyKey = normalize(selectedCompany || '');
  const assetCompanyKey = normalize(asset.EMPRESA || '');
  const isDifferentCompany = selectedCompany && assetCompanyKey !== "" && assetCompanyKey !== companyKey;
  
  const statusUpper = String(asset.STATUS || '').toUpperCase();
  const isBaixado = statusUpper.includes('BAIXADO');

  // Determinar flag visual
  let visualStatus = asset.TAG_INVENTARIO || 'PENDENTE';
  if (isBaixado) visualStatus = 'BAIXADO';
  else if (isDifferentCompany) visualStatus = 'ADOTADO EXTERNO';
  else if (isConferido) visualStatus = isDivergentLoc ? 'RE-ADOTADO' : 'CONFERIDO';

  const getColors = () => {
    switch (visualStatus) {
      case 'BAIXADO': return { bg: 'bg-red-950/40', border: 'border-red-500/50', badge: 'bg-red-600 text-white animate-pulse', btn: 'bg-red-600 shadow-red-900/40', icon: AlertOctagon };
      case 'ADOTADO EXTERNO': return { bg: 'bg-sky-950/20', border: 'border-sky-400/60', badge: 'bg-sky-500 text-white font-black', btn: 'bg-sky-600 shadow-sky-900/40', icon: Building2 };
      case 'ADOTADO': return { bg: 'bg-blue-950/20', border: 'border-blue-400/40', badge: 'bg-blue-500 text-white', btn: 'bg-blue-600 shadow-blue-900/40', icon: MapPin };
      case 'RE-ADOTADO': return { bg: 'bg-indigo-950/20', border: 'border-indigo-400/40', badge: 'bg-indigo-500 text-white', btn: 'bg-indigo-600 shadow-indigo-900/40', icon: MapPin };
      case 'CONFERIDO': return { bg: 'bg-emerald-950/20', border: 'border-emerald-500/30', badge: 'bg-emerald-600 text-white', btn: 'bg-emerald-600 shadow-emerald-900/40', icon: Check };
      case 'FALTA ETIQUETAR': return { bg: 'bg-amber-950/20', border: 'border-amber-500/40', badge: 'bg-amber-600 text-white', btn: 'bg-amber-600 shadow-amber-900/40', icon: Hash };
      case 'ETIQUETADO': return { bg: 'bg-violet-950/20', border: 'border-violet-500/40', badge: 'bg-violet-600 text-white', btn: 'bg-violet-600 shadow-violet-900/40', icon: Check };
      case 'NOVO ITEM': return { bg: 'bg-orange-900/20', border: 'border-orange-500/40', badge: 'bg-orange-500 text-black font-black', btn: 'bg-orange-600 shadow-orange-900/40', icon: Plus };
      default: return { bg: 'bg-slate-900', border: 'border-slate-800', badge: 'bg-slate-800 text-white', btn: 'bg-sky-600 shadow-sky-900/40', icon: Check };
    }
  };

  const colors = getColors();

  const fullDescription = [
    asset.QT || '1',
    asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO',
    asset.SERIAL || 'S/N',
    formatMonthYearBR(asset.DATAAQUSIC),
    asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'
  ].join('; ');

  return (
    <div 
      className={`mb-4 p-5 border rounded-[2.2rem] relative overflow-hidden transition-all shadow-lg active:scale-[0.98] ${colors.bg} ${colors.border} ${isSelected ? 'ring-2 ring-emerald-500' : ''}`} 
      onClick={() => isBatchMode ? onToggleSelect(String(asset.id)) : onSelect(asset)}
    >
      {/* SELO SUPERIOR v24 */}
      <div className={`absolute top-0 left-0 px-4 py-1 rounded-br-[1.2rem] text-[8px] font-black uppercase shadow-md z-10 flex items-center space-x-2 ${colors.badge}`}>
        {isBatchMode ? (
          isSelected ? <CheckSquare size={10} className="text-white" /> : <Square size={10} className="text-white/50" />
        ) : (
          colors.icon && <colors.icon size={8} />
        )}
        <span>{asset.REGISTRO || '---'} / {asset.SUBREG || '---'} | {visualStatus}</span>
      </div>
      
      <div className="pt-6 pr-12 flex flex-col space-y-2.5">
        <div className="flex items-center space-x-1.5 mb-0.5">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Patrimônio:</span>
          <span className="text-lg font-black font-data tracking-tighter text-white">
            {formatEtiqueta(asset.ETIQUETA)}
          </span>
        </div>

        <p className="text-[10px] font-bold text-slate-200 uppercase italic leading-tight tracking-tight line-clamp-3">
          {fullDescription}
        </p>

        <div className="bg-black/30 p-3 rounded-[1.5rem] space-y-1.5 border border-white/5 shadow-inner">
          <div className="flex items-center space-x-2">
            <MapPin size={10} className="text-emerald-500 shrink-0" />
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tight truncate">{asset.ENDERECO || 'LOCAL NÃO INFORMADO'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Briefcase size={10} className="text-sky-500 shrink-0" />
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tight truncate">{asset.CENTRODECUSTO || 'C. CUSTO NÃO INFORMADO'}</span>
          </div>
        </div>

        {isDifferentCompany && (
          <div className="flex items-center space-x-2 px-3 py-1 bg-sky-500/20 border border-sky-500/30 rounded-full self-start">
            <Building2 size={8} className="text-sky-400" />
            <span className="text-[7px] font-black text-sky-400 uppercase tracking-widest">Divergência: {asset.EMPRESA}</span>
          </div>
        )}
      </div>

      {!isConferido && !isBatchMode && (
        <button 
          onClick={(e) => { e.stopPropagation(); onMakeDecision(String(asset.id), 'YES'); }} 
          className={`absolute bottom-5 right-5 w-12 h-12 rounded-2xl flex items-center justify-center text-white border-b-4 border-black/20 z-20 active:scale-90 transition-all ${colors.btn}`}
        >
          <Check size={28} strokeWidth={4} />
        </button>
      )}

      {isConferido && !isBatchMode && (
        <div className={`absolute bottom-5 right-5 w-8 h-8 ${isBaixado ? 'bg-red-600' : 'bg-emerald-500'} text-white rounded-xl flex items-center justify-center shadow-lg`}>
          <Check size={16} strokeWidth={4} />
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

const Inventory: React.FC<InventoryProps> = ({ assets, allAssets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, selectedLocation, setSelectedLocation, isInventorying, setIsInventorying, selectedCompany }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'checked'>('pending');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const normalizeKey = (s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';

  const filteredAssets = useMemo(() => {
    if (!selectedLocation) return [];
    const term = normalizeKey(committedSearch);
    const currentLocKey = normalizeKey(selectedLocation);
    // Fix: Changed 'normalize' to 'normalizeKey' as 'normalize' was not defined in this scope.
    const currentCompKey = normalizeKey(selectedCompany || '');

    // Se NÃO tem termo de busca, aplicamos Regra A: Esconde Baixados
    if (!term) {
      return assets.filter(a => {
        const locKey = normalizeKey(a.ENDERECO || "");
        const statusUpper = String(a.STATUS || '').toUpperCase();
        const isBaixado = statusUpper.includes('BAIXADO');
        
        if (isBaixado) return false; // REGRA A: Baixado não aparece na lista um clique

        if (activeFilter === 'checked') return !!a._conferido && locKey === currentLocKey;
        return !a._conferido && locKey === currentLocKey;
      }).sort((a, b) => normalizeKey(a.CENTRODECUSTO || '').localeCompare(normalizeKey(b.CENTRODECUSTO || ''), undefined, { numeric: true }));
    }

    // REGRA B e C: Quando há termo de busca
    // 1. Tentar buscar na empresa atual (incluindo baixados agora que houve busca manual)
    let companyMatches = assets.filter(a => 
      normalizeKey(a.ETIQUETA || '').includes(term) || 
      normalizeKey(a.NOTAFISCAL || '').includes(term) ||
      normalizeKey(a.REGISTRO || '').includes(term) ||
      normalizeKey(a.DESCRICAODOATIVO || '').includes(term)
    );

    // 2. Se não encontrou ou se quer varrer geral (Regra C)
    let globalMatches = allAssets.filter(a => {
        const etq = normalizeKey(a.ETIQUETA || '');
        // Busca exata ou parcial dependendo do tamanho do termo
        return term.length > 3 ? etq.includes(term) : etq === term;
        // Fix: Changed 'normalize' to 'normalizeKey' as 'normalize' was not defined in this scope.
    }).filter(a => normalizeKey(a.EMPRESA || '') !== currentCompKey);

    return [...companyMatches, ...globalMatches];
  }, [assets, allAssets, selectedLocation, committedSearch, activeFilter, selectedCompany]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const handleBatchConfirm = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Confirmar auditoria em lote para ${selectedIds.size} itens?`)) {
      onBulkUpdateAssets(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsBatchMode(false);
    }
  };

  const handleCreateNew = () => {
    const newAsset: Asset = {
        id: `manual_${Date.now()}`,
        EMPRESA: selectedCompany || "EMPRESA NAO INFORMADA",
        STATUS: "NOVO ITEM",
        TAG_INVENTARIO: "NOVO ITEM",
        ETIQUETA: committedSearch || "ETIQUETAR",
        DATAAQUSIC: new Date().toLocaleDateString('pt-BR'),
        ENDERECO: selectedLocation || "LOCAL NAO INFORMADO",
        _conferido: true,
        _isNew: true
    };
    if (confirm(`Deseja incluir "${newAsset.ETIQUETA}" como um NOVO REGISTRO fora da malha original?`)) {
        onUpdateAsset(newAsset);
        setCommittedSearch('');
        setDisplayValue('');
        onSelectAsset(newAsset);
    }
  };

  const locationsList = useMemo(() => {
    const stats: Record<string, { total: number; checked: number }> = {};
    assets.forEach(a => {
      let loc = String(a.ENDERECO || 'SEM LOCAL').trim().toUpperCase();
      if (!stats[loc]) stats[loc] = { total: 0, checked: 0 };
      stats[loc].total++; if (a._conferido) stats[loc].checked++;
    });
    return stats;
  }, [assets]);

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      {!isInventorying ? (
        <>
          <div className="px-6 pt-12 pb-6 bg-slate-900 border-b border-slate-800">
            <button onClick={onBack} className="flex items-center space-x-2 text-slate-500 font-black text-[10px] uppercase tracking-widest mb-4">
              <ArrowLeft size={16} /> <span>Voltar ao Menu</span>
            </button>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Mapeamento Geográfico</h1>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-2">Selecione uma localidade para auditoria</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-32 no-scrollbar">
            {Object.keys(locationsList).sort().map(loc => {
              const stats = locationsList[loc];
              const progress = Math.round((stats.checked / stats.total) * 100);
              const isStarted = stats.checked > 0;
              
              return (
                <button key={loc} onClick={() => { setSelectedLocation(loc); setIsInventorying(true); }} className="w-full bg-slate-900 border border-slate-800 rounded-[1.8rem] p-5 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden">
                  <div className={`absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out ${isStarted ? 'bg-gradient-to-r from-emerald-600/20 to-sky-600/10' : 'bg-slate-800/0'}`} style={{ width: `${progress}%` }} />
                  <div className="flex items-center space-x-3 relative z-10">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-colors ${isStarted ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/20' : 'bg-slate-950 text-sky-500 border-slate-800'}`}>
                      <MapPin size={18} />
                    </div>
                    <div className="text-left">
                      <span className="text-[12px] font-black uppercase block leading-none text-slate-100">{loc}</span>
                      <span className={`text-[8px] font-black uppercase mt-2 block ${isStarted ? 'text-emerald-500' : 'text-slate-600'}`}>{stats.checked} / {stats.total} ITENS ({progress}%)</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-800 relative z-10" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="px-6 pt-10 pb-3 bg-slate-900 border-b border-slate-800 shadow-xl z-20">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { setIsInventorying(false); setIsBatchMode(false); setSelectedIds(new Set()); setCommittedSearch(''); }} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-400">
                <MapPin size={10} className="text-emerald-500" />
                <span className="text-[10px] font-black uppercase truncate italic">{selectedLocation}</span>
              </button>
              <div className="flex space-x-2">
                <button onClick={() => setIsBatchMode(!isBatchMode)} className={`p-2 rounded-lg border transition-all ${isBatchMode ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'border-slate-800 text-slate-600'}`}>
                  <ListChecks size={14} />
                </button>
                <button onClick={() => setInputMethod('keyboard')} className={`p-2 rounded-lg border ${inputMethod === 'keyboard' ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-800 text-slate-600'}`}><Keyboard size={14} /></button>
                <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2 rounded-lg border ${inputMethod === 'scanner' ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-800 text-slate-600'}`}><Zap size={14} /></button>
              </div>
            </div>

            <div className="relative mb-3">
              <input type="text" value={displayValue} onChange={(e) => setDisplayValue(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && setCommittedSearch(displayValue)} className="w-full bg-slate-950 border-2 border-slate-800 px-5 py-3.5 font-black font-mono text-xl text-center rounded-2xl text-white outline-none focus:border-sky-500 transition-all" placeholder="DIGITE ETIQUETA..." />
              {displayValue && (
                  <button onClick={() => { setDisplayValue(''); setCommittedSearch(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700 active:text-white"><X size={20} /></button>
              )}
            </div>

            <div className="flex space-x-2">
              <button onClick={() => { setActiveFilter('pending'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeFilter === 'pending' ? 'bg-white text-slate-950 border-white' : 'text-slate-600 border-slate-800'}`}>Pendentes</button>
              <button onClick={() => { setActiveFilter('checked'); setCommittedSearch(''); setDisplayValue(''); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeFilter === 'checked' ? 'bg-sky-600 text-white border-sky-600' : 'text-slate-600 border-slate-800'}`}>Inventariado</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar pb-44 bg-slate-950">
            {filteredAssets.length > 0 ? (
                filteredAssets.map(asset => (
                <AssetCard key={asset.id} asset={asset} selectedLocation={selectedLocation} onSelect={onSelectAsset} onMakeDecision={(id) => onBulkUpdateAssets([id])} selectedCompany={selectedCompany} isBatchMode={isBatchMode} isSelected={selectedIds.has(String(asset.id))} onToggleSelect={toggleSelect} />
                ))
            ) : committedSearch ? (
                <div className="py-20 flex flex-col items-center justify-center text-center animate-fadeIn">
                    <div className="w-20 h-20 bg-orange-900/20 border border-orange-500/30 rounded-full flex items-center justify-center text-orange-500 mb-6 shadow-2xl">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter italic">Nenhum Registro Localizado</h3>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2 max-w-[200px]">Etiqueta "{committedSearch}" não consta na malha GBR v24 (Ativa ou Baixada)</p>
                    
                    <button onClick={handleCreateNew} className="mt-10 px-8 py-5 bg-orange-600 text-white rounded-[1.8rem] flex items-center space-x-3 shadow-2xl active:scale-95 transition-all">
                        <FilePlus2 size={20} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Incluir como Novo Item</span>
                    </button>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center opacity-20 text-center">
                    <Search size={48} className="mb-4 text-slate-500" />
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Aguardando Auditoria</p>
                </div>
            )}
          </div>
        </>
      )}

      {isBatchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-6 right-6 z-50 animate-slideUp">
           <div className="bg-emerald-600 p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between border-t border-white/20">
              <div className="flex items-center space-x-3">
                 <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-data font-black">{selectedIds.size}</div>
                 <div className="text-white">
                   <p className="text-[10px] font-black uppercase tracking-widest leading-none">Conferência em Lote</p>
                 </div>
              </div>
              <div className="flex space-x-2">
                 <button onClick={() => setSelectedIds(new Set())} className="p-3 bg-black/20 text-white rounded-xl active:scale-90"><X size={20} /></button>
                 <button onClick={handleBatchConfirm} className="px-6 py-3 bg-white text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95">Conferir</button>
              </div>
           </div>
        </div>
      )}
      
      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(text) => { setDisplayValue(text.toUpperCase()); setCommittedSearch(text.toUpperCase()); setIsScannerOpen(false); }} />}
    </div>
  );
};

export default Inventory;
