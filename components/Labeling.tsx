
import React, { useState, useMemo, useCallback } from 'react';
import { Asset } from '../types';
import Scanner from './Scanner';
import { 
  ArrowLeft, 
  Check,
  Keyboard, 
  Zap, 



  Filter,

  Briefcase,
  MapPin,
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

const Labeling: React.FC<LabelingProps> = ({ assets, onBack, onBulkUpdateAssets, onSelectAsset }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'checked'>('pending');
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'scanner'>('keyboard');
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
      normalize(a.ETIQUETA || '') === 'ETIQUETAR' || 
      a.TAG_INVENTARIO === 'FALTA ETIQUETAR'
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
      onBulkUpdateAssets(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsBatchMode(false);
    }
  };

  const handleConfirmAllFiltered = () => {
    const ids = filteredAssets.filter(a => !a._conferido).map(a => String(a.id));
    if (ids.length === 0) return;
    if (confirm(`Deseja emplaquetar TODOS os ${ids.length} itens desta busca?`)) {
      onBulkUpdateAssets(ids);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-fadeIn overflow-hidden">
      <div className="px-6 pt-10 pb-4 bg-slate-900 border-b border-slate-800 shadow-2xl relative z-30">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center space-x-2 text-slate-500 font-black text-[10px] uppercase tracking-widest active:text-amber-500">
            <ArrowLeft size={16} /> <span>Menu Principal</span>
          </button>
          <div className="flex space-x-1.5">
            <button onClick={() => setIsBatchMode(!isBatchMode)} className={`p-2 rounded-lg border transition-all ${isBatchMode ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-900/40' : 'border-slate-800 text-slate-600'}`}>
              <ListChecks size={14} />
            </button>
            <button onClick={() => setInputMethod('keyboard')} className={`p-2 rounded-lg border ${inputMethod === 'keyboard' ? 'bg-amber-600 text-white border-amber-500 shadow-lg' : 'text-slate-600 border-slate-800'}`}><Keyboard size={14} /></button>
            <button onClick={() => { setInputMethod('scanner'); setIsScannerOpen(true); }} className={`p-2 rounded-lg border ${inputMethod === 'scanner' ? 'bg-amber-600 text-white border-amber-500 shadow-lg' : 'text-slate-600 border-slate-800'}`}><Zap size={14} /></button>
            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-2 rounded-lg border ${isFilterOpen ? 'bg-amber-400 text-black border-amber-400 shadow-lg' : 'text-amber-600 border-amber-800'}`}><Filter size={14} /></button>
          </div>
        </div>

        <h1 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none mb-4">BENS A SEREM ETIQUETADOS</h1>

        {isFilterOpen && (
          <div className="space-y-3 mb-4 animate-slideUp bg-slate-950/60 p-4 rounded-[2rem] border border-amber-600/30 shadow-2xl">
            <div className="flex items-center justify-between mb-1 px-1">
               <span className="text-[7px] font-black uppercase text-amber-500 tracking-widest italic">Painel Inteligente</span>
               <div className="flex space-x-2">
                 {activeTab === 'pending' && filteredAssets.length > 1 && !isBatchMode && (
                    <button onClick={handleConfirmAllFiltered} className="text-[7px] font-black text-emerald-500 uppercase tracking-widest px-2.5 py-1.5 bg-emerald-500/10 rounded-lg active:scale-95 transition-all">Conferir Todos</button>
                 )}
                 <button onClick={() => { setAdvDesc(''); setAdvCC(''); setAdvSupplier(''); setAdvDateStart(''); setAdvDateEnd(''); }} className="flex items-center space-x-1 text-[7px] font-black text-red-500 uppercase tracking-widest px-2.5 py-1.5 bg-red-500/10 rounded-lg active:scale-95 transition-all">
                   <Trash2 size={8} /> <span>Limpar</span>
                 </button>
               </div>
            </div>

            <div>
              <label className="text-[7px] font-black uppercase text-slate-500 tracking-widest ml-1 mb-1 block">Busca (Descrição/Serial/NF/Reg)</label>
              <input type="text" value={advDesc} onChange={(e) => setAdvDesc(e.target.value)} placeholder="PESQUISAR..." className="w-full bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-[9px] font-black uppercase text-white outline-none focus:border-amber-500 shadow-inner" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[7px] font-black uppercase text-slate-500 tracking-widest ml-1 mb-1 block">Centro de Custo</label>
                <select value={advCC} onChange={(e) => setAdvCC(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-[8px] font-black uppercase text-white outline-none">
                  <option value="">TODOS</option>
                  {restrictedCentrosDeCusto.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[7px] font-black uppercase text-slate-500 tracking-widest ml-1 mb-1 block">Fornecedor</label>
                <select value={advSupplier} onChange={(e) => setAdvSupplier(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-[8px] font-black uppercase text-white outline-none">
                  <option value="">TODOS</option>
                  {restrictedSuppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="flex space-x-2">
          <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeTab === 'pending' ? 'bg-amber-600 text-white border-amber-600 shadow-xl' : 'text-slate-600 border-slate-800'}`}>Pendentes</button>
          <button onClick={() => setActiveTab('checked')} className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${activeTab === 'checked' ? 'bg-white text-slate-950 border-white shadow-xl' : 'text-slate-600 border-slate-800'}`}>Etiquetados</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar pb-32 bg-slate-950">
        {filteredAssets.map(asset => {
          const isSelected = selectedIds.has(String(asset.id));
          const fullDescription = [asset.QT || '1', asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO', asset.SERIAL || 'S/N', formatMonthYearBR(asset.DATAAQUSIC), asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'].join('; ');

          return (
            <div 
              key={asset.id} 
              onClick={() => isBatchMode ? toggleSelect(String(asset.id)) : onSelectAsset(asset)} 
              className={`p-6 border rounded-[2.2rem] relative overflow-hidden transition-all bg-slate-900 border-slate-800 active:scale-[0.98] shadow-lg ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
            >
              <div className={`absolute top-0 left-0 px-4 py-1 rounded-br-[1.2rem] text-[8px] font-black uppercase bg-amber-600 text-white shadow-md z-10 flex items-center space-x-2`}>
                {isBatchMode ? (
                  isSelected ? <CheckSquare size={10} /> : <Square size={10} className="text-white/50" />
                ) : null}
                <span>{asset.REGISTRO || '---'} / {asset.SUBREG || '---'} | {asset.TAG_INVENTARIO || (asset._conferido ? 'ETIQUETADO' : 'FALTA ETIQUETAR')}</span>
              </div>
              
              <div className="pt-6 flex flex-col space-y-2.5">
                <div className="flex items-center space-x-1.5 mb-0.5">
                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Patrimônio:</span>
                  <span className="text-lg font-black font-data tracking-tighter text-white">{formatEtiqueta(asset.ETIQUETA)}</span>
                </div>
                <p className="text-[10px] font-bold text-slate-200 uppercase italic leading-tight tracking-tight line-clamp-4">{fullDescription}</p>
                <div className="bg-slate-950/50 p-3 rounded-[1.5rem] space-y-1.5 border border-slate-800 shadow-inner">
                  <div className="flex items-center space-x-2">
                    <MapPin size={10} className="text-amber-500 shrink-0" />
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tight truncate">{asset.ENDERECO || 'LOCAL NÃO INFORMADO'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Briefcase size={10} className="text-sky-500 shrink-0" />
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tight truncate">{asset.CENTRODECUSTO || 'C. CUSTO NÃO INFORMADO'}</span>
                  </div>
                </div>
              </div>

              {!asset._conferido && !isBatchMode && (
                <button onClick={(e) => { e.stopPropagation(); onBulkUpdateAssets([String(asset.id)]); }} className="absolute bottom-5 right-5 w-12 h-12 bg-amber-600 text-white rounded-2xl flex items-center justify-center shadow-2xl border-b-4 border-amber-800 active:scale-90">
                  <Check size={28} strokeWidth={4} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* BARRA DE AÇÃO LOTE EMPLAQUETAR */}
      {isBatchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-6 right-6 z-50 animate-slideUp">
           <div className="bg-amber-600 p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between border-t border-white/20">
              <div className="flex items-center space-x-3">
                 <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-data font-black">{selectedIds.size}</div>
                 <div className="text-white">
                   <p className="text-[10px] font-black uppercase tracking-widest leading-none">Etiquetar em Lote</p>
                 </div>
              </div>
              <div className="flex space-x-2">
                 <button onClick={() => setSelectedIds(new Set())} className="p-3 bg-black/20 text-white rounded-xl active:scale-90"><X size={20} /></button>
                 <button onClick={handleBatchConfirm} className="px-6 py-3 bg-white text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95">Conferir</button>
              </div>
           </div>
        </div>
      )}

      {isScannerOpen && <Scanner onBack={() => setIsScannerOpen(false)} onScanSuccess={(text) => { setAdvDesc(text.toUpperCase()); setIsScannerOpen(false); }} />}
    </div>
  );
};

export default Labeling;
