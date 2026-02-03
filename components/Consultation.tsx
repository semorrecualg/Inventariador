
import React, { useState, useMemo, useRef } from 'react';
import { Asset } from '../types';
import { Search, ChevronRight, Hash, X, ArrowLeft, Check } from 'lucide-react';

interface ConsultationProps {
  assets: Asset[];
  onBack: () => void;
  onSelectAsset: (asset: Asset) => void;
}

const Consultation: React.FC<ConsultationProps> = ({ assets, onBack, onSelectAsset }) => {
  const [inputValue, setInputValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const plaquetaTerms = ['plaqueta', 'patrimonio', 'registro', 'codigo', 'etiqueta', 'tag', 'bem', 'numero', 'nÚmero'];
  const descriptionFieldTerms = ['desc_sintetica', 'sintetica', 'descricao', 'desc_item', 'nome'];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      setInputValue('');
      return;
    }
    const digits = raw.length > 6 ? raw.slice(-6) : raw;
    const masked = digits.padStart(6, '0');
    setInputValue(masked);
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
    if (!inputValue || inputValue.trim() === '') return [];
    
    return assets.filter(asset => {
      const plaqueta = getRobustValue(asset, plaquetaTerms) || "";
      return plaqueta.toUpperCase() === inputValue;
    }).slice(0, 50);
  }, [assets, inputValue]);

  const getItemDescription = (asset: Asset) => {
    const keys = Object.keys(asset);
    const match = keys.find(k => descriptionFieldTerms.some(term => k.toLowerCase().includes(term.toLowerCase())));
    return match ? String(asset[match]).toUpperCase() : 'SEM DESCRIÇÃO';
  };

  return (
    <div className="flex flex-col h-full bg-white animate-fadeIn">
      <div className="p-6 pb-2">
        <button onClick={onBack} className="mb-4 text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center space-x-1">
          <ArrowLeft size={10} /> <span>Menu Principal</span>
        </button>
        <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-6">Consulta Rápida</h2>
        
        {/* CAMPO DE CONSULTA PROFISSIONAL - AZUL & ARREDONDADO */}
        <div className="relative mb-6 group">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10">
            <Search className="text-blue-300 group-focus-within:text-blue-600 transition-colors" size={28} />
          </div>
          <input 
            ref={searchInputRef}
            type="text" 
            inputMode="numeric"
            placeholder="000000"
            value={inputValue} 
            onChange={handleInputChange}
            className="w-full pl-16 pr-12 py-7 text-4xl font-black uppercase outline-none border-2 border-blue-50 bg-blue-50 rounded-[2.5rem] focus:border-blue-500 focus:bg-white transition-all tracking-tighter text-blue-900 placeholder:text-blue-100 shadow-inner"
            autoFocus
          />
          {inputValue && (
            <button 
              onClick={() => setInputValue('')} 
              className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-200 hover:text-red-500 transition-colors"
            >
              <X size={28} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10">
        {inputValue ? (
          filteredAssets.length > 0 ? (
            <div className="space-y-1">
              {filteredAssets.map((asset) => {
                const plaquetaLabel = getRobustValue(asset, plaquetaTerms) || String(asset.id);
                const desc = getItemDescription(asset);
                const isConferido = !!asset._conferido;

                return (
                  <div 
                    key={asset.id} 
                    onClick={() => onSelectAsset(asset)} 
                    className="flex items-center justify-between py-5 border-b border-gray-50 active:bg-gray-50 group transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center space-x-2 mb-1">
                        <Hash size={12} className="text-blue-500" strokeWidth={3} />
                        <span className="text-base font-black text-black tracking-tighter leading-none">{plaquetaLabel}</span>
                        {isConferido && (
                           <div className="bg-emerald-100 p-1 rounded-md">
                             <Check size={10} className="text-emerald-700" strokeWidth={4} />
                           </div>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-gray-700 uppercase truncate tracking-tight leading-relaxed">{desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-200 group-hover:text-blue-500 transition-colors" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Ativo Não Localizado</p>
            </div>
          )
        ) : (
          <div className="py-24 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <Search size={32} className="text-gray-200" />
            </div>
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] px-12 leading-loose">
              Pesquise pelo código patrimonial para visualizar detalhes e histórico do ativo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Consultation;
