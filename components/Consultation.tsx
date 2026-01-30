
import React, { useState, useMemo } from 'react';
import { Asset } from '../types';
import { Search, ChevronRight, Hash, X, ArrowLeft, Database } from 'lucide-react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset }) => {
  const [inputValue, setInputValue] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');

  const plaquetaTerms = ['plaqueta', 'patrimonio', 'registro', 'codigo', 'etiqueta', 'tag', 'bem', 'numero', 'nÚmero'];
  const descriptionFieldTerms = ['desc_sintetica', 'sintetica', 'descricao', 'desc_item', 'nome'];
  const indiceTerms = ['indice', 'índice'];

  const getItemDescription = (asset: Asset) => {
    const keys = Object.keys(asset);
    const match = keys.find(k => descriptionFieldTerms.some(term => k.toLowerCase().includes(term.toLowerCase())));
    return match ? String(asset[match]).toUpperCase() : 'SEM DESCRIÇÃO';
  };

  const getRobustValue = (asset: Asset, terms: string[]) => {
    const keys = Object.keys(asset);
    for (const term of terms) {
      const match = keys.find(k => k.toLowerCase().includes(term.toLowerCase()));
      if (match && asset[match]) return String(asset[match]).toUpperCase();
    }
    return null;
  };

  const filteredAssets = useMemo(() => {
    if (!activeSearchTerm || activeSearchTerm.trim() === '') return [];
    const lowerSearch = activeSearchTerm.toLowerCase();
    
    return assets.filter(asset => {
      const plaqueta = getRobustValue(asset, plaquetaTerms) || "";
      return plaqueta.toLowerCase() === lowerSearch || plaqueta.toLowerCase().includes(lowerSearch);
    });
  }, [assets, activeSearchTerm]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveSearchTerm(inputValue.trim());
  };

  const clearSearch = () => {
    setInputValue('');
    setActiveSearchTerm('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 animate-fadeIn">
      <div className="p-6 bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-3 bg-gray-100 rounded-2xl text-gray-500 hover:text-blue-600 transition-all active:scale-90">
            <ArrowLeft size={20} />
          </button>
          <form onSubmit={handleSearch} className="flex-1 relative group">
            <input 
              type="text" 
              placeholder="NÚMERO DA PLAQUETA..."
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              className="w-full pl-6 pr-14 py-4 bg-gray-50 rounded-[1.5rem] text-sm border-2 border-transparent outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white font-black uppercase placeholder:text-gray-300 transition-all shadow-inner"
              autoFocus
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
              {inputValue && (
                <button 
                  type="button"
                  onClick={clearSearch}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
              <button 
                type="submit"
                className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-transform"
              >
                <Search size={20} />
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {activeSearchTerm ? (
          filteredAssets.length > 0 ? (
            <div className="space-y-4 pb-32">
              <p className="px-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{filteredAssets.length} resultados</p>
              {filteredAssets.map((asset) => {
                const plaquetaLabel = getRobustValue(asset, plaquetaTerms) || String(asset.id);
                const indiceLabel = getRobustValue(asset, indiceTerms) || "---";
                const desc = getItemDescription(asset);
                const isConferido = !!asset._conferido;

                return (
                  <div 
                    key={asset.id} 
                    onClick={() => onSelectAsset(asset)} 
                    className={`rounded-[2.5rem] shadow-sm border-2 transition-all cursor-pointer overflow-hidden group active:scale-[0.98] ${isConferido ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-100'}`}
                  >
                    <div className="p-6 flex items-start justify-between">
                      <div className="flex space-x-5 flex-1 min-w-0">
                        <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-inner ${isConferido ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-500'}`}>
                          <Hash size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span className={`${isConferido ? 'bg-emerald-600' : 'bg-amber-500'} text-white text-[7px] font-black px-2 py-0.5 rounded-full shadow-sm uppercase tracking-widest`}>
                              {isConferido ? 'CONFERIDO' : 'PENDENTE'}
                            </span>
                          </div>
                          <div className="flex items-end justify-between mb-1">
                             <h4 className="text-xl font-black text-gray-900 tracking-tight truncate leading-none">{plaquetaLabel}</h4>
                             <div className="flex flex-col items-end">
                                <span className="text-[6px] font-black text-gray-400 uppercase">Índice</span>
                                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 rounded-lg border border-blue-100">{indiceLabel}</span>
                             </div>
                          </div>
                          <p className={`text-[10px] font-black leading-tight line-clamp-2 uppercase ${isConferido ? 'text-emerald-700' : 'text-gray-500'}`}>{desc}</p>
                        </div>
                      </div>
                      <div className="w-10 h-10 flex items-center justify-center text-gray-300 group-hover:text-blue-500 transition-all self-center"><ChevronRight size={20} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-10 py-20">
              <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center mb-6 text-gray-200 shadow-xl border border-gray-50">
                 <Search size={48} className="opacity-20 text-blue-500" />
              </div>
              <h3 className="text-lg font-black text-gray-900 uppercase mb-2">Nada Encontrado</h3>
              <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest leading-relaxed">
                Nenhum registro com a plaqueta "{activeSearchTerm}".
              </p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-10 py-20 animate-fadeIn">
            <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center mb-6 text-gray-200 shadow-xl border border-gray-50">
               <Database size={48} className="opacity-20 text-blue-500" />
            </div>
            <h3 className="text-lg font-black text-gray-900 uppercase mb-2">Consulta de Plaqueta</h3>
            <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest leading-relaxed">
              Digite o número da plaqueta e clique na lupa para buscar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Consultation;
