
import React, { useState, useMemo, useCallback } from 'react';
import { Asset, TagInventario } from '../types';

import { 
  ArrowLeft, 
  Check,
  Filter,
  Trash2,
  ListChecks,
  Square,
  CheckSquare,
  X,
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
  onBulkUpdateAssets: (ids: string[]) => void;
  onSelectAsset: (asset: Asset) => void;
  uniqueCentrosDeCusto: string[];
  selectedCompany: string | null;
}

const Labeling: React.FC<LabelingProps> = ({ assets, onBack, onUpdateAsset, onSelectAsset }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'checked'>('pending');
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  
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
      normalize(a.ETIQUETA || '') === 'ETIQUETAR' || 
      a.TAG_INVENTARIO === TagInventario.FALTA_ETIQUETAR
    );
  }, [assets]);

  const restrictedSuppliersList = useMemo(() => {
    const set = new Set<string>();
    assetsToLabel.forEach(a => { if (a.NOMEFORNECEDOR) set.add(String(a.NOMEFORNECEDOR).toUpperCase().trim()); });
    return Array.from(set).sort();
  }, [assetsToLabel]);

  const restrictedCentrosDeCusto = useMemo(() => {
    const set = new Set<string>();
    assetsToLabel.forEach(a => { if (a.CENTRODECUSTO) set.add(String(a.CENTRODECUSTO).toUpperCase().trim()); });
    return Array.from(set).sort();
  }, [assetsToLabel]);

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
    if (confirm(`Confirmar emplaquetamento em lote para ${selectedIds.size} itens?`)) {
      const ids = Array.from(selectedIds);
      ids.forEach(id => {
        const asset = assets.find(a => String(a.id) === id);
        if (asset) {
          onUpdateAsset({
            ...asset,
            _conferido: true,
            TAG_INVENTARIO: TagInventario.ETIQUETADO,
            _plaquetado: true
          });
        }
      });
      setSelectedIds(new Set());
      setIsBatchMode(false);
    }
  };

  const handleConfirmAllFiltered = () => {
    const pending = filteredAssets.filter(a => !a._conferido);
    if (pending.length === 0) return;
    if (confirm(`Deseja emplaquetar TODOS os ${pending.length} itens desta busca?`)) {
      pending.forEach(asset => {
        onUpdateAsset({
          ...asset,
          _conferido: true,
          TAG_INVENTARIO: TagInventario.ETIQUETADO,
          _plaquetado: true
        });
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn overflow-hidden">
      <div className="px-6 pt-12 pb-6 bg-white border-b border-slate-200 shadow-sm relative z-30">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center space-x-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest active:text-amber-600 transition-colors">
            <ArrowLeft size={16} /> <span>Menu Principal</span>
          </button>
          <div className="flex space-x-2">
            <button onClick={() => setIsBatchMode(!isBatchMode)} className={`p-3 rounded-2xl border transition-all shadow-sm active:scale-95 ${isBatchMode ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-900/20' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <ListChecks size={16} />
            </button>

            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-3 rounded-2xl border transition-all shadow-sm active:scale-95 ${isFilterOpen ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <Filter size={16} />
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
                    <button onClick={handleConfirmAllFiltered} className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl active:scale-95 transition-all shadow-sm">Conferir Todos</button>
                 )}
                 <button onClick={() => { setAdvDesc(''); setAdvCC(''); setAdvSupplier(''); setAdvDateStart(''); setAdvDateEnd(''); }} className="flex items-center space-x-2 text-[9px] font-bold text-red-600 uppercase tracking-widest px-4 py-2 bg-red-50 border border-red-100 rounded-xl active:scale-95 transition-all shadow-sm">
                   <Trash2 size={12} /> <span>Limpar</span>
                 </button>
               </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold uppercase text-slate-400 tracking-widest ml-1 block">Busca (Descrição/Serial/NF/Reg)</label>
              <input type="text" value={advDesc} onChange={(e) => setAdvDesc(e.target.value)} placeholder="PESQUISAR..." className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl text-[11px] font-bold uppercase text-slate-900 outline-none focus:border-amber-500 shadow-sm transition-all" />
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
          <button onClick={() => setActiveTab('checked')} className={`flex-1 py-4 rounded-2xl text-[11px] font-bold uppercase border transition-all shadow-sm ${activeTab === 'checked' ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Etiquetados</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar pb-32 bg-bg-main">
        {filteredAssets.map(asset => {
          const isSelected = selectedIds.has(String(asset.id));
          const fullDescription = [asset.QT || '1', asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO', asset.SERIAL || 'S/N', formatMonthYearBR(asset.DATAAQUSIC), asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'].join('; ');

          return (
            <div 
              key={asset.id} 
              onClick={() => isBatchMode ? toggleSelect(String(asset.id)) : onSelectAsset(asset)} 
              className={`p-6 border rounded-[2.5rem] relative overflow-hidden transition-all bg-white border-slate-200 active:scale-[0.98] shadow-sm modern-card ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
            >
              <div className={`absolute top-0 left-0 px-5 py-2 rounded-br-2xl text-[9px] font-bold uppercase bg-amber-600 text-white shadow-md z-10 flex items-center space-x-2`}>
                {isBatchMode ? (
                  isSelected ? <CheckSquare size={12} /> : <Square size={12} className="text-white/50" />
                ) : null}
                <span className="tracking-widest">{asset.REGISTRO || '---'} / {asset.SUBREG || '---'} | {asset.TAG_INVENTARIO || (asset._conferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR)}</span>
              </div>
              
              <div className="pt-8 flex flex-col space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio:</span>
                  <span className="text-xl font-bold font-mono tracking-tighter text-slate-900">{formatEtiqueta(asset.ETIQUETA)}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-600 uppercase leading-relaxed tracking-tight line-clamp-3 italic">{fullDescription}</p>
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

      {/* BARRA DE AÇÃO LOTE EMPLAQUETAR */}
      {isBatchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-6 right-6 z-50 animate-slideUp">
           <div className="bg-amber-600 p-5 rounded-[2.5rem] shadow-2xl flex items-center justify-between border border-white/20 backdrop-blur-sm">
              <div className="flex items-center space-x-4">
                 <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white font-mono font-bold text-lg shadow-inner">{selectedIds.size}</div>
                 <div className="text-white">
                   <p className="text-[11px] font-bold uppercase tracking-widest leading-none">Etiquetar em Lote</p>
                 </div>
              </div>
              <div className="flex space-x-3">
                 <button onClick={() => setSelectedIds(new Set())} className="p-4 bg-black/20 text-white rounded-2xl active:scale-90 transition-all"><X size={20} /></button>
                 <button onClick={handleBatchConfirm} className="px-8 py-4 bg-white text-amber-600 rounded-2xl text-[11px] font-bold uppercase tracking-widest shadow-xl active:scale-95 transition-all">Conferir</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default Labeling;
