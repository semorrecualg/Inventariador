
import React, { useState, useMemo } from 'react';
import { Trash2, RotateCcw, Search, ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Asset } from '../types';
import { formatCurrency } from '../utils/formatUtils';

interface SoftDeleteReportProps {
  assets: Asset[];
  onBack: () => void;
  onRestore: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  isAdmin: boolean;
}

const SoftDeleteReport: React.FC<SoftDeleteReportProps> = ({ 
  assets, 
  onBack, 
  onRestore, 
  onPermanentDelete,
  isAdmin 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState<string>('ALL');

  const deletedAssets = useMemo(() => {
    return assets.filter(a => a._is_deleted === true);
  }, [assets]);

  const filteredAssets = useMemo(() => {
    return deletedAssets.filter(a => {
      const matchesSearch = 
        String(a.etiqueta || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(a.descricaodoativo || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesUnit = filterUnit === 'ALL' || (a.filial) === filterUnit;
      
      return matchesSearch && matchesUnit;
    });
  }, [deletedAssets, searchTerm, filterUnit]);

  const uniqueUnits = useMemo(() => {
    const units = new Set(deletedAssets.map(a => a.filial).filter(Boolean));
    return Array.from(units) as string[];
  }, [deletedAssets]);

  const totalValue = useMemo(() => {
    return filteredAssets.reduce((sum, a) => sum + Number(a._valor_aquisicao || 0), 0);
  }, [filteredAssets]);

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn">
      {/* Header */}
      <div className="bg-white border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-bg-main rounded-xl transition-all active:scale-90"
          >
            <ArrowLeft className="w-5 h-5 text-ink" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-ink uppercase tracking-tight">Itens para Baixa</h2>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Auditoria de Soft-Delete</p>
          </div>
        </div>
        <div className="bg-red-50 px-3 py-1 rounded-full border border-red-100">
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
            {deletedAssets.length} Pendentes
          </span>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-px bg-border border-b border-border">
        <div className="bg-white p-4 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1">Total de Itens</span>
          <span className="text-xl font-bold text-ink">{filteredAssets.length}</span>
        </div>
        <div className="bg-white p-4 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest mb-1">Valor em Risco</span>
          <span className="text-xl font-bold text-red-600">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input 
            type="text"
            placeholder="BUSCAR POR ETIQUETA OU DESCRIÇÃO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-2xl text-[11px] font-bold uppercase tracking-widest outline-none focus:border-accent transition-all shadow-sm"
          />
        </div>
        
        <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
          <button 
            onClick={() => setFilterUnit('ALL')}
            className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${filterUnit === 'ALL' ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-white text-ink-muted border-border'}`}
          >
            Todas Unidades
          </button>
          {uniqueUnits.map(unit => (
            <button 
              key={unit}
              onClick={() => setFilterUnit(unit)}
              className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${filterUnit === unit ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-white text-ink-muted border-border'}`}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-border">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink uppercase">Nenhum item pendente</p>
              <p className="text-[10px] text-ink-muted uppercase tracking-widest mt-1">Sua base de baixas está saneada.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssets.map(asset => (
              <div 
                key={asset.id}
                className="bg-white rounded-3xl border border-border p-4 shadow-sm hover:border-accent/30 transition-all group"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest mb-0.5">
                      {asset.etiqueta || 'SEM ETIQUETA'}
                    </span>
                    <h4 className="text-xs font-bold text-ink uppercase leading-tight line-clamp-2">
                      {asset.descricaodoativo}
                    </h4>
                  </div>
                  <div className="bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest block mb-1">Unidade</span>
                    <span className="text-[10px] font-bold text-ink uppercase">{asset.filial}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest block mb-1">Valor de Custo</span>
                    <span className="text-[10px] font-bold text-ink uppercase">{formatCurrency(asset._valor_aquisicao || 0)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-dashed border-border">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">Motivo da Baixa</span>
                    <span className="text-[9px] font-bold text-red-600 uppercase italic">
                      {asset._history?.find(h => h.action === 'DELETE')?.details || 'Não especificado'}
                    </span>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => onRestore(String(asset.id))}
                      className="flex items-center space-x-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restaurar</span>
                    </button>
                    {isAdmin && onPermanentDelete && (
                      <button 
                        onClick={() => onPermanentDelete(String(asset.id))}
                        className="flex items-center space-x-2 bg-red-600 text-white px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-red-700 shadow-lg shadow-red-200 active:scale-95 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Confirmar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4 flex items-center justify-center space-x-2 z-20">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest text-center">
          A confirmação de baixa é irreversível e deve ser conciliada com o ERP.
        </p>
      </div>
    </div>
  );
};

export default SoftDeleteReport;
