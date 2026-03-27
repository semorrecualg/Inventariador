
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { formatCurrency } from '../utils/formatUtils';
import { 
  ArrowLeft, 
  Search, 
  TrendingDown, 
  AlertTriangle, 
  Calendar, 
  FileText,
  ChevronRight,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImpairmentReportProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const ImpairmentReport: React.FC<ImpairmentReportProps> = ({ assets, onBack, onSelectAsset }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const impairmentAssets = useMemo(() => {
    return assets.filter(a => 
      (Number(a._perda_impairment || 0) > 0 || a._data_impairment) &&
      !a._is_deleted
    ).sort((a, b) => {
      const dateA = a._data_impairment ? new Date(a._data_impairment).getTime() : 0;
      const dateB = b._data_impairment ? new Date(b._data_impairment).getTime() : 0;
      return dateB - dateA;
    });
  }, [assets]);

  const filteredAssets = useMemo(() => {
    if (!searchTerm) return impairmentAssets;
    const term = searchTerm.toLowerCase();
    return impairmentAssets.filter(a => 
      String(a.ETIQUETA || '').toLowerCase().includes(term) ||
      String(a.DESCRICAODOATIVO || '').toLowerCase().includes(term) ||
      String(a.CONTACONTABIL || '').toLowerCase().includes(term)
    );
  }, [impairmentAssets, searchTerm]);

  const totalLoss = useMemo(() => {
    return impairmentAssets.reduce((acc, a) => acc + Number(a._perda_impairment || 0), 0);
  }, [impairmentAssets]);

  const exportToExcel = () => {
    const data = impairmentAssets.map(a => ({
      'Etiqueta': a.ETIQUETA,
      'Descrição': a.DESCRICAODOATIVO,
      'Conta Contábil': a.CONTACONTABIL,
      'Vlr Aquisição': a._valor_aquisicao || a.VLRAQUISIC,
      'Depr. Acumulada': a._depreciacao_acumulada || 0,
      'Vlr Contábil': (Number(a._valor_aquisicao || 0) || Number(a.VLRAQUISIC || 0)) - Number(a._depreciacao_acumulada || 0),
      'Vlr Recuperável': a._valor_recuperavel || 0,
      'Perda Impairment': a._perda_impairment || 0,
      'Data Teste': a._data_impairment ? new Date(a._data_impairment).toLocaleDateString('pt-BR') : '---'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Impairment");
    XLSX.writeFile(wb, `Relatorio_Impairment_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn">
      {/* HEADER */}
      <div className="bg-white border-b border-border px-4 py-6 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="p-2 -ml-2 text-ink active:scale-90 transition-all">
            <ArrowLeft size={24} />
          </button>
          <div className="text-center flex-1">
            <h2 className="text-sm font-black text-ink uppercase tracking-[0.2em]">Relatório de Impairment</h2>
            <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mt-1">CPC 01 / IAS 36</p>
          </div>
          <button 
            onClick={exportToExcel}
            className="p-2 bg-accent/10 text-accent rounded-xl active:scale-90 transition-all"
            title="Exportar Excel"
          >
            <Download size={20} />
          </button>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
            <div className="flex items-center space-x-2 mb-1">
              <FileText size={12} className="text-slate-400" />
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Ativos Testados</span>
            </div>
            <p className="text-lg font-black text-slate-900">{impairmentAssets.length}</p>
          </div>
          <div className="bg-red-50 border border-red-100 p-3 rounded-2xl">
            <div className="flex items-center space-x-2 mb-1">
              <TrendingDown size={12} className="text-red-400" />
              <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest">Total de Perdas</span>
            </div>
            <p className="text-lg font-black text-red-600">{formatCurrency(totalLoss)}</p>
          </div>
        </div>

        {/* SEARCH */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
          <input 
            type="text"
            placeholder="BUSCAR POR ETIQUETA, DESCRIÇÃO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-bg-main border border-border rounded-2xl text-[10px] font-bold uppercase tracking-widest outline-none focus:border-accent transition-all"
          />
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
            <AlertTriangle size={48} className="mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest">Nenhum registro encontrado</p>
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <button 
              key={asset.id}
              onClick={() => onSelectAsset(asset)}
              className="w-full bg-white border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-all shadow-sm hover:border-accent"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-[10px] font-black text-ink uppercase tracking-tighter font-mono bg-bg-main px-2 py-1 rounded-md border border-border">
                    {asset.ETIQUETA}
                  </span>
                  <h3 className="text-[11px] font-bold text-ink uppercase mt-2 line-clamp-1">{asset.DESCRICAODOATIVO}</h3>
                </div>
                {Number(asset._perda_impairment || 0) > 0 && (
                  <div className="bg-red-100 text-red-700 px-2 py-1 rounded-lg flex items-center space-x-1">
                    <TrendingDown size={10} />
                    <span className="text-[9px] font-black uppercase">PERDA</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-dashed border-border pt-3">
                <div>
                  <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest mb-1">Vlr Contábil</p>
                  <p className="text-[10px] font-bold text-ink">
                    {formatCurrency((Number(asset._valor_aquisicao || 0) || Number(asset.VLRAQUISIC || 0)) - Number(asset._depreciacao_acumulada || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-[7px] font-bold text-ink-muted uppercase tracking-widest mb-1">Perda Reconhecida</p>
                  <p className={`text-[10px] font-black ${Number(asset._perda_impairment || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(asset._perda_impairment || 0)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar size={10} className="text-ink-muted" />
                  <span className="text-[8px] font-bold text-ink-muted uppercase">
                    {asset._data_impairment ? new Date(asset._data_impairment).toLocaleDateString('pt-BR') : '---'}
                  </span>
                </div>
                <ChevronRight size={14} className="text-ink-muted" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ImpairmentReport;
