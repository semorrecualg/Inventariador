
import React, { useState, useMemo, useCallback } from 'react';
import { Asset, TagInventario, ScannerMode, ScanFeedbackMode } from '../types';
import Scanner from './Scanner';

import { 
  ArrowLeft, 
  Check,
  Filter,
  Trash2,
  ListChecks,
  Square,
  CheckSquare,
  X,
  Camera,
} from 'lucide-react';

const parseAssetDate = (val: string | number | null | undefined): Date | null => {
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

const formatMonthYearBR = (val: string | number | null | undefined): string => {
  const date = parseAssetDate(val);
  if (date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  }
  return String(val || '').toUpperCase();
};

const formatEtiqueta = (val: string | number | null | undefined): string => {
  const s = String(val || '').trim();
  if (!s || s.toUpperCase() === 'ETIQUETAR') return s.toUpperCase();
  return s.padStart(6, '0');
};

interface LabelingProps {
  assets: Asset[];
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[], updates?: Partial<Asset>) => void;
  onSelectAsset: (asset: Asset) => void;
  uniqueCentrosDeCusto: string[];
  selectedCompany: string | null;
  scannerMode: ScannerMode;
  onUpdateScannerMode: (mode: ScannerMode) => void;
  scanFeedbackMode: ScanFeedbackMode;
}

