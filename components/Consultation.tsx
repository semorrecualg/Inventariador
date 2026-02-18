
import React, { useState, useMemo, useRef } from 'react';
import { Asset } from '../types';
import { 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Barcode,
  Keyboard,
  AlertCircle,
  Filter
} from 'lucide-react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = useMemo(() => {
    if (!committedSearch) return [];
    const term = committedSearch.toUpperCase().trim();
    
    return assets.filter(asset => {
      const etq = String(asset.ETIQUETA || '').toUpperCase();
      const desc = String(asset.DESCRICAODOATIVO || '').toUpperCase();
      const sn = String(asset.SERIAL || '').toUpperCase();
      const nf = String(asset.NOTAFISCAL || '').toUpperCase();
      
      return etq.includes(term) || desc.includes(term) || sn.includes(term) || nf.includes(term);
    }).sort((a, b) => String(a.ETIQUETA || '').localeCompare(String(b.ETIQUETA || ''), undefined, { numeric: true }))
      .slice(0, 50);
  }, [assets, committedSearch]);

  const triggerSearch = (val: string) => {
    setCommittedSearch(val);
    searchInputRef.current?.blur();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 animate-fadeIn relative overflow-hidden">
      <div className="bg-slate-900 px-6 pt-12 pb-6 border-b border-slate-800 relative z-20">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center space-x-1.5 text-slate-500 font-black text-[9px] uppercase tracking-widest active:text-indigo-400 transition-colors">
            <ArrowLeft size={14} /> <span>Voltar</span>
          </button>
          
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-900/20 text-indigo-400 border border-indigo-500/20">
            <Filter size={10} />
            <span className="text-[7px] font-black uppercase tracking-widest">Alfanumérico v23</span>
          </div>
        </div>

        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tighter leading-none italic">Consulta Expert</h1>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Fragmento de Etiqueta ou Serial</p>
          </div>
        </div>

        <div className="relative">
          <input 
            ref={searchInputRef}
            type="text" 
            value={displayValue} 
            onChange={(e) => setDisplayValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && triggerSearch(displayValue)}
            className="w-full pl-6 pr-20 py-5 text-2xl font-black font-mono uppercase outline-none border-2 border-slate-800 bg-slate-950 rounded-[2rem] focus:border-indigo-600 transition-all text-white shadow-inner"
            placeholder="ETIQUETA..."
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <button onClick={() => triggerSearch(displayValue)} className="w-14 h-14 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg active:scale-95 transition-all"><Search size={22} strokeWidth={3} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 no-scrollbar pb-24">
        {committedSearch ? (
          filteredAssets.length > 0 ? (
            <div className="space-y-2">
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest px-2">Localizados: {filteredAssets.length}</span>
              {filteredAssets.map((asset) => (
                <button key={asset.id} onClick={() => onSelectAsset(asset)} className="w-full flex items-center p-4 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-sm active:bg-indigo-950 transition-all text-left">
                  <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-indigo-500 mr-4 shrink-0 border border-slate-800"><Barcode size={24} /></div>
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="text-[16px] font-black text-white font-mono leading-none block mb-1">{asset.ETIQUETA || 'S/ ETQ'}</span>
                    <p className="text-[9px] font-bold text-slate-500 uppercase truncate italic">
                      {asset.DESCRICAODOATIVO || 'SEM DESCRIÇÃO'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-slate-700" />
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center py-20">
              <AlertCircle size={36} className="text-slate-500 mb-2" />
              <p className="text-[9px] font-black text-slate-400 uppercase">Nenhum ativo contém este termo v23</p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
            <Keyboard size={32} className="text-slate-800 mb-3" />
            <p className="text-[8px] font-black text-slate-700 uppercase tracking-[0.2em]">Pesquise por Etiqueta, Descrição ou Serial</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Consultation;
