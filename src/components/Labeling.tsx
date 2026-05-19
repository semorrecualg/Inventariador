
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Asset, TagInventario, ScannerMode, ScanFeedbackMode } from '../types';
import Scanner from './Scanner';
import BackButton from './BackButton';
import { extractEtiquetaFromQrData } from '../utils/qrUtils';
import { parseAssetDate, formatMonthYearBR, formatEtiqueta } from '../utils/formatUtils';
import { Virtuoso } from 'react-virtuoso';
import { localDb } from '../services/localDbService';

import { 
  Check,
  Filter,
  Trash2,
  ListChecks,
  Square,
  CheckSquare,
  X,
  Camera,
} from 'lucide-react';

interface LabelingProps {
  assets: Asset[];
  selectedUnit?: string;
  onBack: () => void;
  onUpdateAsset: (asset: Asset) => void;
  onBulkUpdateAssets: (ids: string[], updates?: Partial<Asset>) => void;
  onSelectAsset: (asset: Asset) => void;
  uniqueCentrosDeCusto: string[];
  scannerMode: ScannerMode;
  onUpdateScannerMode: (mode: ScannerMode) => void;
  scanFeedbackMode: ScanFeedbackMode;
}

const Labeling: React.FC<LabelingProps> = ({ assets: initialAssets, selectedUnit, onBack, onUpdateAsset, onBulkUpdateAssets, onSelectAsset, scannerMode, onUpdateScannerMode, scanFeedbackMode }) => {
  const [dbAssets, setDbAssets] = useState<Asset[]>([]);
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

  // GBR v25: Carregamento Direto via SQLite (Regra de Negócio Estrita)
  useEffect(() => {
    const fetchAssets = async () => {
      if (!selectedUnit) return;
      try {
        const results = await localDb.assets.getLabelingAssets(selectedUnit);
        setDbAssets(results);
      } catch (error) {
        console.error("Erro ao caragmapeamento de etiquetas:", error);
      }
    };
    fetchAssets();
  }, [selectedUnit, initialAssets]); // Recarregar se a base master mudar ou unidade mudar

  const normalize = (s: string) => s?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, '').trim() || '';

  const assetsToLabel = useMemo(() => {
    // Se temos dbAssets (carregados via query), usamos eles. Caso contrário fallback no props.
    const source = dbAssets.length > 0 ? dbAssets : initialAssets;
    
    return source.filter(a => 
      String(a.ETIQUETA || '').toUpperCase() === 'ETIQUETAR'
    );
  }, [dbAssets, initialAssets]);

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
        const ad = parseAssetDate(a.DATAAQUISIC);
        if (!ad) return false;
        if (start && ad < start) return false;
        if (end && ad > end) return false;
        return true;
      });
    }

    // GBR v25: Ordenação Absoluta por CENTRODECUSTO ASC (Query UI fallback)
    return base.sort((a, b) => 
      String(a.CENTRODECUSTO || '').localeCompare(String(b.CENTRODECUSTO || ''), undefined, { numeric: true })
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
        return { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-400', hex: '#a78bfa' };
      case TagInventario.FALTA_ETIQUETAR: 
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-400', hex: '#fbbf24' };
      default:
        return { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-400', hex: '#94a3b8' };
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn overflow-hidden">
      {/* Header Fixo Blindado */}
      <div className="bg-white border-b border-slate-200 px-6 pt-12 pb-6 sticky top-0 z-50 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={onBack}
            className="flex items-center space-x-3 group"
          >
            <div className="p-3 bg-slate-50 text-slate-800 rounded-2xl group-active:scale-90 transition-all border border-slate-100 shadow-sm">
              <ArrowLeft size={20} strokeWidth={3} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Voltar</p>
              <p className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">Etiquetagem</p>
            </div>
          </button>

          <div className="flex space-x-2">
            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-3 rounded-xl border transition-all shadow-sm active:scale-95 ${isFilterOpen ? 'bg-accent text-white' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <Filter size={20} />
            </button>
            <button onClick={() => { setIsBatchMode(!isBatchMode); setSelectedIds(new Set()); }} className={`p-3 rounded-xl border transition-all shadow-sm active:scale-95 ${isBatchMode ? 'bg-amber-400 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <ListChecks size={20} />
            </button>
          </div>
        </div>

        <div className="flex space-x-2">
          <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeTab === 'pending' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Pendentes</button>
          <button onClick={() => setActiveTab('checked')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeTab === 'checked' ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Concluídos</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-bg-main relative">
        {isFilterOpen && (
          <div className="p-6 bg-white border-b border-slate-100 shadow-sm shrink-0">
            <div className="space-y-4">
               <div>
                 <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Critério de Busca</label>
                 <div className="relative">
                   <input 
                     type="text" 
                     value={advDesc} 
                     onChange={(e) => setAdvDesc(e.target.value)} 
                     placeholder="PESQUISAR..." 
                     className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-[11px] font-bold uppercase text-slate-900 outline-none focus:border-accent" 
                   />
                   <button 
                     onClick={() => setIsScannerOpen(true)}
                     className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-accent text-white rounded-xl shadow-lg"
                   >
                     <Camera size={18} />
                   </button>
                 </div>
               </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <Virtuoso
            style={{ height: '100%' }}
            data={filteredAssets}
            components={{
              Footer: () => <div className="h-32" />
            }}
            itemContent={(index, asset) => {
              const isSelected = selectedIds.has(String(asset.id));
              const fullDescription = [asset.QT || '1', asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO', asset.SERIAL || 'S/N', formatMonthYearBR(asset.DATAAQUISIC), asset.NOMEFORNECEDOR || 'FORNECEDOR N/I'].join('; ');

              const isConferido = !!asset._conferido;
              const tagDisplay = asset.TAG_INVENTARIO || (isConferido ? TagInventario.ETIQUETADO : TagInventario.FALTA_ETIQUETAR);
              const colors = getColors(tagDisplay);

              const statusUpper = String(asset.STATUS || '').toUpperCase();
              const isBaixado = statusUpper.includes('BAIXA') || !!asset.DATABAIXA;

              return (
                <div className="px-6 py-2">
                  <div 
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
                        {asset._photoUrl && (
                          <div className="bg-amber-100 p-1 rounded-lg animate-pulse">
                            <Camera size={12} className="text-amber-600" />
                          </div>
                        )}
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
                      }} className="absolute bottom-6 right-6 w-14 h-14 bg-accent text-white rounded-2xl flex items-center justify-center shadow-xl shadow-accent/20 active:scale-90 transition-all">
                        <Check size={32} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>

      <footer className="bg-slate-900 px-6 py-4 text-center border-t border-white/5 shrink-0">
        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">GBR KARDEK • MOBILE SOBERANO</p>
      </footer>

      {/* REMOVIDO BARRA INFERIOR PARA EVITAR SCROLL */}
      {isScannerOpen && (
        <Scanner 
          mode={scannerMode}
          onModeChange={onUpdateScannerMode}
          onScan={(result) => {
            const extracted = extractEtiquetaFromQrData(result);
            setAdvDesc(extracted);
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