const Labeling: React.FC<LabelingProps> = ({ assets, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, scannerMode, onUpdateScannerMode, scanFeedbackMode }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'checked'>('pending');
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  
  // Lote
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [advDesc, setAdvDesc] = useState('');
  const [advCC, setAdvCC] = useState('');
  const [advSupplier, setAdvSupplier] = useState('');
  const [advDateStart, setAdvDateStart] = useState('');
  const [advDateEnd, setAdvDateEnd] = useState('');

  const normalize = (s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';

  const assetsToLabel = useMemo(() => {
    return assets.filter(a => 
      String(a.ETIQUETA || '').toUpperCase().includes('ETIQUETAR') || 
      String(a._plaquetaMaster || '').toUpperCase() === 'ETIQUETAR' ||
      a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR ||
      a.TAG_INVENTARIO === TagInventario.ETIQUETADO ||
      a._plaquetado === true
    );
  }, [assets]);

  const pendingAssetsToLabel = useMemo(() => {
    return assetsToLabel.filter(a => !a._conferido);
  }, [assetsToLabel]);

  const restrictedSuppliersList = useMemo(() => {
    const set = new Set<string>();
    pendingAssetsToLabel.forEach(a => { if (a.NOMEFORNECEDOR) set.add(String(a.NOMEFORNECEDOR).toUpperCase().trim()); });
    return Array.from(set).sort();
  }, [pendingAssetsToLabel]);

  const restrictedCentrosDeCusto = useMemo(() => {
    const set = new Set<string>();
    pendingAssetsToLabel.forEach(a => { if (a.CENTRODECUSTO) set.add(String(a.CENTRODECUSTO).toUpperCase().trim()); });
    return Array.from(set).sort();
  }, [pendingAssetsToLabel]);

  const filteredAssets = useMemo(() => {
    let base = [...assetsToLabel];
    if (activeTab === 'checked') base = base.filter(a => !!a._conferido);
    else base = base.filter(a => !a._conferido);

    if (advDesc) {
       const term = normalize(advDesc);
       base = base.filter(a => 
         normalize(a.DESCRICAODOATIVO || '').includes(term) || 
         normalize(a.SERIAL || '').includes(term) ||
         normalize(a.ETIQUETA || '').includes(term) ||
         normalize(a.NOTAFISCAL || '').includes(term) ||
         normalize(a.REGISTRO || '').includes(term)
       );
    }
    if (advCC) base = base.filter(a => normalize(String(a.CENTRODECUSTO || '')) === normalize(advCC));
    if (advSupplier) base = base.filter(a => normalize(String(a.NOMEFORNECEDOR || '')) === normalize(advSupplier));
    
    if (advDateStart || advDateEnd) {
      const start = advDateStart ? new Date(advDateStart) : null;
      const end = advDateEnd ? new Date(advDateEnd) : null;
      base = base.filter(a => {
        const ad = parseAssetDate(a.DATAAQUSIC);
        if (!ad) return false;
        if (start && ad < start) return false;
        if (end && ad > end) return false;
        return true;
      });
    }

    return base.sort((a, b) => 
      normalize(a.CENTRODECUSTO || '').localeCompare(normalize(b.CENTRODECUSTO || ''), undefined, { numeric: true })
    );
  }, [assetsToLabel, activeTab, advDesc, advCC, advSupplier, advDateStart, advDateEnd]);

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
    
    // Feedback tátil/visual imediato
    const ids = Array.from(selectedIds);
    onBulkUpdateAssets(ids);
    
    setSelectedIds(new Set());
    setIsBatchMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = filteredAssets.map(a => String(a.id));
      setSelectedIds(new Set(allIds));
    }
  };

  const handleConfirmAllFiltered = () => {
    const pending = filteredAssets.filter(a => !a._conferido);
    if (pending.length === 0) return;
    
    const ids = pending.map(a => String(a.id));
    onBulkUpdateAssets(ids);
  };

  const getColors = (tag: string) => {
    switch (tag) {
      case TagInventario.ETIQUETADO: 
        return { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-600', hex: '#7c3aed' };
      case TagInventario.FALTA_ETIQUETAR: 
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-600', hex: '#d97706' };
      default:
        return { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-600', hex: '#e2e8f0' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-6 bg-white border-b border-slate-200 shadow-sm relative z-30">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center space-x-3 text-slate-400 font-bold text-[12px] uppercase tracking-widest active:text-amber-600 transition-colors">
            <ArrowLeft size={20} /> <span>Menu Principal</span>
          </button>
          <div className="flex space-x-3">
            {isBatchMode && (
              <button 
                onClick={toggleSelectAll} 
                className={`flex items-center space-x-3 px-4 py-3 rounded-2xl border transition-all shadow-sm active:scale-95 ${selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                <span className="text-[11px] font-bold uppercase tracking-widest">Todos</span>
              </button>
            )}
            <button onClick={() => { setIsBatchMode(!isBatchMode); setSelectedIds(new Set()); }} className={`p-4 rounded-2xl border transition-all shadow-sm active:scale-95 ${isBatchMode ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-900/20' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <ListChecks size={20} />
            </button>

            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-4 rounded-2xl border transition-all shadow-sm active:scale-95 ${isFilterOpen ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <Filter size={20} />
            </button>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none mb-6">Bens a Etiquetar</h1>

        {isFilterOpen && (
          <div className="space-y-4 mb-6 animate-slideUp bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-inner">
            <div className="flex items-center justify-between mb-2 px-1">
               <span className="text-[10px] font-bold uppercase text-amber-600 tracking-[0.2em]">Painel Inteligente</span>
               <div className="flex space-x-3">
                 {activeTab === 'pending' && filteredAssets.length > 1 && !isBatchMode && (
                    <button onClick={handleConfirmAllFiltered} className="text-[9px] font-bold text-violet-600 uppercase tracking-widest px-4 py-2 bg-violet-50 border border-violet-100 rounded-xl active:scale-95 transition-all shadow-sm">Conferir Todos</button>
                 )}
                 <button onClick={() => { setAdvDesc(''); setAdvCC(''); setAdvSupplier(''); setAdvDateStart(''); setAdvDateEnd(''); }} className="flex items-center space-x-2 text-[10px] font-bold text-red-600 uppercase tracking-widest px-5 py-3 bg-red-50 border border-red-100 rounded-xl active:scale-95 transition-all shadow-sm">
                   <Trash2 size={16} /> <span>Limpar</span>
                 </button>
               </div>
            </div>
            
            {/* BARRA DE AÇÃO LOTE ETIQUETAR - TOPO PARA FLUIDEZ */}
            {isBatchMode && selectedIds.size > 0 && (
              <div className="mb-4 animate-slideDown">
                 <div className="bg-amber-600 p-3 rounded-2xl shadow-lg flex items-center justify-between border border-white/20">
                    <div className="flex items-center space-x-3 pl-2">
                       <span className="text-xl font-black text-white tracking-tighter">{selectedIds.size}</span>
                       <span className="text-[9px] font-bold text-amber-100 uppercase tracking-widest">Selecionados</span>
                    </div>
                    <div className="flex items-center space-x-2">
                       <button onClick={() => setSelectedIds(new Set())} className="p-2 bg-black/20 text-white rounded-xl"><X size={16} /></button>
                       <button onClick={handleBatchConfirm} className="px-6 py-2 bg-white text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all">Confirmar Lote</button>
                    </div>
                 </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[9px] font-bold uppercase text-slate-400 tracking-widest ml-1 block">Busca (Descrição/Serial/NF/Reg)</label>
              <div className="relative">
                <input type="text" value={advDesc} onChange={(e) => setAdvDesc(e.target.value)} placeholder="PESQUISAR..." className="w-full bg-white border border-slate-200 pl-4 pr-12 py-3 rounded-2xl text-[11px] font-bold uppercase text-slate-900 outline-none focus:border-amber-500 shadow-sm transition-all" />
                <button 
                  onClick={() => setIsScannerOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-amber-600 text-white rounded-xl shadow-md active:scale-95 transition-all"
                >
                  <Camera size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase text-slate-400 tracking-widest ml-1 block">Centro de Custo</label>
                <select value={advCC} onChange={(e) => setAdvCC(e.target.value)} className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl text-[10px] font-bold uppercase text-slate-900 outline-none focus:border-amber-500 shadow-sm">
                  <option value="">TODOS</option>
                  {restrictedCentrosDeCusto.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase text-slate-400 tracking-widest ml-1 block">Fornecedor</label>
                <select value={advSupplier} onChange={(e) => setAdvSupplier(e.target.value)} className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl text-[10px] font-bold uppercase text-slate-900 outline-none focus:border-amber-500 shadow-sm">
                  <option value="">TODOS</option>
                  {restrictedSuppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="flex space-x-3">
          <button onClick={() => setActiveTab('pending')} className={`flex-1 py-4 rounded-2xl text-[11px] font-bold uppercase border transition-all shadow-sm ${activeTab === 'pending' ? 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-900/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Pendentes</button>
          <button onClick={() => setActiveTab('checked')} className={`flex-1 py-4 rounded-2xl text-[11px] font-bold uppercase border transition-all shadow-sm ${activeTab === 'checked' ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-900/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Etiquetados</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar pb-32 bg-bg-main">
        {filteredAssets.map(asset => {
          const isSelected = selectedIds.has(String(asset.id));
          const fullDescription = [asset.QT || '1', asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO', asset.SERIAL || 'S/N', formatMonthYearBR(asset.DATAAQUSIC), asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'].join('; ');

          const isConferido = !!asset._conferido;
          const tagDisplay = asset.TAG_INVENTARIO || (isConferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR);
          const colors = getColors(tagDisplay);

          const statusUpper = String(asset.STATUS || '').toUpperCase();
          const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

          return (
            <div 
              key={asset.id} 
              onClick={() => isBatchMode ? toggleSelect(String(asset.id)) : onSelectAsset(asset)} 
              className={`p-6 border-l-4 rounded-[2.5rem] relative overflow-hidden transition-all active:scale-[0.98] shadow-sm modern-card ${isBaixado ? 'bg-red-50 border-red-200' : colors.bg + ' ' + colors.border} ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
              style={{ borderLeftColor: isBaixado ? '#dc2626' : colors.hex }}
            >
              <div className={`absolute top-0 left-0 px-5 py-2 rounded-br-2xl text-[9px] font-bold uppercase ${isBaixado ? 'bg-red-600' : colors.badge} text-white shadow-md z-10 flex items-center space-x-2`}>
                {isBatchMode ? (
                  isSelected ? <CheckSquare size={12} /> : <Square size={12} className="text-white/50" />
                ) : null}
                <span className="tracking-widest">{asset.REGISTRO || '---'} / {asset.SUBREG || '---'} | {isBaixado ? 'BAIXADO | ' : ''}{tagDisplay}</span>
              </div>
              
              <div className="pt-8 flex flex-col space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio:</span>
                  <span className="text-xl font-bold font-mono tracking-tighter text-slate-900">{formatEtiqueta(asset.ETIQUETA)}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-600 uppercase leading-relaxed tracking-tight line-clamp-3 italic">{fullDescription}</p>
                
                {asset._camposAlterados && asset._camposAlterados.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auditoria DE/PARA:</p>
                    {asset._camposAlterados.map(field => (
                      <div key={field} className="flex flex-col bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-bold text-slate-400 uppercase">{String(field)}</span>
                          <span className="text-[10px] font-bold text-emerald-600 uppercase">PARA: {String(asset[field] || '---')}</span>
                        </div>
                        {asset._valoresOriginais?.[field] !== undefined && (
                          <span className="text-[9px] text-red-500 font-bold uppercase italic mt-1">DE: {String(asset._valoresOriginais[field] || '---')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!asset._conferido && !isBatchMode && (
                <button onClick={(e) => { 
                  e.stopPropagation(); 
                  onUpdateAsset({
                    ...asset,
                    _conferido: true,
                    TAG_INVENTARIO: TagInventario.ETIQUETADO,
                    _plaquetado: true
                  });
                }} className="absolute bottom-6 right-6 w-14 h-14 bg-amber-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-amber-900/20 active:scale-90 transition-all">
                  <Check size={32} strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* REMOVIDO BARRA INFERIOR PARA EVITAR SCROLL */}
      {isScannerOpen && (
        <Scanner 
          mode={scannerMode}
          onModeChange={onUpdateScannerMode}
          onScan={(result) => {
            setAdvDesc(result);
            setIsScannerOpen(false);
          }}
          onClose={() => setIsScannerOpen(false)}
          scanFeedbackMode={scanFeedbackMode}
        />
      )}
    </div>
  );
};

export default Labeling;
